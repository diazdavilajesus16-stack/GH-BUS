from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("conductores", views.ConductorViewSet, basename="conductor")
router.register("licencias", views.LicenciaViewSet, basename="licencia")
router.register("turnos", views.TurnoViewSet, basename="turno")

urlpatterns = router.urls
