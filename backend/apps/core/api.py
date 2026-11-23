"""Base común de las APIs de catálogos (rutas, flota, conductores…)."""
import json

from django.core.serializers.json import DjangoJSONEncoder
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from apps.audit.services import Accion, registrar
from apps.users.permissions import HasRoleForMethod


def _snapshot(obj, campos) -> dict:
    """Valores actuales de los campos indicados, listos para guardarse como JSON en la bitácora."""
    datos = {}
    for nombre in campos:
        try:
            campo = obj._meta.get_field(nombre)
        except Exception:  # claves del serializador que no son columnas (p. ej. «pisos»)
            continue
        if not getattr(campo, "concrete", False) or campo.many_to_many:
            continue
        datos[nombre] = getattr(obj, campo.attname)
    return json.loads(json.dumps(datos, cls=DjangoJSONEncoder, default=str))


class CatalogViewSet(viewsets.ModelViewSet):
    """CRUD sin borrado: los registros de negocio se desactivan, no se eliminan (regla de diseño §0).

    Subclases declaran `read_roles` y `write_roles`. Si falta alguna, nadie accede (falla cerrado).
    Cada alta y cada cambio queda en la bitácora de auditoría.
    """

    http_method_names = ["get", "post", "patch", "head", "options"]
    permission_classes = [IsAuthenticated, HasRoleForMethod]
    read_roles: tuple = ()
    write_roles: tuple = ()

    def _entidad(self) -> str:
        return self.get_queryset().model._meta.db_table

    def perform_create(self, serializer):
        obj = serializer.save()
        registrar(request=self.request, accion=Accion.CREAR, entidad=self._entidad(), entidad_id=obj.pk,
                  cambios=_snapshot(obj, serializer.validated_data.keys()))

    def perform_update(self, serializer):
        campos = list(serializer.validated_data.keys())
        antes = _snapshot(serializer.instance, campos)
        obj = serializer.save()
        despues = _snapshot(obj, campos)
        cambios = {k: [antes[k], despues[k]] for k in antes if antes[k] != despues.get(k)}
        if cambios:
            registrar(request=self.request, accion=Accion.MODIFICAR, entidad=self._entidad(), entidad_id=obj.pk,
                      cambios=cambios)
