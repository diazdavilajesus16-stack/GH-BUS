from apps.core.api import CatalogViewSet
from apps.users.roles import ADMINISTRADOR, CAJERO, DESPACHADOR

from .models import Configuracion
from .serializers import ConfiguracionSerializer


class ConfiguracionViewSet(CatalogViewSet):
    """Parámetros del sistema. No se crean ni se borran: solo se ajusta su valor."""

    queryset = Configuracion.objects.all()
    serializer_class = ConfiguracionSerializer
    lookup_field = "clave"
    read_roles = (ADMINISTRADOR, DESPACHADOR, CAJERO)
    write_roles = (ADMINISTRADOR,)
    http_method_names = ["get", "patch", "head", "options"]
    pagination_class = None

    def perform_update(self, serializer):
        from apps.audit.services import Accion, registrar

        antes = serializer.instance.valor
        obj = serializer.save(updated_by=self.request.user)
        if antes != obj.valor:
            registrar(request=self.request, accion=Accion.MODIFICAR, entidad=self._entidad(), entidad_id=obj.clave,
                      cambios={"valor": [antes, obj.valor]})
