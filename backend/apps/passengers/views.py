from django.db.models import Count
from rest_framework import filters
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated

from apps.users.permissions import HasAnyRole
from apps.users.roles import ADMINISTRADOR, CAJERO

from .models import Passenger
from .serializers import PassengerListSerializer


class PassengerListView(ListAPIView):
    permission_classes = [IsAuthenticated, HasAnyRole]
    allowed_roles = (ADMINISTRADOR, CAJERO)
    serializer_class = PassengerListSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        "document_number",
        "first_name",
        "last_name",
        "email",
        "phone",
    ]
    ordering_fields = ["created_at", "first_name", "last_name", "document_number", "ticket_count"]
    ordering = ["-created_at"]

    def get_queryset(self):
        return Passenger.objects.annotate(ticket_count=Count("tickets", distinct=True))
