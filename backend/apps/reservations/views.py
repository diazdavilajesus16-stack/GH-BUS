from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from apps.trips.models import Viaje
from apps.passengers.models import Passenger
from apps.tickets.models import Ticket
from .models import Reservation, ReservationSeat
from .services import crear_reserva
from api.realtime import publish_event

class SeatMapView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, trip_id):
        trip = get_object_or_404(Viaje, id=trip_id)
        capacity = getattr(trip.vehiculo, 'capacidad', 40) if trip.vehiculo else 40
        
        asientos_ocupados = ReservationSeat.objects.filter(
            reservation__trip=trip,
            reservation__status__in=['PENDING', 'CONFIRMED'],
            reservation__expires_at__gt=timezone.now()
        ).values_list('seat_number', flat=True)
        
        mapa = [{'seat_number': i, 'status': 'OCCUPIED' if i in asientos_ocupados else 'AVAILABLE'} for i in range(1, capacity + 1)]
        return Response({'trip_id': trip.id, 'seats': mapa})

class CreateReservationView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        trip_id = request.data.get('trip_id')
        seats = request.data.get('seats', [])
        passenger_data = request.data.get('passenger')
        
        if not trip_id or not seats or not passenger_data:
            return Response({'error': 'Faltan datos obligatorios'}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
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
            
            reserva = crear_reserva(trip_id=trip_id, asientos=seats, total_amount=total)
            
            try:
                publish_event('seat.updated', {'trip_id': trip_id, 'seats': seats, 'status': 'RESERVED'})
            except Exception:
                pass

            return Response({'message': 'Reserva creada', 'reservation_id': reserva.id}, status=status.HTTP_201_CREATED)

        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class PayReservationView(APIView):
    permission_classes = [AllowAny] 

    def post(self, request, reservation_id):
        try:
            reserva = Reservation.objects.get(id=reservation_id)
            
            if reserva.status != 'PENDING':
                return Response({'error': 'Esta reserva ya fue pagada, expiró o fue cancelada.'}, status=status.HTTP_400_BAD_REQUEST)
                
            if reserva.expires_at < timezone.now():
                reserva.status = 'EXPIRED'
                reserva.save()
                return Response({'error': 'La reserva ha expirado.'}, status=status.HTTP_400_BAD_REQUEST)

            reserva.status = 'CONFIRMED'
            reserva.confirmed_at = timezone.now()
            reserva.save()

            boletos_generados = []
            for asiento in reserva.seats.all():
                boleto = Ticket.objects.create(
                    reservation=reserva,
                    passenger=reserva.tickets.first().passenger if reserva.tickets.exists() else None,
                    seat_number=asiento.seat_number,
                    price=reserva.total_amount / reserva.seats.count(),
                    status='PAID'
                )
                boletos_generados.append({'seat_number': boleto.seat_number, 'qr_code': boleto.qr_code})

            return Response({'message': 'Pago procesado', 'tickets': boletos_generados}, status=status.HTTP_200_OK)

        except Reservation.DoesNotExist:
            return Response({'error': 'Reserva no encontrada'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)