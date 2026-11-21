from django.core.management.base import BaseCommand
from django.utils import timezone
from apps.reservations.models import Reservation
from apps.tickets.models import Ticket

class Command(BaseCommand):
    help = 'Libera asientos de reservas expiradas'

    def handle(self, *args, **kwargs):
        reservas_expiradas = Reservation.objects.filter(status='PENDING', expires_at__lt=timezone.now())
        
        for reserva in reservas_expiradas:
            reserva.status = 'EXPIRED'
            reserva.save()
            # Expirar los boletos asociados
            Ticket.objects.filter(reservation=reserva, status='RESERVED').update(status='EXPIRED')
            
        self.stdout.write(self.style.SUCCESS(f'Se liberaron {reservas_expiradas.count()} reservas expiradas.'))