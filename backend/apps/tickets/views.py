from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.trips.models import AsignacionConductor
from apps.users.permissions import HasAnyRole
from apps.users.roles import ADMINISTRADOR, CONDUCTOR, DESPACHADOR

from .models import Ticket
from .serializers import ValidateTicketSerializer


class ValidateTicketView(APIView):
    permission_classes = [IsAuthenticated, HasAnyRole]
    allowed_roles = [ADMINISTRADOR, DESPACHADOR, CONDUCTOR]

    def post(self, request):
        serializer = ValidateTicketSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        qr_code = serializer.validated_data["qr_code"]
        roles = set(request.user.role_names())

        with transaction.atomic():
            ticket = (
                Ticket.objects.select_for_update()
                .select_related("passenger", "reservation__trip")
                .filter(qr_code=qr_code)
                .first()
            )
            if ticket is None:
                return Response({"error": "Boleto no encontrado."}, status=status.HTTP_404_NOT_FOUND)

            if not roles.intersection({ADMINISTRADOR, DESPACHADOR}):
                asignado = AsignacionConductor.objects.filter(
                    viaje=ticket.reservation.trip,
                    conductor__usuario=request.user,
                    activa=True
                ).exists()
                if not asignado:
                    raise PermissionDenied("No estás asignado a este viaje.")

            if ticket.status == "BOARDED":
                return Response(
                    {"error": "Este boleto ya fue validado para abordar."},
                    status=status.HTTP_409_CONFLICT
                )
            if ticket.status != "PAID":
                return Response(
                    {"error": "El boleto no está pagado y no puede abordar."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            ticket.status = "BOARDED"
            ticket.boarded_at = timezone.now()
            ticket.save(update_fields=["status", "boarded_at"])

        return Response({
            "message": "Boleto validado correctamente.",
            "ticket": {
                "id": str(ticket.pk),
                "trip_code": ticket.reservation.trip.codigo,
                "seat_number": ticket.seat_number,
                "passenger": f"{ticket.passenger.first_name} {ticket.passenger.last_name}",
                "status": ticket.status,
                "boarded_at": ticket.boarded_at,
            },
        }, status=status.HTTP_200_OK)
