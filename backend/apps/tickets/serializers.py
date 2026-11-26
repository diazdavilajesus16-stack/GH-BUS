from rest_framework import serializers


class ValidateTicketSerializer(serializers.Serializer):
    qr_code = serializers.CharField(max_length=100, trim_whitespace=True)
