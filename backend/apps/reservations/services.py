from django.db import transaction
from django.utils import timezone
from apps.reservations.models import Reservation, ReservationSeat
from apps.trips.models import Trip

def crear_reserva(trip_id, asientos, total_amount):
    """
    Crea una reserva bloqueando los asientos usando SELECT FOR UPDATE.
    Esto evita que dos personas compren el mismo asiento al mismo tiempo.
    """
    with transaction.atomic():
        # 1. Bloqueamos el viaje para validar que esté activo
        trip = Trip.objects.select_for_update().get(id=trip_id)
        
        if trip.status not in ['SCHEDULED', 'CONFIRMED']:
            raise ValueError("El viaje no está disponible para reservas.")
            
        # 2. Verificar que los asientos no estén ya ocupados (Pagados o Reservados vigentes)
        asientos_ocupados = ReservationSeat.objects.filter(
            reservation__trip=trip,
            reservation__status__in=['PENDING', 'CONFIRMED'],
            reservation__expires_at__gt=timezone.now(),
            seat_number__in=asientos
        ).values_list('seat_number', flat=True)
        
        if asientos_ocupados:
            raise ValueError(f"Los asientos {list(asientos_ocupados)} ya están ocupados.")
            
        # 3. Crear la reserva (expira en 10 min por defecto)
        reserva = Reservation.objects.create(
            trip=trip,
            total_amount=total_amount
        )
        
        # 4. Asignar los asientos a la reserva
        for asiento in asientos:
            ReservationSeat.objects.create(reservation=reserva, seat_number=asiento)
            
        return reserva