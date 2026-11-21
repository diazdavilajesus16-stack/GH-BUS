from rest_framework.routers import SimpleRouter

from django.urls import path

from .views import AlertasView, ConfiguracionViewSet, IncidenciaViewSet

router = SimpleRouter()
router.register("configuracion", ConfiguracionViewSet, basename="configuracion")
router.register("incidencias", IncidenciaViewSet, basename="incidencia")

urlpatterns = [path("alertas/", AlertasView.as_view(), name="alertas"), *router.urls]
