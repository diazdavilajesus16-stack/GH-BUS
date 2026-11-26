from django.urls import path
from .views import CreateReservationView, MyReservationListView, PayReservationView, ReservationListView, SeatMapView

urlpatterns = [
    path('trips/<int:trip_id>/seats/', SeatMapView.as_view(), name='seat-map'),
    path('reservations/', CreateReservationView.as_view(), name='create-reservation'),
    path('reservations/my/', MyReservationListView.as_view(), name='my-reservations'),
    path('reservations/management/', ReservationListView.as_view(), name='reservation-list'),
    path('reservations/<uuid:reservation_id>/pay/', PayReservationView.as_view(), name='pay-reservation'),
]