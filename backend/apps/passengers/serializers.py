from rest_framework import serializers
from .models import Passenger

class PassengerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Passenger
        fields = ['id', 'document_type', 'document_number', 'first_name', 'last_name', 'email', 'phone']