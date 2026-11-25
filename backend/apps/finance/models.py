from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone


class CashRegister(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="cash_registers",
    )
    opening_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.00"))],
    )
    opened_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    closing_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.00"))],
    )

    class Meta:
        ordering = ["-opened_at"]

    @property
    def is_open(self):
        return self.closed_at is None

    def __str__(self):
        return f"Caja de {self.owner} ({self.opened_at:%Y-%m-%d})"


class CashMovement(models.Model):
    class MovementType(models.TextChoices):
        INCOME = "INCOME", "Ingreso"
        EXPENSE = "EXPENSE", "Egreso"

    class Source(models.TextChoices):
        SALE = "SALE", "Venta simulada"
        MANUAL = "MANUAL", "Manual"

    cash_register = models.ForeignKey(
        CashRegister,
        on_delete=models.PROTECT,
        related_name="movements",
        null=True,
        blank=True,
    )
    reservation = models.OneToOneField(
        "reservations.Reservation",
        on_delete=models.PROTECT,
        related_name="cash_movement",
        null=True,
        blank=True,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="cash_movements",
        null=True,
        blank=True,
    )
    movement_type = models.CharField(max_length=10, choices=MovementType.choices)
    source = models.CharField(max_length=10, choices=Source.choices)
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    description = models.CharField(max_length=255)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"{self.get_movement_type_display()} S/ {self.amount}"


class TripSettlement(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "En proceso"
        CLOSED = "CLOSED", "Liquidada"

    trip = models.OneToOneField(
        "trips.Viaje",
        on_delete=models.PROTECT,
        related_name="settlement",
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    income_snapshot = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    expense_snapshot = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    net_snapshot = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="trip_settlements_closed",
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Liquidación {self.trip.codigo} ({self.get_status_display()})"


class TripExpense(models.Model):
    class Category(models.TextChoices):
        FUEL = "FUEL", "Combustible"
        TOLL = "TOLL", "Peaje"
        PER_DIEM = "PER_DIEM", "Viáticos"
        OTHER = "OTHER", "Otro"

    settlement = models.ForeignKey(
        TripSettlement,
        on_delete=models.CASCADE,
        related_name="expenses",
    )
    category = models.CharField(max_length=10, choices=Category.choices)
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    description = models.CharField(max_length=255)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="trip_expenses",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"{self.get_category_display()} S/ {self.amount} - {self.settlement.trip.codigo}"
