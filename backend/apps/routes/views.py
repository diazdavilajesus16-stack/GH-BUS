from apps.core.api import CatalogViewSet
from apps.users.roles import ADMINISTRADOR, CAJERO, DESPACHADOR

from .models import Ciudad, Horario, Parada, Ruta, Tarifa, TipoServicio
from .serializers import (
    CiudadSerializer, HorarioSerializer, ParadaSerializer, RutaSerializer, TarifaSerializer, TipoServicioSerializer,
)

LECTURA = (ADMINISTRADOR, DESPACHADOR, CAJERO)  # el cajero necesita ver rutas y horarios para vender


class CiudadViewSet(CatalogViewSet):
    queryset = Ciudad.objects.all()
    serializer_class = CiudadSerializer
    read_roles, write_roles = LECTURA, (ADMINISTRADOR,)
    filterset_fields = ["activa", "departamento"]
    search_fields = ["nombre", "departamento"]
    ordering_fields = ["nombre", "departamento"]


class TipoServicioViewSet(CatalogViewSet):
    queryset = TipoServicio.objects.all()
    serializer_class = TipoServicioSerializer
    read_roles, write_roles = LECTURA, (ADMINISTRADOR,)
    filterset_fields = ["activo"]
    search_fields = ["codigo", "nombre"]


class RutaViewSet(CatalogViewSet):
    queryset = Ruta.objects.select_related("origen", "destino")
    serializer_class = RutaSerializer
    read_roles, write_roles = LECTURA, (ADMINISTRADOR,)
    filterset_fields = ["activa", "origen", "destino"]
    search_fields = ["codigo", "nombre", "origen__nombre", "destino__nombre"]
    ordering_fields = ["codigo", "nombre", "duracion_min"]


class ParadaViewSet(CatalogViewSet):
    queryset = Parada.objects.select_related("ciudad", "ruta")
    serializer_class = ParadaSerializer
    read_roles, write_roles = LECTURA, (ADMINISTRADOR,)
    filterset_fields = ["ruta"]
    search_fields = ["ruta__codigo", "ruta__nombre", "ciudad__nombre"]
    ordering_fields = ["orden"]
    ordering = ["ruta", "orden"]


class TarifaViewSet(CatalogViewSet):
    queryset = Tarifa.objects.select_related("ruta", "tipo_servicio")
    serializer_class = TarifaSerializer
    read_roles, write_roles = LECTURA, (ADMINISTRADOR,)
    filterset_fields = ["ruta", "tipo_servicio", "activa"]
    search_fields = ["ruta__codigo", "ruta__nombre"]
    ordering_fields = ["vigente_desde", "monto"]


class HorarioViewSet(CatalogViewSet):
    queryset = Horario.objects.select_related("ruta", "tipo_servicio")
    serializer_class = HorarioSerializer
    read_roles = LECTURA
    write_roles = (ADMINISTRADOR, DESPACHADOR)
    filterset_fields = ["ruta", "tipo_servicio", "activo"]
    search_fields = ["ruta__codigo", "ruta__nombre"]
    ordering_fields = ["hora_salida", "vigente_desde"]
