from django.urls import path
from .views import SeatMapView, CreateReservationView, PayReservationView

urlpatterns = [
    path('trips/<int:trip_id>/seats/', SeatMapView.as_view(), name='seat-map'),
    path('reservations/', CreateReservationView.as_view(), name='create-reservation'),
    path('reservations/<uuid:reservation_id>/pay/', PayReservationView.as_view(), name='pay-reservation'),
]