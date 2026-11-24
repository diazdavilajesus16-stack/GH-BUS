from rest_framework import serializers
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