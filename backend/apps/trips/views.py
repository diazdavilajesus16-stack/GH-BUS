import django_filters
from django.db.models import Prefetch
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from datetime import datetime, time, timedelta

from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.users.permissions import HasRoleForMethod
from apps.users.roles import ADMINISTRADOR, CAJERO, CONDUCTOR, DESPACHADOR

from . import services
from .models import AsignacionConductor, Viaje
from .serializers import (
    AsignarConductorSerializer, AsignarVehiculoSerializer, CambiarEstadoSerializer, GenerarSerializer,
    HistorialSerializer, QuitarConductorSerializer, ViajeCreateSerializer, ViajeSerializer, ViajeUpdateSerializer,
)

PERSONAL_DE_OPERACION = (ADMINISTRADOR, DESPACHADOR)


def _inicio_del_dia(d):
    return timezone.make_aware(datetime.combine(d, time.min))


class ViajeFilter(django_filters.FilterSet):
    estado = django_filters.BaseInFilter(field_name="estado", help_text="Uno o varios estados separados por coma")
    fecha_desde = django_filters.DateFilter(method="filtrar_desde")
    fecha_hasta = django_filters.DateFilter(method="filtrar_hasta")

    class Meta:
        model = Viaje
        fields = ["ruta", "vehiculo", "tipo_servicio"]

    def filtrar_desde(self, qs, name, valor):
        return qs.filter(salida_programada__gte=_inicio_del_dia(valor))

    def filtrar_hasta(self, qs, name, valor):  # inclusive: hasta el final de ese día
        return qs.filter(salida_programada__lt=_inicio_del_dia(valor) + timedelta(days=1))


class ViajeViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Programación, asignación y despacho de viajes. Los cambios son acciones con reglas, no ediciones libres."""

    serializer_class = ViajeSerializer
    permission_classes = [IsAuthenticated, HasRoleForMethod]
    read_roles = (ADMINISTRADOR, DESPACHADOR, CAJERO, CONDUCTOR)
    write_roles = PERSONAL_DE_OPERACION
    filterset_class = ViajeFilter
    search_fields = ["codigo", "ruta__codigo", "ruta__nombre", "vehiculo__placa"]
    ordering_fields = ["salida_programada", "estado"]
    ordering = ["salida_programada", "id"]

    def get_queryset(self):
        qs = Viaje.objects.select_related(
            "ruta__origen", "ruta__destino", "tipo_servicio", "vehiculo__configuracion_asientos"
        ).prefetch_related(
            Prefetch("asignaciones", queryset=AsignacionConductor.objects.filter(activa=True).select_related("conductor"))
        )
        roles = set(self.request.user.role_names())
        if roles & {ADMINISTRADOR, DESPACHADOR, CAJERO}:
            return qs
        # Un conductor solo ve los viajes en los que está asignado.
        return qs.filter(asignaciones__activa=True, asignaciones__conductor__usuario=self.request.user).distinct()

    def _respuesta(self, viaje_id):
        return Response(ViajeSerializer(self.get_queryset().get(pk=viaje_id)).data)

    @extend_schema(request=ViajeCreateSerializer, responses={201: ViajeSerializer})
    def create(self, request, *args, **kwargs):
        d = ViajeCreateSerializer(data=request.data)
        d.is_valid(raise_exception=True)
        viaje = services.crear_viaje(usuario=request.user, request=request, **d.validated_data)
        resp = self._respuesta(viaje.pk)
        resp.status_code = 201
        return resp

    @extend_schema(request=ViajeUpdateSerializer, responses=ViajeSerializer)
    def partial_update(self, request, *args, **kwargs):
        viaje = self.get_object()
        d = ViajeUpdateSerializer(data=request.data, partial=True)
        d.is_valid(raise_exception=True)
        services.editar_viaje(viaje.pk, d.validated_data, request.user, request)
        return self._respuesta(viaje.pk)

    @extend_schema(request=GenerarSerializer, responses={200: dict})
    @action(detail=False, methods=["post"])
    def generar(self, request):
        d = GenerarSerializer(data=request.data)
        d.is_valid(raise_exception=True)
        return Response(services.generar_viajes(usuario=request.user, request=request, **d.validated_data))

    @extend_schema(request=AsignarVehiculoSerializer, responses=ViajeSerializer)
    @action(detail=True, methods=["post"])
    def vehiculo(self, request, pk=None):
        viaje = self.get_object()
        d = AsignarVehiculoSerializer(data=request.data)
        d.is_valid(raise_exception=True)
        v = d.validated_data["vehiculo"]
        services.asignar_vehiculo(viaje.pk, v.pk if v else None, request.user, request)
        return self._respuesta(viaje.pk)

    @extend_schema(request=AsignarConductorSerializer, responses=ViajeSerializer)
    @action(detail=True, methods=["post"])
    def conductor(self, request, pk=None):
        viaje = self.get_object()
        d = AsignarConductorSerializer(data=request.data)
        d.is_valid(raise_exception=True)
        services.asignar_conductor(viaje.pk, d.validated_data["conductor"].pk, d.validated_data["rol"], request.user, request)
        return self._respuesta(viaje.pk)

    @extend_schema(request=QuitarConductorSerializer, responses=ViajeSerializer)
    @action(detail=True, methods=["post"], url_path="quitar-conductor")
    def quitar_conductor(self, request, pk=None):
        viaje = self.get_object()
        d = QuitarConductorSerializer(data=request.data)
        d.is_valid(raise_exception=True)
        services.quitar_conductor(viaje.pk, d.validated_data["conductor"].pk, request.user, request)
        return self._respuesta(viaje.pk)

    @extend_schema(request=CambiarEstadoSerializer, responses=ViajeSerializer)
    @action(detail=True, methods=["post"])
    def estado(self, request, pk=None):
        viaje = self.get_object()
        d = CambiarEstadoSerializer(data=request.data)
        d.is_valid(raise_exception=True)
        services.cambiar_estado(viaje.pk, d.validated_data["estado"], request.user,
                                d.validated_data.get("observacion", ""), request)
        return self._respuesta(viaje.pk)

    @extend_schema(responses=HistorialSerializer(many=True))
    @action(detail=True, methods=["get"], pagination_class=None)
    def historial(self, request, pk=None):
        return Response(HistorialSerializer(self.get_object().historial.select_related("cambiado_por"), many=True).data)
