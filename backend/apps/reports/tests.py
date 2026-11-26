from datetime import datetime, time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.finance.models import CashMovement, TripSettlement
from apps.fleet.models import ConfiguracionAsientos, Vehiculo
from apps.passengers.models import Passenger
from apps.reservations.models import Reservation
from apps.routes.models import Ciudad, Ruta, TipoServicio
from apps.tickets.models import Ticket
from apps.trips.models import Viaje
from apps.users.roles import ADMINISTRADOR, CAJERO


class ReportesEstadisticasTests(TestCase):
    def setUp(self):
        admin = get_user_model().objects.create_user(
            username="report-admin",
            email="report-admin@example.com",
            password="test-password",
        )
        admin.groups.add(Group.objects.get_or_create(name=ADMINISTRADOR)[0])
        self.client = APIClient()
        self.client.force_authenticate(user=admin)

        origen = Ciudad.objects.create(nombre="Origen reporte", departamento="Prueba")
        destino = Ciudad.objects.create(nombre="Destino reporte", departamento="Prueba")
        servicio = TipoServicio.objects.create(codigo="REPORT-TEST", nombre="Servicio de reporte")
        ruta = Ruta.objects.create(
            codigo="REPORT-ROUTE",
            nombre="Origen - Destino",
            origen=origen,
            destino=destino,
            duracion_min=60,
        )
        configuracion = ConfiguracionAsientos.objects.create(
            nombre="Configuración reporte",
            pisos=1,
            total_asientos=4,
        )
        vehiculo = Vehiculo.objects.create(
            placa="REP-001",
            marca="Prueba",
            modelo="Reporte",
            anio=2025,
            configuracion_asientos=configuracion,
            tipo_servicio=servicio,
        )
        salida = timezone.make_aware(datetime.combine(timezone.localdate(), time(12)))
        self.trip = Viaje.objects.create(
            codigo="REPORT-TRIP",
            ruta=ruta,
            tipo_servicio=servicio,
            salida_programada=salida,
            llegada_programada=salida + timedelta(hours=1),
            vehiculo=vehiculo,
            estado=Viaje.Estado.FINALIZADO,
            precio_base=Decimal("50.00"),
            creado_por=admin,
        )
        reservation = Reservation.objects.create(
            trip=self.trip,
            status="CONFIRMED",
            total_amount=Decimal("100.00"),
        )
        pasajero = Passenger.objects.create(
            document_number="REPORT-001",
            first_name="Pasajero",
            last_name="Reporte",
        )
        Ticket.objects.create(
            reservation=reservation,
            passenger=pasajero,
            seat_number=1,
            price=Decimal("50.00"),
            status="PAID",
        )
        Ticket.objects.create(
            reservation=reservation,
            passenger=pasajero,
            seat_number=2,
            price=Decimal("50.00"),
            status="BOARDED",
            boarded_at=timezone.now(),
        )
        CashMovement.objects.create(
            reservation=reservation,
            movement_type=CashMovement.MovementType.INCOME,
            source=CashMovement.Source.SALE,
            amount=Decimal("100.00"),
            description="Venta simulada",
        )
        CashMovement.objects.create(
            movement_type=CashMovement.MovementType.INCOME,
            source=CashMovement.Source.MANUAL,
            amount=Decimal("30.00"),
            description="Ingreso manual",
        )
        CashMovement.objects.create(
            movement_type=CashMovement.MovementType.EXPENSE,
            source=CashMovement.Source.MANUAL,
            amount=Decimal("10.00"),
            description="Egreso manual",
        )
        TripSettlement.objects.create(
            trip=self.trip,
            status=TripSettlement.Status.CLOSED,
            income_snapshot=Decimal("100.00"),
            expense_snapshot=Decimal("25.00"),
            net_snapshot=Decimal("75.00"),
            closed_at=timezone.now(),
        )

    def test_admin_gets_filtered_sales_trip_finance_and_boarding_totals(self):
        hoy = timezone.localdate().isoformat()
        response = self.client.get("/api/reportes/estadisticas/", {"desde": hoy, "hasta": hoy})

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data["ventas"], {"cantidad": 1, "total": "100.00"})
        self.assertEqual(response.data["viajes"]["cantidad"], 1)
        self.assertEqual(response.data["viajes"]["capacidad_total"], 4)
        self.assertEqual(response.data["viajes"]["boletos_ocupados"], 2)
        self.assertEqual(response.data["viajes"]["ocupacion_porcentaje"], 50.0)
        self.assertEqual(response.data["finanzas"]["ingresos_manuales"], "30.00")
        self.assertEqual(response.data["finanzas"]["egresos_manuales"], "10.00")
        self.assertEqual(response.data["finanzas"]["neto_liquidado"], "75.00")
        self.assertEqual(response.data["finanzas"]["liquidaciones_pendientes"], 0)
        self.assertEqual(response.data["embarque"], {"abordados": 1, "pendientes": 1})

    def test_report_requires_admin_and_valid_date_range(self):
        client_user = get_user_model().objects.create_user(
            username="report-cashier",
            email="report-cashier@example.com",
            password="test-password",
        )
        client_user.groups.add(Group.objects.get_or_create(name=CAJERO)[0])
        self.client.force_authenticate(user=client_user)
        forbidden = self.client.get("/api/reportes/estadisticas/")
        self.assertEqual(forbidden.status_code, 403)

        admin = get_user_model().objects.get(username="report-admin")
        self.client.force_authenticate(user=admin)
        manana = (timezone.localdate() + timedelta(days=1)).isoformat()
        hoy = timezone.localdate().isoformat()
        invalid = self.client.get(
            "/api/reportes/estadisticas/",
            {"desde": manana, "hasta": hoy},
        )
        self.assertEqual(invalid.status_code, 400)
