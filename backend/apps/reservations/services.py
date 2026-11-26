from collections import defaultdict
from collections.abc import Iterable

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from apps.reservations.models import Reservation, ReservationSeat
from apps.trips.models import Viaje


def asientos_ocupados_por_viaje(
    viaje_ids: Iterable[int],
    ahora=None,
) -> dict[int, set[int]]:
    ids = list(viaje_ids)
    if not ids:
        return {}

    instante = ahora or timezone.now()
    ocupados = defaultdict(set)
    asientos = ReservationSeat.objects.filter(
        reservation__trip_id__in=ids,
    ).filter(
        Q(reservation__status="CONFIRMED")
        | Q(reservation__status="PENDING", reservation__expires_at__gt=instante)
    ).values_list("reservation__trip_id", "seat_number")
    for viaje_id, asiento in asientos:
        ocupados[viaje_id].add(asiento)
    return dict(ocupados)


def asientos_validos_para_viaje(viaje):
    if viaje.vehiculo_id is None:
        return list(range(1, 41))
    return list(
        viaje.vehiculo.configuracion_asientos.asientos.order_by("numero").values_list("numero", flat=True)
    )


def crear_reserva(trip_id, asientos, total_amount, usuario=None):
    with transaction.atomic():
        trip = Viaje.objects.select_for_update().get(id=trip_id)

        if trip.estado not in ['PROGRAMADO', 'CONFIRMADO']:
            raise ValueError("El viaje no está disponible para reservas.")
        if trip.salida_programada <= timezone.now():
            raise ValueError("El viaje ya salió y no está disponible para reservas.")
        if not isinstance(asientos, (list, tuple)) or not asientos:
            raise ValueError("Debe seleccionar al menos un asiento.")
        if any(type(asiento) is not int or asiento <= 0 for asiento in asientos):
            raise ValueError("Los números de asiento deben ser enteros positivos.")
        if len(set(asientos)) != len(asientos):
            raise ValueError("No se pueden repetir asientos.")

        asientos_no_configurados = sorted(set(asientos) - set(asientos_validos_para_viaje(trip)))
        if asientos_no_configurados:
            raise ValueError(
                f"Los asientos {asientos_no_configurados} no están disponibles para este viaje."
            )

        asientos_ocupados = ReservationSeat.objects.filter(
            reservation__trip=trip,
        ).filter(
            Q(reservation__status='CONFIRMED')
            | Q(reservation__status='PENDING', reservation__expires_at__gt=timezone.now())
        ).filter(
            seat_number__in=asientos
        ).values_list('seat_number', flat=True)

        if asientos_ocupados:
            raise ValueError(f"Los asientos {list(asientos_ocupados)} ya están ocupados.")

        reserva = Reservation.objects.create(
            trip=trip,
            total_amount=total_amount,
            usuario=usuario,
        )

        for asiento in asientos:
            ReservationSeat.objects.create(reservation=reserva, seat_number=asiento)

        return reserva