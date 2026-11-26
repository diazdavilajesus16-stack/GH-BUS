from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.passengers.models import Passenger
from apps.reservations.models import Reservation
from apps.routes.models import Ciudad, Ruta, TipoServicio
from apps.tickets.models import Ticket
from apps.trips.models import Viaje
from apps.users.roles import ADMINISTRADOR, CAJERO, CLIENTE


class PassengerListTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(
            username="passenger-list-test",
            email="passenger-list-test@example.com",
            password="test-password",
        )
        self.passenger = Passenger.objects.create(
            document_type="DNI",
            document_number="12345678",
            first_name="Ana",
            last_name="Prueba",
            email="ana@example.com",
            phone="999123456",
        )
        origin = Ciudad.objects.create(nombre="Origen pasajeros", departamento="Prueba")
        destination = Ciudad.objects.create(nombre="Destino pasajeros", departamento="Prueba")
        service = TipoServicio.objects.create(codigo="PASSENGER-TEST", nombre="Servicio pasajeros")
        route = Ruta.objects.create(
            codigo="PASSENGER-ROUTE",
            nombre="Origen - Destino",
            origen=origin,
            destino=destination,
            duracion_min=60,
        )
        departure = timezone.now() + timedelta(days=1)
        trip = Viaje.objects.create(
            codigo="PASSENGER-TRIP",
            ruta=route,
            tipo_servicio=service,
            salida_programada=departure,
            llegada_programada=departure + timedelta(hours=1),
            precio_base=Decimal("25.00"),
            creado_por=self.user,
        )
        reservation = Reservation.objects.create(
            trip=trip,
            status="CONFIRMED",
            total_amount=Decimal("50.00"),
        )
        for seat_number in (1, 2):
            Ticket.objects.create(
                reservation=reservation,
                passenger=self.passenger,
                seat_number=seat_number,
                price=Decimal("25.00"),
                status="PAID",
            )

    def authenticate_with_role(self, role):
        group, _ = Group.objects.get_or_create(name=role)
        self.user.groups.add(group)
        self.client.force_authenticate(user=self.user)

    def test_cashier_can_list_passengers_with_contact_and_ticket_count(self):
        self.authenticate_with_role(CAJERO)

        response = self.client.get("/api/passengers/management/")

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data["count"], 1)
        passenger = response.data["results"][0]
        self.assertEqual(passenger["document_type"], "DNI")
        self.assertEqual(passenger["document_number"], "12345678")
        self.assertEqual(passenger["first_name"], "Ana")
        self.assertEqual(passenger["last_name"], "Prueba")
        self.assertEqual(passenger["email"], "ana@example.com")
        self.assertEqual(passenger["phone"], "999123456")
        self.assertEqual(passenger["ticket_count"], 2)

    def test_passenger_list_can_search_document_and_contact_fields(self):
        self.authenticate_with_role(ADMINISTRADOR)

        by_document = self.client.get("/api/passengers/management/", {"search": "12345678"})
        by_phone = self.client.get("/api/passengers/management/", {"search": "999123456"})

        self.assertEqual(by_document.status_code, 200)
        self.assertEqual(by_document.data["count"], 1)
        self.assertEqual(by_phone.status_code, 200)
        self.assertEqual(by_phone.data["count"], 1)

    def test_passenger_list_requires_cashier_or_administrator_role(self):
        anonymous_response = self.client.get("/api/passengers/management/")
        self.assertEqual(anonymous_response.status_code, 401)

        self.authenticate_with_role(CLIENTE)
        client_response = self.client.get("/api/passengers/management/")
        self.assertEqual(client_response.status_code, 403)
