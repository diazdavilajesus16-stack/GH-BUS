from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("configuraciones-asientos", views.ConfiguracionAsientosViewSet, basename="configuracion-asientos")
router.register("vehiculos", views.VehiculoViewSet, basename="vehiculo")
router.register("tipos-documento-vehicular", views.TipoDocumentoVehicularViewSet, basename="tipo-documento-vehicular")
router.register("documentos-vehiculares", views.DocumentoVehicularViewSet, basename="documento-vehicular")
router.register("mantenimientos", views.MantenimientoViewSet, basename="mantenimiento")

urlpatterns = router.urls
