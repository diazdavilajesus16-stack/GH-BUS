from django.db.models import Max, Q

from apps.core.api import CatalogViewSet
from apps.users.roles import ADMINISTRADOR, DESPACHADOR

from .models import Conductor, Licencia, TurnoConductor
from .serializers import ConductorSerializer, LicenciaSerializer, TurnoSerializer

PERSONAL_OPERATIVO = (ADMINISTRADOR, DESPACHADOR)  # datos personales: solo quien administra la operación


class ConductorViewSet(CatalogViewSet):
    serializer_class = ConductorSerializer
    read_roles = write_roles = PERSONAL_OPERATIVO
    filterset_fields = ["activo"]
    search_fields = ["dni", "nombres", "apellidos"]
    ordering_fields = ["apellidos", "licencia_vence"]

    def get_queryset(self):
        return Conductor.objects.select_related("usuario").annotate(
            licencia_vence=Max("licencias__fecha_vencimiento", filter=Q(licencias__activa=True))
        ).order_by("apellidos", "nombres")


class LicenciaViewSet(CatalogViewSet):
    queryset = Licencia.objects.select_related("conductor")
    serializer_class = LicenciaSerializer
    read_roles = write_roles = PERSONAL_OPERATIVO
    filterset_fields = ["conductor", "categoria", "activa"]
    search_fields = ["numero", "conductor__dni", "conductor__apellidos"]
    ordering_fields = ["fecha_vencimiento"]


class TurnoViewSet(CatalogViewSet):
    queryset = TurnoConductor.objects.select_related("conductor")
    serializer_class = TurnoSerializer
    read_roles = write_roles = PERSONAL_OPERATIVO
    filterset_fields = ["conductor", "tipo"]
    ordering_fields = ["inicio"]
