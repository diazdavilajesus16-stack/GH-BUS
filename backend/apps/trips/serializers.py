from rest_framework import serializers

from apps.drivers.models import Conductor
from apps.fleet.models import Vehiculo
from apps.routes.models import Ruta, TipoServicio

from .models import AsignacionConductor, Viaje, ViajeEstadoHistorial


class AsignacionSerializer(serializers.ModelSerializer):
    conductor_nombre = serializers.SerializerMethodField()

    class Meta:
        model = AsignacionConductor
        fields = ["conductor", "conductor_nombre", "rol"]

    def get_conductor_nombre(self, obj) -> str:
        return str(obj.conductor)


class ViajeSerializer(serializers.ModelSerializer):
    ruta_codigo = serializers.CharField(source="ruta.codigo", read_only=True)
    origen_nombre = serializers.CharField(source="ruta.origen.nombre", read_only=True)
    destino_nombre = serializers.CharField(source="ruta.destino.nombre", read_only=True)
    tipo_servicio_nombre = serializers.CharField(source="tipo_servicio.nombre", read_only=True)
    vehiculo_placa = serializers.CharField(source="vehiculo.placa", read_only=True, default=None)
    capacidad = serializers.IntegerField(source="vehiculo.configuracion_asientos.total_asientos", read_only=True, default=None)
    conductores = serializers.SerializerMethodField()

    class Meta:
        model = Viaje
        fields = ["id", "codigo", "ruta", "ruta_codigo", "origen_nombre", "destino_nombre", "tipo_servicio",
                  "tipo_servicio_nombre", "horario", "salida_programada", "llegada_programada", "vehiculo",
                  "vehiculo_placa", "capacidad", "conductores", "estado", "precio_base", "salida_real",
                  "llegada_real", "observaciones"]
        read_only_fields = fields

    def get_conductores(self, obj) -> list:
        # `asignaciones` viene precargado con las activas (ver la vista)
        return AsignacionSerializer(obj.asignaciones.all(), many=True).data


class ViajeCreateSerializer(serializers.Serializer):
    ruta = serializers.PrimaryKeyRelatedField(queryset=Ruta.objects.all())
    tipo_servicio = serializers.PrimaryKeyRelatedField(queryset=TipoServicio.objects.all())
    salida_programada = serializers.DateTimeField()
    precio_base = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True, min_value=0)
    observaciones = serializers.CharField(required=False, allow_blank=True, max_length=2000)


class ViajeUpdateSerializer(serializers.Serializer):
    salida_programada = serializers.DateTimeField(required=False)
    precio_base = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, min_value=0)
    observaciones = serializers.CharField(required=False, allow_blank=True, max_length=2000)


class GenerarSerializer(serializers.Serializer):
    desde = serializers.DateField()
    hasta = serializers.DateField()


class AsignarVehiculoSerializer(serializers.Serializer):
    vehiculo = serializers.PrimaryKeyRelatedField(queryset=Vehiculo.objects.all(), allow_null=True)


class AsignarConductorSerializer(serializers.Serializer):
    conductor = serializers.PrimaryKeyRelatedField(queryset=Conductor.objects.all())
    rol = serializers.ChoiceField(choices=AsignacionConductor.Rol.choices, default=AsignacionConductor.Rol.PRINCIPAL)


class QuitarConductorSerializer(serializers.Serializer):
    conductor = serializers.PrimaryKeyRelatedField(queryset=Conductor.objects.all())


class CambiarEstadoSerializer(serializers.Serializer):
    estado = serializers.ChoiceField(choices=Viaje.Estado.choices)
    observacion = serializers.CharField(required=False, allow_blank=True, max_length=255)


class HistorialSerializer(serializers.ModelSerializer):
    cambiado_por_nombre = serializers.CharField(source="cambiado_por.username", read_only=True, default=None)

    class Meta:
        model = ViajeEstadoHistorial
        fields = ["id", "estado_anterior", "estado_nuevo", "cambiado_por_nombre", "cambiado_en", "observacion"]
