from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, DecimalField, IntegerField, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.finance.models import CashMovement, TripSettlement
from apps.tickets.models import Ticket
from apps.trips.models import Viaje
from apps.users.permissions import HasAnyRole
from apps.users.roles import ADMINISTRADOR


MONTO_CERO = Value(Decimal("0.00"), output_field=DecimalField(max_digits=14, decimal_places=2))


def _formatear_monto(valor):
    return f"{valor:.2f}"


class RangoReporteSerializer(serializers.Serializer):
    desde = serializers.DateField(required=False)
    hasta = serializers.DateField(required=False)

    def validate(self, attrs):
        if attrs.get("desde") and attrs.get("hasta") and attrs["desde"] > attrs["hasta"]:
            raise serializers.ValidationError({"hasta": "La fecha final debe ser igual o posterior a la inicial."})
        return attrs


class ReportesEstadisticasView(APIView):
    permission_classes = [IsAuthenticated, HasAnyRole]
    allowed_roles = (ADMINISTRADOR,)

    def get(self, request):
        rango = RangoReporteSerializer(data=request.query_params)
        rango.is_valid(raise_exception=True)
        hoy = timezone.localdate()
        hasta = rango.validated_data.get("hasta", hoy)
        desde = rango.validated_data.get("desde", hasta - timedelta(days=29))
        if desde > hasta:
            raise serializers.ValidationError(
                {"hasta": "La fecha final debe ser igual o posterior a la inicial."}
            )

        movimientos_venta = CashMovement.objects.filter(
            created_at__date__range=(desde, hasta),
            source=CashMovement.Source.SALE,
            movement_type=CashMovement.MovementType.INCOME,
        )
        ventas = movimientos_venta.aggregate(
            cantidad=Count("id"),
            total=Coalesce(Sum("amount"), MONTO_CERO),
        )

        movimientos_manuales = CashMovement.objects.filter(
            created_at__date__range=(desde, hasta),
            source=CashMovement.Source.MANUAL,
        )
        finanzas = movimientos_manuales.aggregate(
            ingresos=Coalesce(
                Sum("amount", filter=Q(movement_type=CashMovement.MovementType.INCOME)),
                MONTO_CERO,
            ),
            egresos=Coalesce(
                Sum("amount", filter=Q(movement_type=CashMovement.MovementType.EXPENSE)),
                MONTO_CERO,
            ),
        )

        viajes = Viaje.objects.filter(salida_programada__date__range=(desde, hasta))
        estados_viaje = {
            fila["estado"]: fila["cantidad"]
            for fila in viajes.values("estado").annotate(cantidad=Count("id"))
        }
        capacidad = viajes.aggregate(
            total=Coalesce(
                Sum("vehiculo__configuracion_asientos__total_asientos"),
                Value(0, output_field=IntegerField()),
            )
        )["total"]
        boletos_ocupados = Ticket.objects.filter(
            reservation__trip__in=viajes,
            status__in=("PAID", "BOARDED"),
        ).count()

        embarque = Ticket.objects.filter(
            boarded_at__date__range=(desde, hasta),
            status="BOARDED",
        ).aggregate(abordados=Count("id"))
        pendientes_embarque = Ticket.objects.filter(
            reservation__trip__salida_programada__date__range=(desde, hasta),
            status="PAID",
        ).count()

        liquidaciones_cerradas = TripSettlement.objects.filter(
            status=TripSettlement.Status.CLOSED,
            closed_at__date__range=(desde, hasta),
        ).aggregate(
            cantidad=Count("id"),
            ingresos=Coalesce(Sum("income_snapshot"), MONTO_CERO),
            egresos=Coalesce(Sum("expense_snapshot"), MONTO_CERO),
            neto=Coalesce(Sum("net_snapshot"), MONTO_CERO),
        )
        liquidaciones_pendientes = Viaje.objects.filter(
            estado=Viaje.Estado.FINALIZADO,
            salida_programada__date__range=(desde, hasta),
        ).exclude(settlement__status=TripSettlement.Status.CLOSED).count()

        return Response({
            "desde": desde,
            "hasta": hasta,
            "ventas": {
                "cantidad": ventas["cantidad"],
                "total": _formatear_monto(ventas["total"]),
            },
            "viajes": {
                "cantidad": viajes.count(),
                "por_estado": [
                    {
                        "estado": estado,
                        "nombre": nombre,
                        "cantidad": estados_viaje.get(estado, 0),
                    }
                    for estado, nombre in Viaje.Estado.choices
                ],
                "capacidad_total": capacidad,
                "boletos_ocupados": boletos_ocupados,
                "ocupacion_porcentaje": round(boletos_ocupados * 100 / capacidad, 1) if capacidad else 0,
            },
            "finanzas": {
                "ingresos_manuales": _formatear_monto(finanzas["ingresos"]),
                "egresos_manuales": _formatear_monto(finanzas["egresos"]),
                "liquidaciones_cerradas": liquidaciones_cerradas["cantidad"],
                "ingresos_liquidados": _formatear_monto(liquidaciones_cerradas["ingresos"]),
                "egresos_liquidados": _formatear_monto(liquidaciones_cerradas["egresos"]),
                "neto_liquidado": _formatear_monto(liquidaciones_cerradas["neto"]),
                "liquidaciones_pendientes": liquidaciones_pendientes,
            },
            "embarque": {
                "abordados": embarque["abordados"],
                "pendientes": pendientes_embarque,
            },
        })
