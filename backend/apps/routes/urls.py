from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("ciudades", views.CiudadViewSet, basename="ciudad")
router.register("tipos-servicio", views.TipoServicioViewSet, basename="tipo-servicio")
router.register("rutas", views.RutaViewSet, basename="ruta")
router.register("paradas", views.ParadaViewSet, basename="parada")
router.register("tarifas", views.TarifaViewSet, basename="tarifa")
router.register("horarios", views.HorarioViewSet, basename="horario")

urlpatterns = router.urls
