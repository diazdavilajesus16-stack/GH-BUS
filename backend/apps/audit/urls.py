from rest_framework.routers import SimpleRouter

from .views import AuditoriaViewSet

router = SimpleRouter()
router.register("auditoria", AuditoriaViewSet, basename="auditoria")

urlpatterns = router.urls
