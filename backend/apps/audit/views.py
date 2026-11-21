import django_filters
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from apps.users.permissions import HasAnyRole
from apps.users.roles import ADMINISTRADOR

from .models import RegistroAuditoria
from .serializers import RegistroAuditoriaSerializer


class RegistroAuditoriaFilter(django_filters.FilterSet):
    desde = django_filters.IsoDateTimeFilter(field_name="creado_en", lookup_expr="gte")
    hasta = django_filters.IsoDateTimeFilter(field_name="creado_en", lookup_expr="lte")

    class Meta:
        model = RegistroAuditoria
        fields = ["accion", "entidad", "entidad_id", "usuario"]


class AuditoriaViewSet(viewsets.ReadOnlyModelViewSet):
    """Consulta de la bitácora. Solo lectura y solo para administradores."""

    queryset = RegistroAuditoria.objects.all()
    serializer_class = RegistroAuditoriaSerializer
    permission_classes = [IsAuthenticated, HasAnyRole]
    allowed_roles = [ADMINISTRADOR]
    filterset_class = RegistroAuditoriaFilter
    search_fields = ["usuario_nombre", "entidad", "entidad_id", "ip"]
    ordering_fields = ["creado_en", "accion", "entidad"]
    ordering = ["-creado_en", "-id"]
