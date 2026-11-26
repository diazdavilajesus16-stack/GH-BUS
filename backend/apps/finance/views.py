from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import CharField, Count, DecimalField, OuterRef, Prefetch, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import filters, status
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.permissions import HasAnyRole
from apps.trips.models import Viaje
from apps.users.roles import ADMINISTRADOR, CAJERO

from .models import CashMovement, CashRegister, TripExpense, TripSettlement
from .serializers import (
    CashMovementSerializer,
    CashRegisterCloseSerializer,
    CashRegisterOpenSerializer,
    CashRegisterSerializer,
    ManualCashMovementSerializer,
    TripExpenseCreateSerializer,
    TripExpenseSerializer,
    TripSettlementListSerializer,
)


ROLES_CAJA = (ADMINISTRADOR, CAJERO)
MONTO_CERO = Value(Decimal("0.00"), output_field=DecimalField(max_digits=12, decimal_places=2))


def cajas_con_totales(queryset):
    return queryset.annotate(
        income_total=Coalesce(
            Sum("movements__amount", filter=Q(movements__movement_type=CashMovement.MovementType.INCOME)),
            MONTO_CERO,
            output_field=DecimalField(max_digits=12, decimal_places=2),
        ),
        expense_total=Coalesce(
            Sum("movements__amount", filter=Q(movements__movement_type=CashMovement.MovementType.EXPENSE)),
            MONTO_CERO,
            output_field=DecimalField(max_digits=12, decimal_places=2),
        ),
    )


class CashSummaryView(APIView):
    permission_classes = [IsAuthenticated, HasAnyRole]
    allowed_roles = ROLES_CAJA

    def get(self, request):
        es_admin = ADMINISTRADOR in request.user.role_names()
        cajas_abiertas = CashRegister.objects.filter(closed_at__isnull=True).select_related("owner")
        if not es_admin:
            cajas_abiertas = cajas_abiertas.filter(owner=request.user)
        cajas_abiertas = cajas_con_totales(cajas_abiertas)

        caja_actual = next((caja for caja in cajas_abiertas if caja.owner_id == request.user.id), None)
        ventas_sin_caja = {"count": 0, "total": Decimal("0.00")}
        if es_admin:
            ventas_sin_caja = CashMovement.objects.filter(
                source=CashMovement.Source.SALE,
                cash_register__isnull=True,
            ).aggregate(
                count=Count("id"),
                total=Coalesce(
                    Sum("amount"),
                    MONTO_CERO,
                    output_field=DecimalField(max_digits=12, decimal_places=2),
                ),
            )
        return Response({
            "current_register": CashRegisterSerializer(caja_actual).data if caja_actual else None,
            "open_registers": CashRegisterSerializer(cajas_abiertas, many=True).data,
            "unassigned_sales": {
                "count": ventas_sin_caja["count"] if es_admin else 0,
                "total": str(ventas_sin_caja["total"] if es_admin else Decimal("0.00")),
            },
        })


class CashRegisterOpenView(APIView):
    permission_classes = [IsAuthenticated, HasAnyRole]
    allowed_roles = ROLES_CAJA

    def post(self, request):
        serializer = CashRegisterOpenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            get_user_model().objects.select_for_update().get(pk=request.user.pk)
            if CashRegister.objects.filter(owner=request.user, closed_at__isnull=True).exists():
                return Response(
                    {"error": "Ya tienes una caja abierta."},
                    status=status.HTTP_409_CONFLICT,
                )
            caja = CashRegister.objects.create(
                owner=request.user,
                opening_amount=serializer.validated_data["opening_amount"],
            )

        caja = cajas_con_totales(CashRegister.objects.filter(pk=caja.pk)).select_related("owner").get()
        return Response(CashRegisterSerializer(caja).data, status=status.HTTP_201_CREATED)


class CashMovementListCreateView(ListAPIView):
    permission_classes = [IsAuthenticated, HasAnyRole]
    allowed_roles = ROLES_CAJA
    serializer_class = CashMovementSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        "description",
        "cash_register__owner__first_name",
        "cash_register__owner__last_name",
        "cash_register__owner__username",
    ]
    ordering_fields = ["created_at", "amount", "movement_type"]
    ordering = ["-created_at", "-id"]

    def get_queryset(self):
        queryset = CashMovement.objects.select_related("cash_register__owner")
        if ADMINISTRADOR not in self.request.user.role_names():
            queryset = queryset.filter(cash_register__owner=self.request.user)

        movement_type = self.request.query_params.get("movement_type")
        valid_types = CashMovement.MovementType.values
        if movement_type in valid_types:
            queryset = queryset.filter(movement_type=movement_type)

        source = self.request.query_params.get("source")
        if source in CashMovement.Source.values:
            queryset = queryset.filter(source=source)
        return queryset

    def post(self, request, *args, **kwargs):
        serializer = ManualCashMovementSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            caja = CashRegister.objects.select_for_update().filter(
                owner=request.user,
                closed_at__isnull=True,
            ).first()
            if caja is None:
                return Response(
                    {"error": "Abre una caja antes de registrar movimientos."},
                    status=status.HTTP_409_CONFLICT,
                )
            movimiento_data = serializer.validated_data
            if movimiento_data["movement_type"] == CashMovement.MovementType.EXPENSE:
                totales = caja.movements.aggregate(
                    ingresos=Coalesce(
                        Sum("amount", filter=Q(movement_type=CashMovement.MovementType.INCOME)),
                        Decimal("0.00"),
                    ),
                    egresos=Coalesce(
                        Sum("amount", filter=Q(movement_type=CashMovement.MovementType.EXPENSE)),
                        Decimal("0.00"),
                    ),
                )
                saldo_disponible = caja.opening_amount + totales["ingresos"] - totales["egresos"]
                if movimiento_data["amount"] > saldo_disponible:
                    return Response(
                        {"error": "El egreso supera el saldo disponible en caja."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            movimiento = CashMovement.objects.create(
                cash_register=caja,
                created_by=request.user,
                source=CashMovement.Source.MANUAL,
                **movimiento_data,
            )

        movimiento = CashMovement.objects.select_related("cash_register__owner").get(pk=movimiento.pk)
        return Response(CashMovementSerializer(movimiento).data, status=status.HTTP_201_CREATED)


class CashRegisterCloseView(APIView):
    permission_classes = [IsAuthenticated, HasAnyRole]
    allowed_roles = ROLES_CAJA

    def post(self, request):
        serializer = CashRegisterCloseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            caja = CashRegister.objects.select_for_update().filter(
                owner=request.user,
                closed_at__isnull=True,
            ).first()
            if caja is None:
                return Response(
                    {"error": "No tienes una caja abierta para cerrar."},
                    status=status.HTTP_409_CONFLICT,
                )

            totals = caja.movements.aggregate(
                income=Coalesce(
                    Sum("amount", filter=Q(movement_type=CashMovement.MovementType.INCOME)),
                    Decimal("0.00"),
                ),
                expense=Coalesce(
                    Sum("amount", filter=Q(movement_type=CashMovement.MovementType.EXPENSE)),
                    Decimal("0.00"),
                ),
            )
            expected_amount = caja.opening_amount + totals["income"] - totals["expense"]
            closing_amount = serializer.validated_data["closing_amount"]
            caja.closing_amount = closing_amount
            caja.closed_at = timezone.now()
            caja.save(update_fields=["closing_amount", "closed_at"])

        caja = cajas_con_totales(CashRegister.objects.filter(pk=caja.pk)).select_related("owner").get()
        return Response({
            "register": CashRegisterSerializer(caja).data,
            "difference": str(closing_amount - expected_amount),
        })


class TripSettlementListView(ListAPIView):
    permission_classes = [IsAuthenticated, HasAnyRole]
    allowed_roles = (ADMINISTRADOR,)
    serializer_class = TripSettlementListSerializer
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["codigo", "ruta__origen__nombre", "ruta__destino__nombre"]
    ordering_fields = ["codigo", "salida_programada"]
    ordering = ["-salida_programada"]

    def get_queryset(self):
        sales_by_trip = (
            CashMovement.objects.filter(
                reservation__trip_id=OuterRef("pk"),
                source=CashMovement.Source.SALE,
            )
            .order_by()
            .values("reservation__trip_id")
            .annotate(total=Sum("amount"))
            .values("total")[:1]
        )
        expenses_by_trip = (
            TripExpense.objects.filter(settlement__trip_id=OuterRef("pk"))
            .order_by()
            .values("settlement__trip_id")
            .annotate(total=Sum("amount"))
            .values("total")[:1]
        )
        settlement = TripSettlement.objects.filter(trip_id=OuterRef("pk")).order_by()
        queryset = (
            Viaje.objects.filter(estado=Viaje.Estado.FINALIZADO)
            .select_related("ruta__origen", "ruta__destino")
            .annotate(
                settlement_id=Subquery(settlement.values("id")[:1]),
                settlement_status=Coalesce(
                    Subquery(settlement.values("status")[:1]),
                    Value("PENDING"),
                    output_field=CharField(),
                ),
                settlement_closed_at=Subquery(settlement.values("closed_at")[:1]),
                income_snapshot=Subquery(settlement.values("income_snapshot")[:1]),
                expense_snapshot=Subquery(settlement.values("expense_snapshot")[:1]),
                net_snapshot=Subquery(settlement.values("net_snapshot")[:1]),
                sales_income=Coalesce(
                    Subquery(sales_by_trip),
                    MONTO_CERO,
                    output_field=DecimalField(max_digits=12, decimal_places=2),
                ),
                calculated_expenses=Coalesce(
                    Subquery(expenses_by_trip),
                    MONTO_CERO,
                    output_field=DecimalField(max_digits=12, decimal_places=2),
                ),
            )
            .prefetch_related(
                Prefetch(
                    "settlement__expenses",
                    queryset=TripExpense.objects.select_related("created_by"),
                )
            )
        )

        status_filter = self.request.query_params.get("status")
        if status_filter in ("PENDING", TripSettlement.Status.DRAFT, TripSettlement.Status.CLOSED):
            queryset = queryset.filter(settlement_status=status_filter)
        return queryset


class TripExpenseCreateView(APIView):
    permission_classes = [IsAuthenticated, HasAnyRole]
    allowed_roles = (ADMINISTRADOR,)

    def post(self, request, trip_id):
        serializer = TripExpenseCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            trip = get_object_or_404(Viaje.objects.select_for_update(), pk=trip_id)
            if trip.estado != Viaje.Estado.FINALIZADO:
                return Response(
                    {"error": "Solo se pueden registrar gastos de viajes finalizados."},
                    status=status.HTTP_409_CONFLICT,
                )
            settlement, _ = TripSettlement.objects.get_or_create(trip=trip)
            if settlement.status == TripSettlement.Status.CLOSED:
                return Response(
                    {"error": "La liquidación de este viaje ya está cerrada."},
                    status=status.HTTP_409_CONFLICT,
                )
            expense = TripExpense.objects.create(
                settlement=settlement,
                created_by=request.user,
                **serializer.validated_data,
            )

        return Response(TripExpenseSerializer(expense).data, status=status.HTTP_201_CREATED)


class TripSettlementCloseView(APIView):
    permission_classes = [IsAuthenticated, HasAnyRole]
    allowed_roles = (ADMINISTRADOR,)

    def post(self, request, trip_id):
        with transaction.atomic():
            trip = get_object_or_404(Viaje.objects.select_for_update(), pk=trip_id)
            if trip.estado != Viaje.Estado.FINALIZADO:
                return Response(
                    {"error": "Solo se pueden liquidar viajes finalizados."},
                    status=status.HTTP_409_CONFLICT,
                )
            settlement, _ = TripSettlement.objects.get_or_create(trip=trip)
            if settlement.status == TripSettlement.Status.CLOSED:
                return Response(
                    {"error": "La liquidación de este viaje ya está cerrada."},
                    status=status.HTTP_409_CONFLICT,
                )

            income = CashMovement.objects.filter(
                reservation__trip=trip,
                source=CashMovement.Source.SALE,
            ).aggregate(total=Coalesce(Sum("amount"), Decimal("0.00")))["total"]
            expenses = settlement.expenses.aggregate(
                total=Coalesce(Sum("amount"), Decimal("0.00")),
            )["total"]
            settlement.status = TripSettlement.Status.CLOSED
            settlement.income_snapshot = income
            settlement.expense_snapshot = expenses
            settlement.net_snapshot = income - expenses
            settlement.closed_by = request.user
            settlement.closed_at = timezone.now()
            settlement.save(update_fields=[
                "status",
                "income_snapshot",
                "expense_snapshot",
                "net_snapshot",
                "closed_by",
                "closed_at",
            ])

        return Response({
            "trip_id": trip.pk,
            "status": settlement.status,
            "income_total": str(settlement.income_snapshot),
            "expense_total": str(settlement.expense_snapshot),
            "net_total": str(settlement.net_snapshot),
            "closed_at": settlement.closed_at,
        })
