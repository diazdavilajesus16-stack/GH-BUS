from rest_framework import serializers

from apps.tickets.models import Ticket

from .models import Reservation, ReservationSeat

class ReservationSeatSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReservationSeat
        fields = ['seat_number']

class ReservationSerializer(serializers.ModelSerializer):
    seats = ReservationSeatSerializer(many=True, read_only=True)

    class Meta:
        model = Reservation
        fields = ['id', 'trip', 'status', 'total_amount', 'created_at', 'expires_at', 'seats']


class ReservationListSerializer(serializers.ModelSerializer):
    trip_code = serializers.CharField(source='trip.codigo', read_only=True)
    origin = serializers.CharField(source='trip.ruta.origen.nombre', read_only=True)
    destination = serializers.CharField(source='trip.ruta.destino.nombre', read_only=True)
    departure_at = serializers.DateTimeField(source='trip.salida_programada', read_only=True)
    passenger_name = serializers.SerializerMethodField()
    seat_numbers = serializers.SerializerMethodField()

    class Meta:
        model = Reservation
        fields = [
            'id',
            'status',
            'payment_method',
            'total_amount',
            'created_at',
            'expires_at',
            'trip_code',
            'origin',
            'destination',
            'departure_at',
            'passenger_name',
            'seat_numbers',
        ]

    def get_passenger_name(self, reservation):
        ticket = next(iter(reservation.tickets.all()), None)
        if ticket is None:
            return ''
        return f'{ticket.passenger.first_name} {ticket.passenger.last_name}'.strip()

    def get_seat_numbers(self, reservation):
        reservation_seats = list(reservation.seats.all())
        if reservation_seats:
            return sorted(seat.seat_number for seat in reservation_seats)
        return sorted(ticket.seat_number for ticket in reservation.tickets.all())


class MisBoletosSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ticket
        fields = ['seat_number', 'status', 'qr_code']
        read_only_fields = fields


class MiReservaSerializer(serializers.ModelSerializer):
    trip_code = serializers.CharField(source='trip.codigo', read_only=True)
    origin = serializers.CharField(source='trip.ruta.origen.nombre', read_only=True)
    destination = serializers.CharField(source='trip.ruta.destino.nombre', read_only=True)
    departure_at = serializers.DateTimeField(source='trip.salida_programada', read_only=True)
    passenger_name = serializers.SerializerMethodField()
    tickets = MisBoletosSerializer(many=True, read_only=True)

    class Meta:
        model = Reservation
        fields = [
            'id',
            'status',
            'payment_method',
            'total_amount',
            'created_at',
            'expires_at',
            'confirmed_at',
            'trip_code',
            'origin',
            'destination',
            'departure_at',
            'passenger_name',
            'tickets',
        ]
        read_only_fields = fields

    def get_passenger_name(self, reservation):
        ticket = next(iter(reservation.tickets.all()), None)
        if ticket is None:
            return ''
        return f'{ticket.passenger.first_name} {ticket.passenger.last_name}'.strip()