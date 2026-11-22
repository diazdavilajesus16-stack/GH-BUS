from rest_framework import serializers
from .models import Ticket
from apps.passengers.serializers import PassengerSerializer

class TicketSerializer(serializers.ModelSerializer):
    passenger = PassengerSerializer(read_only=True)
    class Meta:
        model = Ticket
        fields = ['id', 'seat_number', 'price', 'qr_code', 'status', 'passenger']