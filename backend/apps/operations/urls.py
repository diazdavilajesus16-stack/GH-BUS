from rest_framework.routers import SimpleRouter

from .views import ConfiguracionViewSet

router = SimpleRouter()
router.register("configuracion", ConfiguracionViewSet, basename="configuracion")

urlpatterns = router.urls
