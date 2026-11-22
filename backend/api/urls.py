from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from .views import HealthView

urlpatterns = [
    path("health/", HealthView.as_view(), name="health"),
    # Autenticación, usuarios y roles
    path("", include("apps.users.urls")),
    # Operación y despacho: catálogos
    path("", include("apps.routes.urls")),
    path("", include("apps.fleet.urls")),
    path("", include("apps.drivers.urls")),
    path("", include("apps.operations.urls")),
    path("", include("apps.trips.urls")),
    # Módulo Comercial (Reservas y Boletos)
    path("", include("apps.reservations.urls")),  # <-- ESTA LÍNEA FALTA
    # Bitácora de auditoría
    path("", include("apps.audit.urls")),
    # Documentación OpenAPI / Swagger
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path("docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
]