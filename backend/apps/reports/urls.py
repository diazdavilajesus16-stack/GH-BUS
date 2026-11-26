from django.urls import path

from .views import ReportesEstadisticasView

urlpatterns = [
    path("reportes/estadisticas/", ReportesEstadisticasView.as_view(), name="reportes-estadisticas"),
]
