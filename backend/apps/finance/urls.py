from django.urls import path

from .views import (
    CashMovementListCreateView,
    CashRegisterCloseView,
    CashRegisterOpenView,
    CashSummaryView,
    TripExpenseCreateView,
    TripSettlementCloseView,
    TripSettlementListView,
)

urlpatterns = [
    path("cash/summary/", CashSummaryView.as_view(), name="cash-summary"),
    path("cash/register/open/", CashRegisterOpenView.as_view(), name="cash-register-open"),
    path("cash/register/close/", CashRegisterCloseView.as_view(), name="cash-register-close"),
    path("cash/movements/", CashMovementListCreateView.as_view(), name="cash-movements"),
    path("trip-settlements/", TripSettlementListView.as_view(), name="trip-settlements"),
    path(
        "trip-settlements/<int:trip_id>/expenses/",
        TripExpenseCreateView.as_view(),
        name="trip-settlement-expenses",
    ),
    path(
        "trip-settlements/<int:trip_id>/close/",
        TripSettlementCloseView.as_view(),
        name="trip-settlement-close",
    ),
]
