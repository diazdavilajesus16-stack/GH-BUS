import uuid
from django.db import models
from apps.reservations.models import Reservation
from apps.passengers.models import Passenger

class Ticket(models.Model):
    STATUS_CHOICES = [
        ('RESERVED', 'Reservado'),
        ('PAID', 'Pagado'),
        ('BOARDED', 'Embarcado'),
        ('CANCELLED', 'Anulado'),
        ('EXPIRED', 'Expirado'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reservation = models.ForeignKey(Reservation, on_delete=models.CASCADE, related_name='tickets')
    passenger = models.ForeignKey(Passenger, on_delete=models.PROTECT, related_name='tickets')
    seat_number = models.PositiveIntegerField()
    price = models.DecimalField(max_digits=10, decimal_places=2)
    qr_code = models.CharField(max_length=100, unique=True, blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='RESERVED')
    issued_at = models.DateTimeField(auto_now_add=True)
    boarded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Boleto"
        verbose_name_plural = "Boletos"

    def save(self, *args, **kwargs):
        if not self.qr_code and self.status == 'PAID':
            self.qr_code = str(uuid.uuid4())
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Boleto {self.seat_number} - {self.passenger.first_name}"