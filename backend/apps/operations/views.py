from datetime import timedelta

from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.realtime import publish_event
from apps.audit.services import Accion, registrar
from apps.core.api import CatalogViewSet, _snapshot
from apps.drivers.models import Conductor, Licencia
from apps.fleet.models import DocumentoVehicular, TipoDocumentoVehicular, Vehiculo
from apps.users.permissions import HasAnyRole
from apps.users.roles import ADMINISTRADOR, CAJERO, CONDUCTOR, DESPACHADOR

from . import config
from .models import Configuracion, Incidencia
from .serializers import ConfiguracionSerializer, IncidenciaSerializer


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


class IncidenciaViewSet(CatalogViewSet):
    """Incidencias de un viaje. El conductor registra las de sus viajes; solo administración las resuelve."""

    serializer_class = IncidenciaSerializer
    read_roles = write_roles = (ADMINISTRADOR, DESPACHADOR, CONDUCTOR)
    filterset_fields = ["viaje", "tipo", "severidad", "resuelta"]
    search_fields = ["descripcion", "viaje__codigo"]
    ordering_fields = ["ocurrida_en", "severidad"]

    def _solo_propias(self):
        return not (set(self.request.user.role_names()) & {ADMINISTRADOR, DESPACHADOR})

    def get_queryset(self):
        qs = Incidencia.objects.select_related("viaje", "registrada_por")
        if self._solo_propias():
            qs = qs.filter(viaje__asignaciones__activa=True, viaje__asignaciones__conductor__usuario=self.request.user).distinct()
        return qs

    def perform_create(self, serializer):
        viaje = serializer.validated_data["viaje"]
        if self._solo_propias() and not viaje.asignaciones.filter(activa=True, conductor__usuario=self.request.user).exists():
            raise PermissionDenied("Solo puedes registrar incidencias en viajes que tienes asignados.")
        obj = serializer.save(registrada_por=self.request.user)
        registrar(request=self.request, accion=Accion.CREAR, entidad="incidencia", entidad_id=obj.pk,
                  cambios=_snapshot(obj, ["viaje", "tipo", "severidad", "descripcion"]))
        if obj.severidad == Incidencia.Severidad.ALTA:
            publish_event("notification.created", {
                "audience": "staff", "title": f"Incidencia ALTA en {obj.viaje.codigo}",
                "message": f"{obj.get_tipo_display()}: {obj.descripcion[:200]}"})

    def perform_update(self, serializer):
        if self._solo_propias():
            raise PermissionDenied("Solo administración puede resolver incidencias.")
        super().perform_update(serializer)


class AlertasView(APIView):
    """Vencimientos de documentos de vehículos y licencias de conductores (solo administración de la operación)."""

    permission_classes = [IsAuthenticated, HasAnyRole]
    allowed_roles = [ADMINISTRADOR, DESPACHADOR]

    @staticmethod
    def _situacion(dias: int, alerta: int) -> str | None:
        if dias < 0:
            return "VENCIDO"
        return "POR_VENCER" if dias <= alerta else None

    @extend_schema(summary="Documentos y licencias vencidos o por vencer", responses={200: dict})
    def get(self, request):
        hoy = timezone.localdate()
        por_defecto = config.entero("dias_alerta_documentos")
        alertas = []

        tipos = list(TipoDocumentoVehicular.objects.all())
        ultimos: dict[tuple[int, int], DocumentoVehicular] = {}
        for d in DocumentoVehicular.objects.filter(vehiculo__activo=True).select_related("vehiculo", "tipo"):
            clave = (d.vehiculo_id, d.tipo_id)
            if clave not in ultimos or d.fecha_vencimiento > ultimos[clave].fecha_vencimiento:
                ultimos[clave] = d  # solo cuenta el documento más reciente (el renovado reemplaza al viejo)
        for d in ultimos.values():
            dias = (d.fecha_vencimiento - hoy).days
            sit = self._situacion(dias, d.tipo.dias_alerta or por_defecto)
            if sit:
                alertas.append({"categoria": "VEHICULO", "referencia": d.vehiculo.placa, "detalle": d.tipo.nombre,
                                "situacion": sit, "vence": d.fecha_vencimiento, "dias": dias,
                                "bloquea_asignacion": d.tipo.bloquea_asignacion})
        for v in Vehiculo.objects.filter(activo=True):
            for t in tipos:
                if t.bloquea_asignacion and (v.pk, t.pk) not in ultimos:
                    alertas.append({"categoria": "VEHICULO", "referencia": v.placa, "detalle": t.nombre,
                                    "situacion": "SIN_REGISTRO", "vence": None, "dias": None, "bloquea_asignacion": True})

        vigentes: dict[int, Licencia] = {}
        for lic in Licencia.objects.filter(activa=True, conductor__activo=True).select_related("conductor"):
            if lic.conductor_id not in vigentes or lic.fecha_vencimiento > vigentes[lic.conductor_id].fecha_vencimiento:
                vigentes[lic.conductor_id] = lic
        for lic in vigentes.values():
            dias = (lic.fecha_vencimiento - hoy).days
            sit = self._situacion(dias, por_defecto)
            if sit:
                alertas.append({"categoria": "CONDUCTOR", "referencia": str(lic.conductor), "detalle": f"Licencia {lic.numero}",
                                "situacion": sit, "vence": lic.fecha_vencimiento, "dias": dias, "bloquea_asignacion": True})
        for c in Conductor.objects.filter(activo=True).exclude(pk__in=vigentes):
            alertas.append({"categoria": "CONDUCTOR", "referencia": str(c), "detalle": "Licencia", "situacion": "SIN_REGISTRO",
                            "vence": None, "dias": None, "bloquea_asignacion": True})
        orden = {"VENCIDO": 0, "SIN_REGISTRO": 1, "POR_VENCER": 2}
        alertas.sort(key=lambda a: (orden[a["situacion"]], a["dias"] if a["dias"] is not None else -1))
        return Response(alertas)
