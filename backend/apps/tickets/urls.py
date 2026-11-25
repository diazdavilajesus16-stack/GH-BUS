from django.urls import path

from .views import ValidateTicketView

urlpatterns = [
    path("tickets/validate/", ValidateTicketView.as_view(), name="validate-ticket"),
]
