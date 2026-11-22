from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers

from apps.trips.models import Viaje
from apps.passengers.models import Passenger
from .models import Reservation
from .services import crear_reserva
from api.realtime import publish_event

class SeatMapView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        summary="Ver mapa de asientos de un viaje",
        responses={200: inline_serializer(
            name='SeatMapResponse',
            fields={
                'trip_id': serializers.IntegerField(),
                'seats': serializers.ListField(
                    child=serializers.DictField()
                )
            }
        )}
    )
    def get(self, request, trip_id):
        trip = get_object_or_404(Viaje, id=trip_id)
        
        capacity = getattr(trip.vehiculo, 'capacidad', 40) if trip.vehiculo else 40
        
        from apps.reservations.models import ReservationSeat
        from django.utils import timezone
        
        asientos_ocupados = ReservationSeat.objects.filter(
            reservation__trip=trip,
            reservation__status__in=['PENDING', 'CONFIRMED'],
            reservation__expires_at__gt=timezone.now()
        ).values_list('seat_number', flat=True)
        
        mapa = []
        for i in range(1, capacity + 1):
            mapa.append({
                'seat_number': i,
                'status': 'OCCUPIED' if i in asientos_ocupados else 'AVAILABLE'
            })
            
        return Response({'trip_id': trip.id, 'seats': mapa})


class CreateReservationView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        summary="Crear una reserva y bloquear asientos",
        request=inline_serializer(
            name='CreateReservationRequest',
            fields={
                'trip_id': serializers.IntegerField(),
                'seats': serializers.ListField(child=serializers.IntegerField()),
                'passenger': inline_serializer(
                    name='PassengerData',
                    fields={
                        'document_number': serializers.CharField(),
                        'first_name': serializers.CharField(),
                        'last_name': serializers.CharField(),
                        'email': serializers.EmailField(required=False),
                        'phone': serializers.CharField(required=False),
                    }
                )
            }
        ),
        responses={201: inline_serializer(
            name='ReservationResponse',
            fields={'message': serializers.CharField(), 'reservation_id': serializers.UUIDField()}
        )}
    )
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
                publish_event('seat.updated', {
                    'trip_id': trip_id,
                    'seats': seats,
                    'status': 'RESERVED'
                })
            except Exception as e:
                print("Error notificando a realtime:", e)

            return Response({'message': 'Reserva creada', 'reservation_id': reserva.id}, status=status.HTTP_201_CREATED)

        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)