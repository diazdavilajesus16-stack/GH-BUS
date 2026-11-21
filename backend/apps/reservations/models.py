import uuid
from django.db import models
from django.utils import timezone
from datetime import timedelta
from apps.trips.models import Trip
from apps.passengers.models import Passenger

class Reservation(models.Model):
    STATUS_CHOICES = [
        ('PENDING', 'Pendiente de Pago'),
        ('CONFIRMED', 'Confirmada'),
        ('EXPIRED', 'Expirada'),
        ('CANCELLED', 'Cancelada'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    trip = models.ForeignKey(Trip, on_delete=models.PROTECT, related_name='reservations')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(help_text="Fecha en que expira la reserva y se liberan los asientos")
    confirmed_at = models.DateTimeField(null=True, blank=True)

    def save(self, *args, **kwargs):
        if not self.expires_at:
            # Valor por defecto: 10 minutos de bloqueo
            self.expires_at = timezone.now() + timedelta(minutes=10)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Reserva {self.id} - Viaje {self.trip.id}"

class ReservationSeat(models.Model):
    """Representa el asiento bloqueado temporalmente por una reserva."""
    reservation = models.ForeignKey(Reservation, on_delete=models.CASCADE, related_name='seats')
    seat_number = models.PositiveIntegerField()
    
    class Meta:
        unique_together = ('reservation', 'seat_number')