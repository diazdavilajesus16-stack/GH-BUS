from rest_framework import serializers

from .models import Passenger


class PassengerListSerializer(serializers.ModelSerializer):
    ticket_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Passenger
        fields = [
            "id",
            "document_type",
            "document_number",
            "first_name",
            "last_name",
            "email",
            "phone",
            "created_at",
            "ticket_count",
        ]
