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
