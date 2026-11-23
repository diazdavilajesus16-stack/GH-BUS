import re

from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.users.roles import CONDUCTOR

from .models import Conductor, Licencia, TurnoConductor

User = get_user_model()
DNI = re.compile(r"^\d{8}$")


class ConductorSerializer(serializers.ModelSerializer):
    licencia_vence = serializers.DateField(read_only=True, help_text="Vencimiento más lejano de sus licencias activas")
    usuario_username = serializers.CharField(source="usuario.username", read_only=True, default=None)

    class Meta:
        model = Conductor
        fields = ["id", "usuario", "usuario_username", "dni", "nombres", "apellidos", "telefono", "direccion",
                  "fecha_nacimiento", "licencia_vence", "activo"]

    def validate_dni(self, v):
        v = v.strip()
        if not DNI.match(v):
            raise serializers.ValidationError("El DNI debe tener 8 dígitos.")
        qs = Conductor.objects.filter(dni=v)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Ya existe un conductor con este DNI.")
        return v

    def validate_usuario(self, u):
        if u is None:
            return u
        if CONDUCTOR not in u.role_names():
            raise serializers.ValidationError("El usuario no tiene el rol «conductor».")
        qs = Conductor.objects.filter(usuario=u)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Este usuario ya está vinculado a otro conductor.")
        return u

    def validate_telefono(self, v):
        if v and not re.match(r"^\+?[0-9 ]{6,20}$", v):
            raise serializers.ValidationError("Teléfono no válido.")
        return v


class LicenciaSerializer(serializers.ModelSerializer):
    conductor_nombre = serializers.SerializerMethodField()

    class Meta:
        model = Licencia
        fields = ["id", "conductor", "conductor_nombre", "numero", "categoria", "fecha_emision",
                  "fecha_vencimiento", "activa"]

    def get_conductor_nombre(self, obj) -> str:
        return str(obj.conductor)

    def validate_numero(self, v):
        v = v.strip().upper()
        qs = Licencia.objects.filter(numero=v)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Ya existe una licencia con este número.")
        return v

    def validate(self, attrs):
        e = attrs.get("fecha_emision", getattr(self.instance, "fecha_emision", None))
        v = attrs.get("fecha_vencimiento", getattr(self.instance, "fecha_vencimiento", None))
        if e and v and v < e:
            raise serializers.ValidationError({"fecha_vencimiento": "Debe ser igual o posterior a la emisión."})
        return attrs


class TurnoSerializer(serializers.ModelSerializer):
    conductor_nombre = serializers.SerializerMethodField()

    class Meta:
        model = TurnoConductor
        fields = ["id", "conductor", "conductor_nombre", "tipo", "inicio", "fin", "observaciones"]

    def get_conductor_nombre(self, obj) -> str:
        return str(obj.conductor)

    def validate(self, attrs):
        g = lambda k: attrs.get(k, getattr(self.instance, k, None))  # noqa: E731
        conductor, inicio, fin = g("conductor"), g("inicio"), g("fin")
        if inicio and fin and fin <= inicio:
            raise serializers.ValidationError({"fin": "Debe ser posterior al inicio."})
        if conductor and inicio and fin:
            cruces = TurnoConductor.objects.filter(conductor=conductor, inicio__lt=fin, fin__gt=inicio)
            if self.instance:
                cruces = cruces.exclude(pk=self.instance.pk)
            if cruces.exists():
                raise serializers.ValidationError("Se cruza con otro turno, descanso o vacaciones del conductor.")
        return attrs
