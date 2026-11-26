from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.finance.models import CashMovement, CashRegister, TripExpense, TripSettlement
from apps.passengers.models import Passenger
from apps.reservations.models import Reservation
from apps.routes.models import Ciudad, Ruta, TipoServicio
from apps.tickets.models import Ticket
from apps.trips.models import Viaje
from apps.users.roles import ADMINISTRADOR, CAJERO, CLIENTE


class CashRegisterWorkflowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.cashier = self.create_user("cashier", CAJERO)

    def create_user(self, username, role):
        user = get_user_model().objects.create_user(
            username=username,
            email=f"{username}@example.com",
            password="test-password",
        )
        group, _ = Group.objects.get_or_create(name=role)
        user.groups.add(group)
        return user

    def authenticate(self, user=None):
        self.client.force_authenticate(user=user or self.cashier)

    def test_cashier_can_open_register_record_movements_and_close_with_difference(self):
        self.authenticate()

        opened = self.client.post(
            "/api/cash/register/open/",
            {"opening_amount": "100.00"},
            format="json",
        )
        self.assertEqual(opened.status_code, 201, opened.content)
        register_id = opened.data["id"]
        duplicate = self.client.post(
            "/api/cash/register/open/",
            {"opening_amount": "10.00"},
            format="json",
        )
        self.assertEqual(duplicate.status_code, 409)

        income = self.client.post(
            "/api/cash/movements/",
            {"movement_type": "INCOME", "amount": "25.00", "description": "Ingreso manual"},
            format="json",
        )
        expense = self.client.post(
            "/api/cash/movements/",
            {"movement_type": "EXPENSE", "amount": "5.00", "description": "Compra de insumos"},
            format="json",
        )
        self.assertEqual(income.status_code, 201, income.content)
        self.assertEqual(expense.status_code, 201, expense.content)
        excessive_expense = self.client.post(
            "/api/cash/movements/",
            {"movement_type": "EXPENSE", "amount": "500.00", "description": "Excede el saldo"},
            format="json",
        )
        self.assertEqual(excessive_expense.status_code, 400)

        summary = self.client.get("/api/cash/summary/")
        self.assertEqual(summary.status_code, 200, summary.content)
        self.assertEqual(summary.data["current_register"]["id"], register_id)
        self.assertEqual(Decimal(summary.data["current_register"]["income_total"]), Decimal("25.00"))
        self.assertEqual(Decimal(summary.data["current_register"]["expense_total"]), Decimal("5.00"))
        self.assertEqual(Decimal(summary.data["current_register"]["expected_amount"]), Decimal("120.00"))

        closed = self.client.post(
            "/api/cash/register/close/",
            {"closing_amount": "118.00"},
            format="json",
        )
        self.assertEqual(closed.status_code, 200, closed.content)
        self.assertEqual(closed.data["difference"], "-2.00")
        register = CashRegister.objects.get(pk=register_id)
        self.assertIsNotNone(register.closed_at)
        self.assertEqual(register.closing_amount, Decimal("118.00"))

    def test_cashier_cannot_record_manual_movement_without_open_register(self):
        self.authenticate()

        response = self.client.post(
            "/api/cash/movements/",
            {"movement_type": "INCOME", "amount": "5.00", "description": "Sin caja"},
            format="json",
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(CashMovement.objects.count(), 0)

    def test_cash_operations_require_cashier_or_administrator_role(self):
        anonymous = self.client.get("/api/cash/summary/")
        self.assertEqual(anonymous.status_code, 401)

        client_user = self.create_user("client", CLIENTE)
        self.authenticate(client_user)
        forbidden = self.client.get("/api/cash/summary/")
        self.assertEqual(forbidden.status_code, 403)

    def test_cashier_sees_only_own_movements_but_admin_sees_all(self):
        other_cashier = self.create_user("other-cashier", CAJERO)
        register = CashRegister.objects.create(
            owner=other_cashier,
            opening_amount=Decimal("50.00"),
        )
        CashMovement.objects.create(
            cash_register=register,
            created_by=other_cashier,
            movement_type=CashMovement.MovementType.INCOME,
            source=CashMovement.Source.MANUAL,
            amount=Decimal("10.00"),
            description="Movimiento privado",
        )

        self.authenticate()
        cashier_response = self.client.get("/api/cash/movements/")
        self.assertEqual(cashier_response.status_code, 200, cashier_response.content)
        self.assertEqual(cashier_response.data["count"], 0)

        administrator = self.create_user("cash-admin", ADMINISTRADOR)
        self.authenticate(administrator)
        admin_response = self.client.get("/api/cash/movements/")
        self.assertEqual(admin_response.status_code, 200, admin_response.content)
        self.assertEqual(admin_response.data["count"], 1)


class CashSaleIntegrationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.cashier = get_user_model().objects.create_user(
            username="sale-cashier",
            email="sale-cashier@example.com",
            password="test-password",
        )
        group, _ = Group.objects.get_or_create(name=CAJERO)
        self.cashier.groups.add(group)

        origin = Ciudad.objects.create(nombre="Origen caja", departamento="Prueba")
        destination = Ciudad.objects.create(nombre="Destino caja", departamento="Prueba")
        service = TipoServicio.objects.create(codigo="CASH-TEST", nombre="Servicio de caja")
        route = Ruta.objects.create(
            codigo="CASH-ROUTE",
            nombre="Origen - Destino",
            origen=origin,
            destino=destination,
            duracion_min=60,
        )
        departure = timezone.now() + timedelta(days=1)
        self.trip = Viaje.objects.create(
            codigo="CASH-TRIP",
            ruta=route,
            tipo_servicio=service,
            salida_programada=departure,
            llegada_programada=departure + timedelta(hours=1),
            precio_base=Decimal("35.00"),
            creado_por=self.cashier,
        )
        passenger = Passenger.objects.create(
            document_number="11223344",
            first_name="Pasajero",
            last_name="Caja",
        )
        self.reservation = Reservation.objects.create(
            trip=self.trip,
            total_amount=Decimal("35.00"),
        )
        Ticket.objects.create(
            reservation=self.reservation,
            passenger=passenger,
            seat_number=1,
            price=Decimal("35.00"),
            status="RESERVED",
        )

    def test_cashier_payment_is_recorded_as_income_in_open_register(self):
        register = CashRegister.objects.create(
            owner=self.cashier,
            opening_amount=Decimal("100.00"),
        )
        self.client.force_authenticate(user=self.cashier)

        response = self.client.post(f"/api/reservations/{self.reservation.pk}/pay/", format="json")

        self.assertEqual(response.status_code, 200, response.content)
        movement = CashMovement.objects.get(reservation=self.reservation)
        self.assertEqual(movement.cash_register, register)
        self.assertEqual(movement.movement_type, CashMovement.MovementType.INCOME)
        self.assertEqual(movement.source, CashMovement.Source.SALE)
        self.assertEqual(movement.amount, Decimal("35.00"))

    def test_customer_payment_is_recorded_without_assigning_cash_register(self):
        customer = get_user_model().objects.create_user(
            username="sale-customer",
            email="sale-customer@example.com",
            password="test-password",
        )
        customer.groups.add(Group.objects.get_or_create(name=CLIENTE)[0])
        self.reservation.usuario = customer
        self.reservation.save(update_fields=["usuario"])
        client = APIClient()
        client.force_authenticate(user=customer)

        response = client.post(f"/api/reservations/{self.reservation.pk}/pay/", format="json")

        self.assertEqual(response.status_code, 200, response.content)
        movement = CashMovement.objects.get(reservation=self.reservation)
        self.assertIsNone(movement.cash_register)
        self.assertEqual(movement.created_by, customer)
        self.assertEqual(movement.source, CashMovement.Source.SALE)
        self.assertEqual(movement.amount, Decimal("35.00"))


class TripSettlementTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = get_user_model().objects.create_user(
            username="settlement-admin",
            email="settlement-admin@example.com",
            password="test-password",
        )
        admin_group, _ = Group.objects.get_or_create(name=ADMINISTRADOR)
        self.admin.groups.add(admin_group)

        origin = Ciudad.objects.create(nombre="Origen liquidación", departamento="Prueba")
        destination = Ciudad.objects.create(nombre="Destino liquidación", departamento="Prueba")
        service = TipoServicio.objects.create(codigo="SETTLEMENT-TEST", nombre="Servicio de liquidación")
        route = Ruta.objects.create(
            codigo="SETTLEMENT-ROUTE",
            nombre="Origen - Destino",
            origen=origin,
            destino=destination,
            duracion_min=60,
        )
        departure = timezone.now() - timedelta(days=2)
        self.trip = Viaje.objects.create(
            codigo="SETTLEMENT-TRIP",
            ruta=route,
            tipo_servicio=service,
            salida_programada=departure,
            llegada_programada=departure + timedelta(hours=1),
            precio_base=Decimal("50.00"),
            estado=Viaje.Estado.FINALIZADO,
            creado_por=self.admin,
        )
        reservation = Reservation.objects.create(
            trip=self.trip,
            status="CONFIRMED",
            total_amount=Decimal("100.00"),
        )
        CashMovement.objects.create(
            reservation=reservation,
            movement_type=CashMovement.MovementType.INCOME,
            source=CashMovement.Source.SALE,
            amount=Decimal("100.00"),
            description="Venta simulada de dos boletos",
        )
        self.client.force_authenticate(user=self.admin)

    def test_completed_trip_sums_paid_sales_and_can_be_closed_once(self):
        response = self.client.get("/api/trip-settlements/", {"status": "PENDING"})

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data["count"], 1)
        trip = response.data["results"][0]
        self.assertEqual(trip["trip_code"], self.trip.codigo)
        self.assertEqual(Decimal(trip["income_total"]), Decimal("100.00"))
        self.assertEqual(Decimal(trip["expense_total"]), Decimal("0.00"))
        self.assertEqual(Decimal(trip["net_total"]), Decimal("100.00"))
        self.assertEqual(trip["expenses"], [])

        expense = self.client.post(
            f"/api/trip-settlements/{self.trip.pk}/expenses/",
            {
                "category": TripExpense.Category.FUEL,
                "amount": "15.00",
                "description": "Combustible de ruta",
            },
            format="json",
        )
        self.assertEqual(expense.status_code, 201, expense.content)
        self.assertEqual(expense.data["category_label"], "Combustible")

        draft = self.client.get("/api/trip-settlements/", {"status": TripSettlement.Status.DRAFT})
        self.assertEqual(draft.data["count"], 1)
        self.assertEqual(Decimal(draft.data["results"][0]["expense_total"]), Decimal("15.00"))

        closed = self.client.post(f"/api/trip-settlements/{self.trip.pk}/close/", format="json")
        self.assertEqual(closed.status_code, 200, closed.content)
        self.assertEqual(Decimal(closed.data["income_total"]), Decimal("100.00"))
        self.assertEqual(Decimal(closed.data["expense_total"]), Decimal("15.00"))
        self.assertEqual(Decimal(closed.data["net_total"]), Decimal("85.00"))

        duplicate_close = self.client.post(f"/api/trip-settlements/{self.trip.pk}/close/", format="json")
        blocked_expense = self.client.post(
            f"/api/trip-settlements/{self.trip.pk}/expenses/",
            {
                "category": TripExpense.Category.TOLL,
                "amount": "5.00",
                "description": "Peaje tardío",
            },
            format="json",
        )
        self.assertEqual(duplicate_close.status_code, 409)
        self.assertEqual(blocked_expense.status_code, 409)

    def test_unfinished_trip_cannot_be_expensed_or_settled(self):
        self.trip.estado = Viaje.Estado.PROGRAMADO
        self.trip.save(update_fields=["estado"])

        expense = self.client.post(
            f"/api/trip-settlements/{self.trip.pk}/expenses/",
            {
                "category": TripExpense.Category.TOLL,
                "amount": "5.00",
                "description": "Peaje",
            },
            format="json",
        )
        close = self.client.post(f"/api/trip-settlements/{self.trip.pk}/close/", format="json")

        self.assertEqual(expense.status_code, 409)
        self.assertEqual(close.status_code, 409)
        self.assertFalse(TripSettlement.objects.filter(trip=self.trip).exists())
