from django.urls import path
from .views import SeatMapView, CreateReservationView

urlpatterns = [
    path('trips/<int:trip_id>/seats/', SeatMapView.as_view(), name='seat-map'),
    path('reservations/', CreateReservationView.as_view(), name='create-reservation'),
]