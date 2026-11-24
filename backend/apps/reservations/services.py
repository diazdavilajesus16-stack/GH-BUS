from django.db import transaction
from django.utils import timezone
from apps.reservations.models import Reservation, ReservationSeat
from apps.trips.models import Viaje

def crear_reserva(trip_id, asientos, total_amount):
    with transaction.atomic():
        trip = Viaje.objects.select_for_update().get(id=trip_id)
        
        if trip.estado not in ['PROGRAMADO', 'CONFIRMADO']:
            raise ValueError("El viaje no está disponible para reservas.")
            
        asientos_ocupados = ReservationSeat.objects.filter(
            reservation__trip=trip,
            reservation__status__in=['PENDING', 'CONFIRMED'],
            reservation__expires_at__gt=timezone.now(),
            seat_number__in=asientos
        ).values_list('seat_number', flat=True)
        
        if asientos_ocupados:
            raise ValueError(f"Los asientos {list(asientos_ocupados)} ya están ocupados.")
            
        reserva = Reservation.objects.create(
            trip=trip,
            total_amount=total_amount
        )
        
        for asiento in asientos:
            ReservationSeat.objects.create(reservation=reserva, seat_number=asiento)
            
        return reserva