from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audit.models import RegistroAuditoria
from apps.drivers.models import Conductor
from apps.passengers.models import Passenger
from apps.reservations.models import Reservation
from apps.routes.models import Ciudad, Ruta, TipoServicio
from apps.tickets.models import Ticket
from apps.trips.models import AsignacionConductor, Viaje
from apps.users.roles import ADMINISTRADOR, CLIENTE, CONDUCTOR


class TicketValidationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = self.create_user("admin", ADMINISTRADOR)
        self.origin = Ciudad.objects.create(nombre="Origen QR", departamento="Prueba")
        destination = Ciudad.objects.create(nombre="Destino QR", departamento="Prueba")
        service = TipoServicio.objects.create(codigo="QR-TEST", nombre="Servicio QR")
        route = Ruta.objects.create(
            codigo="QR-ROUTE",
            nombre="Origen - Destino",
            origen=self.origin,
            destino=destination,
            duracion_min=60
        )
        departure = timezone.now() + timedelta(days=1)
        self.trip = Viaje.objects.create(
            codigo="QR-TRIP",
            ruta=route,
            tipo_servicio=service,
            salida_programada=departure,
            llegada_programada=departure + timedelta(hours=1),
            precio_base=Decimal("25.00"),
            creado_por=self.admin
        )
        passenger = Passenger.objects.create(
            document_number="87654321",
            first_name="Pasajero",
            last_name="QR"
        )
        reservation = Reservation.objects.create(
            trip=self.trip,
            status="CONFIRMED",
            total_amount=Decimal("25.00")
        )
        self.ticket = Ticket.objects.create(
            reservation=reservation,
            passenger=passenger,
            seat_number=7,
            price=Decimal("25.00"),
            qr_code="ticket-qr-7",
            status="PAID"
        )

    def create_user(self, username, role):
        user = get_user_model().objects.create_user(
            username=username,
            email=f"{username}@example.com",
            password="test-password"
        )
        group, _ = Group.objects.get_or_create(name=role)
        user.groups.add(group)
        return user

    def validate(self, user, qr_code="ticket-qr-7"):
        self.client.force_authenticate(user=user)
        return self.client.post("/api/tickets/validate/", {"qr_code": qr_code}, format="json")

    def test_paid_ticket_is_boarded_and_returns_trip_and_passenger(self):
        response = self.validate(self.admin)

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data["ticket"]["trip_code"], self.trip.codigo)
        self.assertEqual(response.data["ticket"]["seat_number"], 7)
        self.assertEqual(response.data["ticket"]["passenger"], "Pasajero QR")
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.status, "BOARDED")
        self.assertIsNotNone(self.ticket.boarded_at)

    def test_ticket_cannot_be_boarded_twice(self):
        self.validate(self.admin)

        response = self.validate(self.admin)

        self.assertEqual(response.status_code, 409)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.status, "BOARDED")

    def test_unpaid_ticket_is_not_boarded(self):
        self.ticket.status = "RESERVED"
        self.ticket.save(update_fields=["status"])

        response = self.validate(self.admin)

        self.assertEqual(response.status_code, 400)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.status, "RESERVED")

    def test_conductor_can_only_validate_tickets_for_assigned_trips(self):
        conductor_user = self.create_user("conductor", CONDUCTOR)
        conductor = Conductor.objects.create(
            usuario=conductor_user,
            dni="12345678",
            nombres="Conductor",
            apellidos="Asignado"
        )
        self.client.force_authenticate(user=conductor_user)

        denied = self.client.post(
            "/api/tickets/validate/",
            {"qr_code": self.ticket.qr_code},
            format="json"
        )
        self.assertEqual(denied.status_code, 403)
        self.assertTrue(
            RegistroAuditoria.objects.filter(
                accion="PERMISO_DENEGADO",
                entidad="/api/tickets/validate/",
            ).exists()
        )

        AsignacionConductor.objects.create(
            viaje=self.trip,
            conductor=conductor,
            asignado_por=self.admin
        )
        allowed = self.client.post(
            "/api/tickets/validate/",
            {"qr_code": self.ticket.qr_code},
            format="json"
        )
        self.assertEqual(allowed.status_code, 200, allowed.content)

    def test_client_role_cannot_validate_tickets(self):
        client_user = self.create_user("client", CLIENTE)

        response = self.validate(client_user)

        self.assertEqual(response.status_code, 403)
