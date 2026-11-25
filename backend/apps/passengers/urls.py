from django.urls import path

from .views import PassengerListView

urlpatterns = [
    path("passengers/management/", PassengerListView.as_view(), name="passenger-list"),
]
