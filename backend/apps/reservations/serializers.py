from rest_framework import serializers
from .models import Reservation, ReservationSeat
from apps.tickets.serializers import TicketSerializer

class ReservationSeatSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReservationSeat
        fields = ['seat_number']

class ReservationSerializer(serializers.ModelSerializer):
    seats = ReservationSeatSerializer(many=True, read_only=True)
    tickets = TicketSerializer(many=True, read_only=True)
    
    class Meta:
        model = Reservation
        fields = ['id', 'trip', 'status', 'total_amount', 'created_at', 'expires_at', 'seats', 'tickets']