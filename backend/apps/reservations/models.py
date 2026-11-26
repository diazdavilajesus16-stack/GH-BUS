import uuid
from django.conf import settings
from django.db import models
from django.utils import timezone
from datetime import timedelta
from apps.trips.models import Viaje


class Reservation(models.Model):
    class PaymentMethod(models.TextChoices):
        YAPE = 'YAPE', 'Yape'
        VISA = 'VISA', 'Visa'
        CASH = 'CASH', 'Efectivo en caja'

    STATUS_CHOICES = [
        ('PENDING', 'Pendiente de Pago'),
        ('CONFIRMED', 'Confirmada'),
        ('EXPIRED', 'Expirada'),
        ('CANCELLED', 'Cancelada'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    trip = models.ForeignKey(Viaje, on_delete=models.PROTECT, related_name='reservations')
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='reservations',
        null=True,
        blank=True,
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    payment_method = models.CharField(
        max_length=10,
        choices=PaymentMethod.choices,
        blank=True,
        default='',
    )
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(help_text="Fecha en que expira la reserva y se liberan los asientos")
    confirmed_at = models.DateTimeField(null=True, blank=True)

    def save(self, *args, **kwargs):
        if not self.expires_at:
            self.expires_at = timezone.now() + timedelta(minutes=10)
        super().save(*args, **kwargs)

class ReservationSeat(models.Model):
    reservation = models.ForeignKey(Reservation, on_delete=models.CASCADE, related_name='seats')
    seat_number = models.PositiveIntegerField()

    class Meta:
        unique_together = ('reservation', 'seat_number')