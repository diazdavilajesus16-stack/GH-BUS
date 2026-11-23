from django.db import transaction
from rest_framework.response import Response

from apps.core.api import CatalogViewSet
from apps.users.roles import ADMINISTRADOR, DESPACHADOR

from .models import ConfiguracionAsientos, DocumentoVehicular, Mantenimiento, TipoDocumentoVehicular, Vehiculo
from .serializers import (
    ConfiguracionAsientosCreateSerializer, ConfiguracionAsientosSerializer, ConfiguracionAsientosUpdateSerializer,
    DocumentoVehicularSerializer, MantenimientoSerializer, TipoDocumentoVehicularSerializer, VehiculoSerializer,
)

FLOTA = (ADMINISTRADOR, DESPACHADOR)


class ConfiguracionAsientosViewSet(CatalogViewSet):
    queryset = ConfiguracionAsientos.objects.prefetch_related("asientos")
    read_roles = write_roles = FLOTA
    search_fields = ["nombre"]

    def get_serializer_class(self):
        if self.action == "create":
            return ConfiguracionAsientosCreateSerializer
        if self.action in ("update", "partial_update"):
            return ConfiguracionAsientosUpdateSerializer
        return ConfiguracionAsientosSerializer

    def create(self, request, *args, **kwargs):
        entrada = self.get_serializer(data=request.data)
        entrada.is_valid(raise_exception=True)
        obj = entrada.save()
        from apps.audit.services import Accion, registrar

        registrar(request=request, accion=Accion.CREAR, entidad=self._entidad(), entidad_id=obj.pk,
                  cambios={"nombre": obj.nombre, "pisos": obj.pisos, "total_asientos": obj.total_asientos})
        return Response(ConfiguracionAsientosSerializer(obj).data, status=201)

    def partial_update(self, request, *args, **kwargs):
        obj = self.get_object()
        entrada = self.get_serializer(obj, data=request.data, partial=True)
        entrada.is_valid(raise_exception=True)
        self.perform_update(entrada)
        return Response(ConfiguracionAsientosSerializer(obj).data)


class VehiculoViewSet(CatalogViewSet):
    queryset = Vehiculo.objects.select_related("configuracion_asientos", "tipo_servicio")
    serializer_class = VehiculoSerializer
    read_roles = write_roles = FLOTA
    filterset_fields = ["estado", "activo", "tipo_servicio"]
    search_fields = ["placa", "marca", "modelo"]
    ordering_fields = ["placa", "anio", "estado"]


class TipoDocumentoVehicularViewSet(CatalogViewSet):
    """Los tipos vienen de la migración inicial; el administrador solo ajusta si bloquean y los días de alerta."""

    queryset = TipoDocumentoVehicular.objects.all()
    serializer_class = TipoDocumentoVehicularSerializer
    read_roles = FLOTA
    write_roles = (ADMINISTRADOR,)
    http_method_names = ["get", "patch", "head", "options"]


class DocumentoVehicularViewSet(CatalogViewSet):
    queryset = DocumentoVehicular.objects.select_related("vehiculo", "tipo")
    serializer_class = DocumentoVehicularSerializer
    read_roles = write_roles = FLOTA
    filterset_fields = ["vehiculo", "tipo"]
    search_fields = ["numero", "vehiculo__placa"]
    ordering_fields = ["fecha_vencimiento"]


class MantenimientoViewSet(CatalogViewSet):
    queryset = Mantenimiento.objects.select_related("vehiculo")
    serializer_class = MantenimientoSerializer
    read_roles = write_roles = FLOTA
    filterset_fields = ["vehiculo", "estado", "tipo"]
    search_fields = ["descripcion", "vehiculo__placa", "proveedor"]
    ordering_fields = ["fecha_inicio"]

    def perform_create(self, serializer):
        from apps.audit.services import Accion, registrar

        with transaction.atomic():
            obj = serializer.save(registrado_por=self.request.user)
        registrar(request=self.request, accion=Accion.CREAR, entidad=self._entidad(), entidad_id=obj.pk,
                  cambios={"vehiculo": obj.vehiculo_id, "tipo": obj.tipo, "estado": obj.estado})
