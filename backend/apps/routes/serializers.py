from rest_framework import serializers

from .models import Ciudad, Horario, Parada, Ruta, Tarifa, TipoServicio


def _normalizar_codigo(valor: str) -> str:
    return valor.strip().upper()


class CiudadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ciudad
        fields = ["id", "nombre", "departamento", "provincia", "observaciones", "activa"]

    def validate_nombre(self, v):
        return v.strip()

    def validate_departamento(self, v):
        return v.strip()

    def validate_provincia(self, v):
        return v.strip()

    def validate_observaciones(self, v):
        return v.strip()


class TipoServicioSerializer(serializers.ModelSerializer):
    class Meta:
        model = TipoServicio
        fields = ["id", "codigo", "nombre", "descripcion", "activo"]

    def validate_codigo(self, v):
        v = _normalizar_codigo(v)
        qs = TipoServicio.objects.filter(codigo=v)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Ya existe un tipo de servicio con este código.")
        return v


class RutaSerializer(serializers.ModelSerializer):
    origen_nombre = serializers.CharField(source="origen.nombre", read_only=True)
    destino_nombre = serializers.CharField(source="destino.nombre", read_only=True)

    class Meta:
        model = Ruta
        fields = ["id", "codigo", "nombre", "origen", "origen_nombre", "destino", "destino_nombre",
                  "distancia_km", "duracion_min", "activa"]

    def validate_codigo(self, v):
        v = _normalizar_codigo(v)
        qs = Ruta.objects.filter(codigo=v)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Ya existe una ruta con este código.")
        return v

    def validate_duracion_min(self, v):
        if v <= 0:
            raise serializers.ValidationError("La duración debe ser mayor que cero.")
        return v

    def validate_distancia_km(self, v):
        if v is not None and v <= 0:
            raise serializers.ValidationError("La distancia debe ser mayor que cero.")
        return v

    def validate(self, attrs):
        origen = attrs.get("origen", getattr(self.instance, "origen", None))
        destino = attrs.get("destino", getattr(self.instance, "destino", None))
        if origen and destino and origen.pk == destino.pk:
            raise serializers.ValidationError({"destino": "El destino debe ser distinto del origen."})
        for nombre, ciudad in (("origen", attrs.get("origen")), ("destino", attrs.get("destino"))):
            if ciudad is not None and not ciudad.activa:
                raise serializers.ValidationError({nombre: "La ciudad está desactivada."})
        # Acortar la ruta por debajo de sus paradas dejaría paradas imposibles.
        if self.instance and "duracion_min" in attrs:
            ultima = self.instance.paradas.order_by("-minutos_desde_origen").first()
            if ultima and attrs["duracion_min"] <= ultima.minutos_desde_origen:
                raise serializers.ValidationError(
                    {"duracion_min": f"Debe ser mayor que {ultima.minutos_desde_origen} min (la última parada)."}
                )
        return attrs


class ParadaSerializer(serializers.ModelSerializer):
    ciudad_nombre = serializers.CharField(source="ciudad.nombre", read_only=True)
    ruta_codigo = serializers.CharField(source="ruta.codigo", read_only=True)

    class Meta:
        model = Parada
        fields = ["id", "ruta", "ruta_codigo", "ciudad", "ciudad_nombre", "orden", "minutos_desde_origen", "direccion"]

    def validate(self, attrs):
        ruta = attrs.get("ruta", getattr(self.instance, "ruta", None))
        ciudad = attrs.get("ciudad", getattr(self.instance, "ciudad", None))
        minutos = attrs.get("minutos_desde_origen", getattr(self.instance, "minutos_desde_origen", None))
        if self.instance and "ruta" in attrs and attrs["ruta"].pk != self.instance.ruta_id:
            raise serializers.ValidationError({"ruta": "No se puede mover una parada a otra ruta."})
        if ruta and ciudad and ciudad.pk in (ruta.origen_id, ruta.destino_id):
            raise serializers.ValidationError({"ciudad": "Una parada intermedia no puede ser el origen ni el destino."})
        if ruta and minutos is not None and not (0 < minutos < ruta.duracion_min):
            raise serializers.ValidationError(
                {"minutos_desde_origen": f"Debe estar entre 1 y {ruta.duracion_min - 1} min (la duración de la ruta)."}
            )
        return attrs


def _rangos_se_cruzan(desde_a, hasta_a, desde_b, hasta_b) -> bool:
    """Intervalos de fechas inclusivos; `None` en «hasta» significa sin fin."""
    return (hasta_a is None or hasta_a >= desde_b) and (hasta_b is None or hasta_b >= desde_a)


class TarifaSerializer(serializers.ModelSerializer):
    ruta_nombre = serializers.CharField(source="ruta.nombre", read_only=True)
    tipo_servicio_nombre = serializers.CharField(source="tipo_servicio.nombre", read_only=True)

    class Meta:
        model = Tarifa
        fields = ["id", "ruta", "ruta_nombre", "tipo_servicio", "tipo_servicio_nombre", "monto",
                  "vigente_desde", "vigente_hasta", "activa"]

    def validate_monto(self, v):
        if v <= 0:
            raise serializers.ValidationError("El monto debe ser mayor que cero.")
        return v

    def validate(self, attrs):
        g = lambda k: attrs.get(k, getattr(self.instance, k, None))  # noqa: E731
        ruta, tipo, desde, hasta, activa = g("ruta"), g("tipo_servicio"), g("vigente_desde"), g("vigente_hasta"), g("activa")
        if hasta is not None and desde is not None and hasta < desde:
            raise serializers.ValidationError({"vigente_hasta": "Debe ser igual o posterior al inicio."})
        if activa is None:  # en un alta sin el campo rige el valor por defecto del modelo (activa)
            activa = True
        if activa and ruta and tipo and desde:
            otras = Tarifa.objects.filter(ruta=ruta, tipo_servicio=tipo, activa=True)
            if self.instance:
                otras = otras.exclude(pk=self.instance.pk)
            for o in otras:
                if _rangos_se_cruzan(desde, hasta, o.vigente_desde, o.vigente_hasta):
                    raise serializers.ValidationError(
                        "Ya existe una tarifa activa para esta ruta y servicio que se cruza con estas fechas."
                    )
        return attrs


class HorarioSerializer(serializers.ModelSerializer):
    ruta_nombre = serializers.CharField(source="ruta.nombre", read_only=True)
    tipo_servicio_nombre = serializers.CharField(source="tipo_servicio.nombre", read_only=True)

    class Meta:
        model = Horario
        fields = ["id", "ruta", "ruta_nombre", "tipo_servicio", "tipo_servicio_nombre", "hora_salida",
                  "dias_semana", "vigente_desde", "vigente_hasta", "activo"]

    def validate_dias_semana(self, v):
        if not 1 <= v <= 127:
            raise serializers.ValidationError("Elige al menos un día de la semana.")
        return v

    def validate(self, attrs):
        desde = attrs.get("vigente_desde", getattr(self.instance, "vigente_desde", None))
        hasta = attrs.get("vigente_hasta", getattr(self.instance, "vigente_hasta", None))
        if desde and hasta and hasta < desde:
            raise serializers.ValidationError({"vigente_hasta": "Debe ser igual o posterior al inicio."})
        return attrs
