from decimal import Decimal

from rest_framework import serializers

from apps.trips.models import Viaje

from .models import CashMovement, CashRegister, TripExpense


class CashRegisterSerializer(serializers.ModelSerializer):
    owner_name = serializers.SerializerMethodField()
    income_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    expense_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    expected_amount = serializers.SerializerMethodField()

    class Meta:
        model = CashRegister
        fields = [
            "id",
            "owner_name",
            "opening_amount",
            "opened_at",
            "closed_at",
            "closing_amount",
            "income_total",
            "expense_total",
            "expected_amount",
        ]
        read_only_fields = fields

    def get_owner_name(self, cash_register):
        name = cash_register.owner.get_full_name().strip()
        return name or cash_register.owner.get_username()

    def get_expected_amount(self, cash_register):
        income = getattr(cash_register, "income_total", Decimal("0.00"))
        expense = getattr(cash_register, "expense_total", Decimal("0.00"))
        return cash_register.opening_amount + income - expense


class CashMovementSerializer(serializers.ModelSerializer):
    cash_register = serializers.IntegerField(source="cash_register_id", read_only=True, allow_null=True)
    cashier_name = serializers.SerializerMethodField()
    reservation = serializers.UUIDField(source="reservation_id", read_only=True, allow_null=True)

    class Meta:
        model = CashMovement
        fields = [
            "id",
            "cash_register",
            "cashier_name",
            "reservation",
            "movement_type",
            "source",
            "amount",
            "description",
            "created_at",
        ]
        read_only_fields = fields

    def get_cashier_name(self, movement):
        if movement.cash_register_id is None:
            return None
        owner = movement.cash_register.owner
        return owner.get_full_name().strip() or owner.get_username()


class CashRegisterOpenSerializer(serializers.Serializer):
    opening_amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.00"),
    )


class CashRegisterCloseSerializer(serializers.Serializer):
    closing_amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.00"),
    )


class ManualCashMovementSerializer(serializers.Serializer):
    movement_type = serializers.ChoiceField(choices=CashMovement.MovementType.choices)
    amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.01"),
    )
    description = serializers.CharField(max_length=255, trim_whitespace=True)


class TripExpenseSerializer(serializers.ModelSerializer):
    category_label = serializers.CharField(source="get_category_display", read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = TripExpense
        fields = ["id", "category", "category_label", "amount", "description", "created_at", "created_by_name"]
        read_only_fields = fields

    def get_created_by_name(self, expense):
        name = expense.created_by.get_full_name().strip()
        return name or expense.created_by.get_username()


class TripExpenseCreateSerializer(serializers.Serializer):
    category = serializers.ChoiceField(choices=TripExpense.Category.choices)
    amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.01"),
    )
    description = serializers.CharField(max_length=255, trim_whitespace=True)


class TripSettlementListSerializer(serializers.ModelSerializer):
    trip_id = serializers.IntegerField(source="id", read_only=True)
    trip_code = serializers.CharField(source="codigo", read_only=True)
    origin = serializers.CharField(source="ruta.origen.nombre", read_only=True)
    destination = serializers.CharField(source="ruta.destino.nombre", read_only=True)
    departure_at = serializers.DateTimeField(source="salida_programada", read_only=True)
    settlement_id = serializers.IntegerField(read_only=True, allow_null=True)
    settlement_status = serializers.CharField(read_only=True)
    settlement_closed_at = serializers.DateTimeField(read_only=True, allow_null=True)
    income_total = serializers.SerializerMethodField()
    expense_total = serializers.SerializerMethodField()
    net_total = serializers.SerializerMethodField()
    expenses = serializers.SerializerMethodField()

    class Meta:
        model = Viaje
        fields = [
            "trip_id",
            "trip_code",
            "origin",
            "destination",
            "departure_at",
            "settlement_id",
            "settlement_status",
            "settlement_closed_at",
            "income_total",
            "expense_total",
            "net_total",
            "expenses",
        ]

    def get_income_total(self, trip):
        if trip.settlement_status == "CLOSED" and trip.income_snapshot is not None:
            return trip.income_snapshot
        return trip.sales_income or Decimal("0.00")

    def get_expense_total(self, trip):
        if trip.settlement_status == "CLOSED" and trip.expense_snapshot is not None:
            return trip.expense_snapshot
        return trip.calculated_expenses or Decimal("0.00")

    def get_net_total(self, trip):
        if trip.settlement_status == "CLOSED" and trip.net_snapshot is not None:
            return trip.net_snapshot
        return self.get_income_total(trip) - self.get_expense_total(trip)

    def get_expenses(self, trip):
        if trip.settlement_id is None:
            return []
        settlement = getattr(trip, "settlement", None)
        if settlement is None:
            return []
        return TripExpenseSerializer(settlement.expenses.all(), many=True).data
