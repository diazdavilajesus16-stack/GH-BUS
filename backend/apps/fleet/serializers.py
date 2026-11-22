import re

from django.utils import timezone
from rest_framework import serializers

from apps.operations import config

from .models import (
    AsientoPlantilla, ConfiguracionAsientos, DocumentoVehicular, Mantenimiento, TipoDocumentoVehicular, Vehiculo,
)

MAX_ASIENTOS = 80


class AsientoPlantillaSerializer(serializers.ModelSerializer):
    class Meta:
        model = AsientoPlantilla
        fields = ["numero", "piso", "fila", "columna", "categoria"]


class ConfiguracionAsientosSerializer(serializers.ModelSerializer):
    asientos = AsientoPlantillaSerializer(many=True, read_only=True)

    class Meta:
        model = ConfiguracionAsientos
        fields = ["id", "nombre", "pisos", "total_asientos", "asientos"]
        read_only_fields = fields


class PisoSerializer(serializers.Serializer):
    filas = serializers.IntegerField(min_value=1, max_value=20)
    asientos_por_fila = serializers.IntegerField(min_value=2, max_value=5)


class ConfiguracionAsientosCreateSerializer(serializers.Serializer):
    """Genera la distribución a partir de filas y asientos por fila de cada piso."""

    nombre = serializers.CharField(max_length=80)
    pisos = PisoSerializer(many=True, min_length=1, max_length=2)

    def validate_nombre(self, v):
        v = v.strip()
        if ConfiguracionAsientos.objects.filter(nombre__iexact=v).exists():
            raise serializers.ValidationError("Ya existe una distribución con este nombre.")
        return v

    def validate_pisos(self, pisos):
        total = sum(p["filas"] * p["asientos_por_fila"] for p in pisos)
        if total > MAX_ASIENTOS:
            raise serializers.ValidationError(f"Máximo {MAX_ASIENTOS} asientos por bus (se pidieron {total}).")
        return pisos

    def create(self, datos):
        from django.db import transaction

        pisos = datos["pisos"]
        with transaction.atomic():
            config_ = ConfiguracionAsientos.objects.create(
                nombre=datos["nombre"], pisos=len(pisos),
                total_asientos=sum(p["filas"] * p["asientos_por_fila"] for p in pisos),
            )
            numero, filas_bulk = 0, []
            for n_piso, piso in enumerate(pisos, start=1):
                ultima = piso["asientos_por_fila"]
                for fila in range(1, piso["filas"] + 1):
                    for col in range(1, ultima + 1):
                        numero += 1
                        categoria = "VENTANA" if col in (1, ultima) else "PASILLO"
                        filas_bulk.append(AsientoPlantilla(
                            configuracion=config_, numero=numero, piso=n_piso, fila=fila, columna=col,
                            categoria=categoria))
            AsientoPlantilla.objects.bulk_create(filas_bulk)
        return config_


class ConfiguracionAsientosUpdateSerializer(serializers.ModelSerializer):
    """Solo se puede renombrar: cambiar los asientos alteraría viajes ya programados."""

    class Meta:
        model = ConfiguracionAsientos
        fields = ["nombre"]

    def validate_nombre(self, v):
        v = v.strip()
        qs = ConfiguracionAsientos.objects.filter(nombre__iexact=v).exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Ya existe una distribución con este nombre.")
        return v


PLACA = re.compile(r"^[A-Z0-9-]{5,10}$")


class VehiculoSerializer(serializers.ModelSerializer):
    capacidad = serializers.IntegerField(source="configuracion_asientos.total_asientos", read_only=True)
    configuracion_nombre = serializers.CharField(source="configuracion_asientos.nombre", read_only=True)
    tipo_servicio_nombre = serializers.CharField(source="tipo_servicio.nombre", read_only=True)

    class Meta:
        model = Vehiculo
        fields = ["id", "placa", "marca", "modelo", "anio", "configuracion_asientos", "configuracion_nombre",
                  "capacidad", "tipo_servicio", "tipo_servicio_nombre", "kilometraje", "estado", "activo"]

    def validate_placa(self, v):
        v = v.strip().upper()
        if not PLACA.match(v):
            raise serializers.ValidationError("Placa no válida (letras, números y guion, 5 a 10 caracteres).")
        qs = Vehiculo.objects.filter(placa=v)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Ya existe un vehículo con esta placa.")
        return v

    def validate_anio(self, v):
        if not 1990 <= v <= timezone.localdate().year + 1:
            raise serializers.ValidationError("Año no válido.")
        return v

    def validate_estado(self, v):
        actual = self.instance.estado if self.instance else None
        if v == Vehiculo.Estado.EN_VIAJE and actual != v:
            raise serializers.ValidationError("«En viaje» lo asigna el sistema al despachar; no se cambia a mano.")
        if actual == Vehiculo.Estado.EN_VIAJE and v != actual:
            raise serializers.ValidationError("El vehículo está en viaje: espera a que el viaje termine.")
        return v

    def validate(self, attrs):
        if self.instance and self.instance.estado == Vehiculo.Estado.EN_VIAJE and attrs.get("activo") is False:
            raise serializers.ValidationError({"activo": "No se puede desactivar un vehículo en viaje."})
        return attrs


class TipoDocumentoVehicularSerializer(serializers.ModelSerializer):
    class Meta:
        model = TipoDocumentoVehicular
        fields = ["id", "codigo", "nombre", "bloquea_asignacion", "dias_alerta"]
        read_only_fields = ["codigo"]


class DocumentoVehicularSerializer(serializers.ModelSerializer):
    vehiculo_placa = serializers.CharField(source="vehiculo.placa", read_only=True)
    tipo_nombre = serializers.CharField(source="tipo.nombre", read_only=True)
    bloquea_asignacion = serializers.BooleanField(source="tipo.bloquea_asignacion", read_only=True)
    situacion = serializers.SerializerMethodField()
    dias_para_vencer = serializers.SerializerMethodField()

    class Meta:
        model = DocumentoVehicular
        fields = ["id", "vehiculo", "vehiculo_placa", "tipo", "tipo_nombre", "bloquea_asignacion", "numero",
                  "fecha_emision", "fecha_vencimiento", "dias_para_vencer", "situacion"]

    def get_dias_para_vencer(self, obj) -> int:
        return (obj.fecha_vencimiento - timezone.localdate()).days

    def get_situacion(self, obj) -> str:
        dias = self.get_dias_para_vencer(obj)
        if dias < 0:
            return "VENCIDO"
        alerta = obj.tipo.dias_alerta or config.entero("dias_alerta_documentos")
        return "POR_VENCER" if dias <= alerta else "VIGENTE"

    def validate(self, attrs):
        e = attrs.get("fecha_emision", getattr(self.instance, "fecha_emision", None))
        v = attrs.get("fecha_vencimiento", getattr(self.instance, "fecha_vencimiento", None))
        if e and v and v < e:
            raise serializers.ValidationError({"fecha_vencimiento": "Debe ser igual o posterior a la emisión."})
        return attrs


class MantenimientoSerializer(serializers.ModelSerializer):
    vehiculo_placa = serializers.CharField(source="vehiculo.placa", read_only=True)

    class Meta:
        model = Mantenimiento
        fields = ["id", "vehiculo", "vehiculo_placa", "tipo", "estado", "descripcion", "fecha_inicio", "fecha_fin",
                  "kilometraje", "costo", "proveedor"]

    def validate_costo(self, v):
        if v is not None and v < 0:
            raise serializers.ValidationError("El costo no puede ser negativo.")
        return v

    def validate(self, attrs):
        i = attrs.get("fecha_inicio", getattr(self.instance, "fecha_inicio", None))
        f = attrs.get("fecha_fin", getattr(self.instance, "fecha_fin", None))
        if i and f and f < i:
            raise serializers.ValidationError({"fecha_fin": "Debe ser igual o posterior al inicio."})
        return attrs
