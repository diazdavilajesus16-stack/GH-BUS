from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import RegexValidator
from django.db import transaction
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .roles import CLIENTE, TODOS

User = get_user_model()

username_validator = RegexValidator(
    r"^[a-z0-9._-]+$", "Usa solo letras minúsculas, números, punto, guion y guion bajo."
)
telefono_validator = RegexValidator(r"^\+?[0-9 ]{6,20}$", "Ingresa un teléfono válido (solo números, opcional +).")


class UsernameField(serializers.CharField):
    """Normaliza a minúsculas ANTES de validar, para que «Maria» y «maria» sean la misma cuenta."""

    def to_internal_value(self, data):
        return super().to_internal_value(data).strip().lower()


def validar_clave(password: str, user=None) -> str:
    try:
        validate_password(password, user=user)
    except DjangoValidationError as exc:
        raise serializers.ValidationError(list(exc.messages)) from exc
    return password


def _correo_libre(valor: str, excluir_id=None) -> str:
    valor = valor.strip().lower()
    consulta = User.objects.filter(email__iexact=valor)
    if excluir_id is not None:
        consulta = consulta.exclude(pk=excluir_id)
    if consulta.exists():
        raise serializers.ValidationError("Ya existe una cuenta con este correo.")
    return valor


def _usuario_libre(valor: str) -> str:
    valor = valor.strip().lower()
    if User.objects.filter(username__iexact=valor).exists():
        raise serializers.ValidationError("Este nombre de usuario ya está en uso.")
    return valor


class UserSerializer(serializers.ModelSerializer):
    roles = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "first_name", "last_name", "telefono",
            "roles", "is_active", "last_login", "date_joined",
        ]
        read_only_fields = fields

    @extend_schema_field(serializers.ListField(child=serializers.CharField()))
    def get_roles(self, obj):
        return obj.role_names()


class SesionSerializer(serializers.Serializer):
    """Respuesta de login, registro y renovación. El refresh NO va aquí: viaja en cookie httpOnly."""

    access = serializers.CharField(read_only=True)
    user = UserSerializer(read_only=True)


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=254, help_text="Nombre de usuario o correo")
    password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)


class RegisterSerializer(serializers.Serializer):
    username = UsernameField(min_length=3, max_length=150, validators=[username_validator])
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(max_length=128, write_only=True, trim_whitespace=False)
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    telefono = serializers.CharField(max_length=20, required=False, allow_blank=True, validators=[telefono_validator])

    def validate_username(self, value):
        return _usuario_libre(value)

    def validate_email(self, value):
        return _correo_libre(value)

    def validate(self, attrs):
        candidato = User(
            username=attrs["username"], email=attrs["email"],
            first_name=attrs["first_name"], last_name=attrs["last_name"],
        )
        attrs["password"] = validar_clave(attrs["password"], candidato)
        return attrs

    def create(self, validated_data):
        with transaction.atomic():
            user = User.objects.create_user(**validated_data)
            user.groups.add(Group.objects.get(name=CLIENTE))  # el registro público SOLO crea clientes
        return user


class ProfileSerializer(serializers.ModelSerializer):
    """Datos que el propio usuario puede editar de su perfil."""

    telefono = serializers.CharField(max_length=20, required=False, allow_blank=True, validators=[telefono_validator])

    class Meta:
        model = User
        fields = ["first_name", "last_name", "telefono", "email"]

    def validate_email(self, value):
        return _correo_libre(value, excluir_id=self.instance.pk if self.instance else None)


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, trim_whitespace=False, max_length=128)

    def validate_current_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("La contraseña actual es incorrecta.")
        return value

    def validate_new_password(self, value):
        return validar_clave(value, self.context["request"].user)


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, trim_whitespace=False, max_length=128)


# --- Administración de usuarios (solo rol administrador) ---------------------------------------

class RolesField(serializers.ListField):
    child = serializers.ChoiceField(choices=TODOS)

    def to_internal_value(self, data):
        return sorted(set(super().to_internal_value(data)))


class UsuarioCreateSerializer(serializers.Serializer):
    username = UsernameField(min_length=3, max_length=150, validators=[username_validator])
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(max_length=128, write_only=True, trim_whitespace=False)
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    telefono = serializers.CharField(max_length=20, required=False, allow_blank=True, validators=[telefono_validator])
    roles = RolesField(required=False)
    is_active = serializers.BooleanField(default=True)

    def validate_username(self, value):
        return _usuario_libre(value)

    def validate_email(self, value):
        return _correo_libre(value)

    def validate(self, attrs):
        candidato = User(username=attrs["username"], email=attrs["email"])
        attrs["password"] = validar_clave(attrs["password"], candidato)
        return attrs

    def create(self, validated_data):
        roles = validated_data.pop("roles", [])
        with transaction.atomic():
            user = User.objects.create_user(**validated_data)
            user.groups.set(Group.objects.filter(name__in=roles))
        return user


class UsuarioUpdateSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254, required=False)
    first_name = serializers.CharField(max_length=150, required=False)
    last_name = serializers.CharField(max_length=150, required=False)
    telefono = serializers.CharField(max_length=20, required=False, allow_blank=True, validators=[telefono_validator])
    roles = RolesField(required=False)
    is_active = serializers.BooleanField(required=False)

    def validate_email(self, value):
        return _correo_libre(value, excluir_id=self.instance.pk if self.instance else None)

    def update(self, instance, validated_data):
        roles = validated_data.pop("roles", None)
        with transaction.atomic():
            for campo, valor in validated_data.items():
                setattr(instance, campo, valor)
            instance.save()
            if roles is not None:
                instance.groups.set(Group.objects.filter(name__in=roles))
        return instance


class RolSerializer(serializers.Serializer):
    nombre = serializers.CharField()
    descripcion = serializers.CharField()
    usuarios_activos = serializers.IntegerField()
