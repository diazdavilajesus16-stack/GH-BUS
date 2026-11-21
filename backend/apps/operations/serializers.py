from rest_framework import serializers

from apps.drivers.models import Licencia

from . import config
from .models import Configuracion


class ConfiguracionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Configuracion
        fields = ["clave", "valor", "descripcion", "updated_at"]
        read_only_fields = ["clave", "descripcion", "updated_at"]

    def validate_valor(self, v):
        v = v.strip()
        clave = self.instance.clave
        if clave in config.ENTEROS:
            minimo, maximo = config.ENTEROS[clave]
            if not v.isdigit() or not minimo <= int(v) <= maximo:
                raise serializers.ValidationError(f"Debe ser un número entero entre {minimo} y {maximo}.")
        elif clave == "categorias_licencia_permitidas":
            validas = {c for c, _ in Licencia.Categoria.choices}
            elegidas = [c.strip() for c in v.split(",") if c.strip()]
            if not elegidas or any(c not in validas for c in elegidas):
                raise serializers.ValidationError("Usa categorías válidas separadas por comas, p. ej. A-IIIa,A-IIIb.")
            v = ",".join(elegidas)
        return v


from django.utils import timezone  # noqa: E402

from apps.trips.models import AsignacionConductor, Viaje  # noqa: E402

from .models import Incidencia  # noqa: E402


class IncidenciaSerializer(serializers.ModelSerializer):
    viaje_codigo = serializers.CharField(source="viaje.codigo", read_only=True)
    registrada_por_nombre = serializers.CharField(source="registrada_por.username", read_only=True)
    ocurrida_en = serializers.DateTimeField(required=False)

    class Meta:
        model = Incidencia
        fields = ["id", "viaje", "viaje_codigo", "vehiculo", "conductor", "tipo", "severidad", "descripcion",
                  "ocurrida_en", "resuelta", "resolucion", "registrada_por_nombre", "created_at"]
        read_only_fields = ["created_at"]

    def validate_descripcion(self, v):
        v = v.strip()
        if len(v) < 5:
            raise serializers.ValidationError("Describe lo ocurrido (mínimo 5 caracteres).")
        return v

    def validate(self, attrs):
        if self.instance:  # al editar solo se resuelve: el hecho registrado no se reescribe
            permitidos = {"resuelta", "resolucion"}
            extra = set(attrs) - permitidos
            if extra:
                raise serializers.ValidationError("Solo se puede marcar como resuelta y registrar la resolución.")
            if attrs.get("resuelta") and not (attrs.get("resolucion") or self.instance.resolucion).strip():
                raise serializers.ValidationError({"resolucion": "Indica cómo se resolvió."})
            return attrs
        viaje = attrs["viaje"]
        if viaje.estado == Viaje.Estado.PROGRAMADO:
            raise serializers.ValidationError({"viaje": "El viaje aún no sale; no puede tener incidencias."})
        attrs.setdefault("ocurrida_en", timezone.now())
        if attrs["ocurrida_en"] > timezone.now() + __import__("datetime").timedelta(minutes=5):
            raise serializers.ValidationError({"ocurrida_en": "No puede ser una fecha futura."})
        attrs.setdefault("vehiculo", viaje.vehiculo)
        if attrs.get("conductor") is not None and not AsignacionConductor.objects.filter(viaje=viaje, conductor=attrs["conductor"]).exists():
            raise serializers.ValidationError({"conductor": "Ese conductor no está asignado al viaje."})
        return attrs
