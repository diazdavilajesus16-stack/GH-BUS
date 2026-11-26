from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.db.models import Prefetch
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import filters
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from apps.finance.models import CashMovement, CashRegister
from apps.trips.models import Viaje
from apps.passengers.models import Passenger
from apps.tickets.models import Ticket
from apps.users.permissions import HasAnyRole
from apps.users.roles import ADMINISTRADOR, CAJERO, CLIENTE
from .models import Reservation, ReservationSeat
from .services import asientos_ocupados_por_viaje, asientos_validos_para_viaje, crear_reserva
from .serializers import MiReservaSerializer, ReservationListSerializer
from api.realtime import publish_event

class SeatMapView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, trip_id):
        trip = get_object_or_404(
            Viaje.objects.select_related("vehiculo__configuracion_asientos"),
            id=trip_id,
        )
        asientos_validos = asientos_validos_para_viaje(trip)

        ahora = timezone.now()
        asientos_ocupados = asientos_ocupados_por_viaje([trip.id], ahora=ahora).get(trip.id, set())
        mapa = [
            {
                'seat_number': numero,
                'status': 'OCCUPIED' if numero in asientos_ocupados else 'AVAILABLE',
            }
            for numero in asientos_validos
        ]
        return Response({'trip_id': trip.id, 'seats': mapa})


class CreateReservationView(APIView):
    permission_classes = [IsAuthenticated, HasAnyRole]
    allowed_roles = (ADMINISTRADOR, CAJERO, CLIENTE)

    def post(self, request):
        trip_id = request.data.get('trip_id')
        seats = request.data.get('seats', [])
        passenger_data = request.data.get('passenger')

        if not trip_id or not seats or not passenger_data:
            return Response({'error': 'Faltan datos obligatorios'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            with transaction.atomic():
                # 1. Registrar o buscar al pasajero
                passenger, _ = Passenger.objects.get_or_create(
                    document_number=passenger_data['document_number'],
                    defaults={
                        'first_name': passenger_data['first_name'],
                        'last_name': passenger_data['last_name'],
                        'email': passenger_data.get('email', ''),
                        'phone': passenger_data.get('phone', '')
                    }
                )

                trip = Viaje.objects.get(id=trip_id)
                total = trip.precio_base * len(seats)

                # 2. Crear la reserva (bloquea los asientos)
                roles = set(request.user.role_names())
                usuario = (
                    request.user
                    if CLIENTE in roles and not roles.intersection({ADMINISTRADOR, CAJERO})
                    else None
                )
                reserva = crear_reserva(
                    trip_id=trip_id,
                    asientos=seats,
                    total_amount=total,
                    usuario=usuario,
                )

                # 3. Crear boletos en estado RESERVED vinculados al pasajero
                for asiento in seats:
                    Ticket.objects.create(
                        reservation=reserva,
                        passenger=passenger,
                        seat_number=asiento,
                        price=trip.precio_base,
                        status='RESERVED'
                    )

            for seat_number in seats:
                publish_event(
                    'seat.updated',
                    {'trip_id': trip_id, 'seat_number': seat_number, 'status': 'held'},
                )

            return Response({
                'message': 'Reserva creada',
                'reservation_id': reserva.id,
                'total_amount': str(reserva.total_amount),
                'expires_at': reserva.expires_at.isoformat(),
            }, status=status.HTTP_201_CREATED)

        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class PayReservationView(APIView):
    permission_classes = [IsAuthenticated, HasAnyRole]
    allowed_roles = (ADMINISTRADOR, CAJERO, CLIENTE)

    def post(self, request, reservation_id):
        requested_method = request.data.get('payment_method')
        if (
            requested_method not in (None, '')
            and requested_method not in Reservation.PaymentMethod.values
        ):
            return Response(
                {'error': 'El método de pago seleccionado no es válido.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():
                roles = set(request.user.role_names())
                reservas = Reservation.objects.select_for_update().filter(id=reservation_id)
                if not roles.intersection({ADMINISTRADOR, CAJERO}):
                    reservas = reservas.filter(usuario=request.user)
                reserva = reservas.first()
                if reserva is None:
                    return Response({'error': 'Reserva no encontrada'}, status=status.HTTP_404_NOT_FOUND)

                payment_method = requested_method or reserva.payment_method

                if reserva.status != 'PENDING':
                    return Response({'error': 'Esta reserva ya fue pagada, expiró o fue cancelada.'}, status=status.HTTP_400_BAD_REQUEST)

                if reserva.expires_at < timezone.now():
                    reserva.status = 'EXPIRED'
                    reserva.save(update_fields=['status'])
                    for seat_number in reserva.seats.values_list('seat_number', flat=True):
                        publish_event(
                            'seat.updated',
                            {'trip_id': reserva.trip_id, 'seat_number': seat_number, 'status': 'available'},
                        )
                    return Response({'error': 'La reserva ha expirado.'}, status=status.HTTP_400_BAD_REQUEST)

                trip = Viaje.objects.select_for_update().get(pk=reserva.trip_id)
                if (
                    trip.estado in (Viaje.Estado.FINALIZADO, Viaje.Estado.CANCELADO)
                    or trip.salida_programada <= timezone.now()
                ):
                    return Response(
                        {'error': 'No se puede pagar una reserva para un viaje que ya salió o fue cancelado.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                boletos = list(reserva.tickets.select_for_update().all())
                if not boletos:
                    return Response(
                        {'error': 'La reserva no tiene boletos asociados.'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                es_personal_de_caja = bool(roles.intersection({ADMINISTRADOR, CAJERO}))
                if payment_method == Reservation.PaymentMethod.CASH and not es_personal_de_caja:
                    if reserva.payment_method != Reservation.PaymentMethod.CASH:
                        reserva.payment_method = Reservation.PaymentMethod.CASH
                        reserva.save(update_fields=['payment_method'])
                    return Response({
                        'message': 'Reserva pendiente de pago en caja.',
                        'status': 'PENDING',
                        'payment_method': Reservation.PaymentMethod.CASH,
                        'expires_at': reserva.expires_at.isoformat(),
                        'tickets': [],
                    })

                caja = None
                if es_personal_de_caja:
                    caja = CashRegister.objects.select_for_update().filter(
                        owner=request.user,
                        closed_at__isnull=True,
                    ).first()
                if payment_method == Reservation.PaymentMethod.CASH and caja is None:
                    return Response(
                        {'error': 'Abre una caja antes de confirmar el pago en efectivo.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                # Confirmar la reserva y emitir los QR dentro de la misma transacción.
                reserva.status = 'CONFIRMED'
                reserva.confirmed_at = timezone.now()
                update_fields = ['status', 'confirmed_at']
                if payment_method and reserva.payment_method != payment_method:
                    reserva.payment_method = payment_method
                    update_fields.append('payment_method')
                reserva.save(update_fields=update_fields)

                boletos_generados = []
                for boleto in boletos:
                    boleto.status = 'PAID'
                    boleto.save()  # Ticket.save() genera el QR al pasar a PAID.
                    boletos_generados.append({'seat_number': boleto.seat_number, 'qr_code': boleto.qr_code})

                descripcion_pago = 'Venta simulada de boletos'
                if payment_method in (Reservation.PaymentMethod.YAPE, Reservation.PaymentMethod.VISA):
                    descripcion_pago = f'Pago simulado por {Reservation.PaymentMethod(payment_method).label}'
                elif payment_method == Reservation.PaymentMethod.CASH:
                    descripcion_pago = 'Pago en efectivo en caja'
                CashMovement.objects.create(
                    cash_register=(
                        None
                        if payment_method in (Reservation.PaymentMethod.YAPE, Reservation.PaymentMethod.VISA)
                        else caja
                    ),
                    reservation=reserva,
                    created_by=request.user if request.user.is_authenticated else None,
                    movement_type=CashMovement.MovementType.INCOME,
                    source=CashMovement.Source.SALE,
                    amount=reserva.total_amount,
                    description=f'{descripcion_pago} - reserva {str(reserva.pk)[:8].upper()}',
                )

            if payment_method == Reservation.PaymentMethod.CASH:
                mensaje_pago = 'Pago en efectivo registrado en caja.'
            elif payment_method:
                mensaje_pago = f'Pago simulado correctamente por {Reservation.PaymentMethod(payment_method).label}.'
            else:
                mensaje_pago = 'Pago simulado correctamente'

            for ticket in boletos_generados:
                publish_event(
                    'seat.updated',
                    {'trip_id': reserva.trip_id, 'seat_number': ticket['seat_number'], 'status': 'sold'},
                )

            return Response({
                'message': mensaje_pago,
                'status': 'CONFIRMED',
                'payment_method': payment_method,
                'tickets': boletos_generados,
            }, status=status.HTTP_200_OK)

        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class ReservationListView(ListAPIView):
    permission_classes = [IsAuthenticated, HasAnyRole]
    allowed_roles = (ADMINISTRADOR, CAJERO)
    serializer_class = ReservationListSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        'id',
        'trip__codigo',
        'trip__ruta__origen__nombre',
        'trip__ruta__destino__nombre',
        'tickets__passenger__first_name',
        'tickets__passenger__last_name',
    ]
    ordering_fields = ['created_at', 'expires_at', 'total_amount', 'trip__salida_programada']
    ordering = ['-created_at']

    def get_queryset(self):
        queryset = Reservation.objects.select_related(
            'trip__ruta__origen',
            'trip__ruta__destino',
        ).prefetch_related(
            'seats',
            Prefetch(
                'tickets',
                queryset=Ticket.objects.select_related('passenger').order_by('seat_number'),
            ),
        )
        status_filter = self.request.query_params.get('status')
        if status_filter in dict(Reservation.STATUS_CHOICES):
            queryset = queryset.filter(status=status_filter)
        return queryset.distinct()


class MyReservationListView(ListAPIView):
    permission_classes = [IsAuthenticated, HasAnyRole]
    allowed_roles = (CLIENTE,)
    serializer_class = MiReservaSerializer

    def get_queryset(self):
        return (
            Reservation.objects.filter(usuario=self.request.user)
            .select_related('trip__ruta__origen', 'trip__ruta__destino')
            .prefetch_related(
                'seats',
                Prefetch(
                    'tickets',
                    queryset=Ticket.objects.select_related('passenger').order_by('seat_number'),
                ),
            )
            .order_by('-created_at')
        )