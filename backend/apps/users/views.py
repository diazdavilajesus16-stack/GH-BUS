import logging

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.contrib.auth.tokens import default_token_generator
from django.contrib.auth.models import update_last_login
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import Q
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
import django_filters
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError

from apps.audit.services import Accion, registrar

from . import services
from .cookies import borrar_cookie_refresh, poner_cookie_refresh
from .permissions import HasAnyRole
from .roles import ADMINISTRADOR, DESCRIPCIONES, TODOS
from .serializers import (
    ChangePasswordSerializer, LoginSerializer, PasswordResetConfirmSerializer, PasswordResetRequestSerializer,
    ProfileSerializer, RegisterSerializer, RolSerializer, SesionSerializer, UserSerializer,
    UsuarioCreateSerializer, UsuarioUpdateSerializer,
)
from .throttles import LoginIPThrottle, PasswordResetThrottle, RegisterThrottle
from .tokens import emitir_tokens, invalidar_refresh, revocar_sesiones, rotar_refresh

logger = logging.getLogger(__name__)
User = get_user_model()

SESION_VENCIDA = "Tu sesión venció. Inicia sesión nuevamente."


def _respuesta_sesion(user, refresh, access, codigo=status.HTTP_200_OK) -> Response:
    respuesta = Response({"access": str(access), "user": UserSerializer(user).data}, status=codigo)
    poner_cookie_refresh(respuesta, refresh)
    return respuesta


# --- Sesión ---------------------------------------------------------------------------------

class LoginView(APIView):
    authentication_classes: list = []
    permission_classes = [AllowAny]
    throttle_classes = [LoginIPThrottle]

    @extend_schema(
        summary="Iniciar sesión",
        request=LoginSerializer,
        responses={200: SesionSerializer, 401: OpenApiResponse(description="Credenciales incorrectas"),
                   429: OpenApiResponse(description="Demasiados intentos fallidos")},
    )
    def post(self, request):
        datos = LoginSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        identificador = datos.validated_data["username"]

        if services.esta_bloqueado(request, identificador):
            registrar(request=request, accion=Accion.LOGIN_FALLIDO, entidad="usuario",
                      usuario_nombre=_nombre_para_bitacora(identificador), cambios={"motivo": "bloqueado"})
            return Response(
                {"detail": "Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={"Retry-After": str(settings.LOGIN_LOCKOUT_SECONDS)},
            )

        user, encontrado = services.autenticar(identificador, datos.validated_data["password"])
        if user is None:
            services.registrar_fallo(request, identificador)
            motivo = "desconocido" if encontrado is None else "inactivo" if not encontrado.is_active else "credenciales"
            registrar(request=request, accion=Accion.LOGIN_FALLIDO, entidad="usuario",
                      usuario=encontrado, usuario_nombre=_nombre_para_bitacora(identificador, encontrado),
                      cambios={"motivo": motivo})
            # Mismo mensaje para usuario inexistente, inactivo o clave errónea: no revela qué cuentas existen.
            return Response({"detail": "Usuario o contraseña incorrectos."}, status=status.HTTP_401_UNAUTHORIZED)

        services.limpiar_fallos(request, identificador)
        update_last_login(None, user)
        refresh, access = emitir_tokens(user)
        registrar(request=request, accion=Accion.LOGIN, entidad="usuario", entidad_id=user.pk, usuario=user)
        return _respuesta_sesion(user, refresh, access)


def _nombre_para_bitacora(identificador: str, encontrado=None) -> str:
    """Solo se guarda lo escrito si corresponde a una cuenta real (podría ser una contraseña mal puesta)."""
    if encontrado is None:
        encontrado = services.buscar_usuario(identificador)
    return encontrado.get_username() if encontrado else "(desconocido)"


class RefreshView(APIView):
    """Renueva el token de acceso usando la cookie httpOnly. Rota el refresh (un solo uso)."""

    authentication_classes: list = []
    permission_classes = [AllowAny]

    @extend_schema(summary="Renovar sesión", request=None,
                   responses={200: SesionSerializer, 401: OpenApiResponse(description="Sesión vencida")})
    def post(self, request):
        crudo = request.COOKIES.get(settings.AUTH_COOKIE_NAME)
        if not crudo:
            return Response({"detail": SESION_VENCIDA}, status=status.HTTP_401_UNAUTHORIZED)
        try:
            user, refresh, access = rotar_refresh(crudo)
        except TokenError:
            respuesta = Response({"detail": SESION_VENCIDA}, status=status.HTTP_401_UNAUTHORIZED)
            borrar_cookie_refresh(respuesta)
            return respuesta
        return _respuesta_sesion(user, refresh, access)


class LogoutView(APIView):
    authentication_classes: list = []
    permission_classes = [AllowAny]

    @extend_schema(summary="Cerrar sesión", request=None, responses={204: None})
    def post(self, request):
        crudo = request.COOKIES.get(settings.AUTH_COOKIE_NAME)
        user = invalidar_refresh(crudo) if crudo else None
        if user is not None:
            registrar(request=request, accion=Accion.LOGOUT, entidad="usuario", entidad_id=user.pk, usuario=user)
        respuesta = Response(status=status.HTTP_204_NO_CONTENT)
        borrar_cookie_refresh(respuesta)
        return respuesta


class RegisterView(APIView):
    """Registro público de clientes. Siempre crea el rol «cliente»; no se puede elegir otro."""

    authentication_classes: list = []
    permission_classes = [AllowAny]
    throttle_classes = [RegisterThrottle]

    @extend_schema(summary="Crear cuenta de cliente", request=RegisterSerializer,
                   responses={201: SesionSerializer})
    def post(self, request):
        datos = RegisterSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        user = datos.save()
        update_last_login(None, user)
        refresh, access = emitir_tokens(user)
        registrar(request=request, accion=Accion.CREAR, entidad="usuario", entidad_id=user.pk, usuario=user,
                  cambios={"origen": "registro_publico"})
        return _respuesta_sesion(user, refresh, access, status.HTTP_201_CREATED)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Mi perfil", responses=UserSerializer)
    def get(self, request):
        return Response(UserSerializer(request.user).data)

    @extend_schema(summary="Editar mi perfil", request=ProfileSerializer, responses=UserSerializer)
    def patch(self, request):
        antes = {c: getattr(request.user, c) for c in ProfileSerializer.Meta.fields}
        datos = ProfileSerializer(request.user, data=request.data, partial=True)
        datos.is_valid(raise_exception=True)
        user = datos.save()
        cambios = {c: [antes[c], getattr(user, c)] for c in antes if antes[c] != getattr(user, c)}
        if cambios:
            registrar(request=request, accion=Accion.MODIFICAR, entidad="usuario", entidad_id=user.pk,
                      cambios=cambios)
        return Response(UserSerializer(user).data)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(summary="Cambiar mi contraseña", request=ChangePasswordSerializer, responses={200: None})
    def post(self, request):
        datos = ChangePasswordSerializer(data=request.data, context={"request": request})
        datos.is_valid(raise_exception=True)
        with transaction.atomic():
            request.user.set_password(datos.validated_data["new_password"])
            request.user.save(update_fields=["password"])
            revocar_sesiones(request.user)  # todas las sesiones, incluida esta, deben volver a iniciar
        registrar(request=request, accion=Accion.MODIFICAR, entidad="usuario", entidad_id=request.user.pk,
                  cambios={"campo": "contraseña"})
        respuesta = Response({"detail": "Contraseña actualizada. Inicia sesión nuevamente."})
        borrar_cookie_refresh(respuesta)
        return respuesta


class PasswordResetRequestView(APIView):
    authentication_classes: list = []
    permission_classes = [AllowAny]
    throttle_classes = [PasswordResetThrottle]

    @extend_schema(summary="Solicitar recuperación de contraseña", request=PasswordResetRequestSerializer,
                   responses={202: None})
    def post(self, request):
        datos = PasswordResetRequestSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        user = User.objects.filter(email__iexact=datos.validated_data["email"], is_active=True).first()
        if user is not None:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            enlace = f"{settings.FRONTEND_URL}/restablecer-contrasena?uid={uid}&token={token}"
            try:
                send_mail(
                    "Recupera tu contraseña de GH BUS",
                    f"Hola {user.first_name or user.username},\n\n"
                    f"Recibimos una solicitud para restablecer tu contraseña. Abre este enlace "
                    f"(vale por 1 hora):\n\n{enlace}\n\n"
                    f"Si no fuiste tú, ignora este mensaje: tu contraseña no cambiará.\n\nGH BUS",
                    settings.DEFAULT_FROM_EMAIL,
                    [user.email],
                )
            except Exception:
                logger.exception("No se pudo enviar el correo de recuperación")
            registrar(request=request, accion=Accion.OTRO, entidad="usuario", entidad_id=user.pk, usuario=user,
                      cambios={"evento": "recuperacion_solicitada"})
        # Siempre la misma respuesta: no revela si el correo está registrado.
        return Response(
            {"detail": "Si el correo está registrado, recibirás un mensaje con las instrucciones."},
            status=status.HTTP_202_ACCEPTED,
        )


class PasswordResetConfirmView(APIView):
    authentication_classes: list = []
    permission_classes = [AllowAny]
    throttle_classes = [PasswordResetThrottle]

    @extend_schema(summary="Restablecer contraseña con el enlace del correo", request=PasswordResetConfirmSerializer,
                   responses={200: None, 400: OpenApiResponse(description="Enlace inválido o vencido")})
    def post(self, request):
        datos = PasswordResetConfirmSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        invalido = ValidationError({"detail": "El enlace no es válido o ya venció. Solicita uno nuevo."})
        try:
            user = User.objects.get(pk=urlsafe_base64_decode(datos.validated_data["uid"]).decode(), is_active=True)
        except (User.DoesNotExist, ValueError, TypeError, OverflowError, UnicodeDecodeError):
            raise invalido from None
        if not default_token_generator.check_token(user, datos.validated_data["token"]):
            raise invalido
        from .serializers import validar_clave

        clave = validar_clave(datos.validated_data["new_password"], user)
        with transaction.atomic():
            user.set_password(clave)  # cambiar la clave también invalida este mismo enlace
            user.save(update_fields=["password"])
            revocar_sesiones(user)
        registrar(request=request, accion=Accion.MODIFICAR, entidad="usuario", entidad_id=user.pk, usuario=user,
                  cambios={"campo": "contraseña", "via": "recuperacion"})
        return Response({"detail": "Contraseña actualizada. Ya puedes iniciar sesión."})


# --- Administración de usuarios y roles (solo administrador) --------------------------------

class UsuarioFilter(django_filters.FilterSet):
    rol = django_filters.ChoiceFilter(choices=[(r, r) for r in TODOS], method="filtrar_rol")

    class Meta:
        model = User
        fields = ["is_active"]

    def filtrar_rol(self, queryset, name, value):
        condicion = Q(groups__name=value)
        if value == ADMINISTRADOR:
            condicion |= Q(is_superuser=True)  # el superusuario cuenta como administrador
        return queryset.filter(condicion).distinct()


class UsuarioViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Gestión de usuarios. No hay borrado: las cuentas se desactivan."""

    permission_classes = [IsAuthenticated, HasAnyRole]
    allowed_roles = [ADMINISTRADOR]
    serializer_class = UserSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]
    filterset_class = UsuarioFilter
    search_fields = ["username", "email", "first_name", "last_name"]
    ordering_fields = ["username", "email", "date_joined", "last_login"]
    ordering = ["username"]

    def get_queryset(self):
        return User.objects.prefetch_related("groups")

    @extend_schema(request=UsuarioCreateSerializer, responses={201: UserSerializer})
    def create(self, request, *args, **kwargs):
        datos = UsuarioCreateSerializer(data=request.data)
        datos.is_valid(raise_exception=True)
        user = datos.save()
        registrar(request=request, accion=Accion.CREAR, entidad="usuario", entidad_id=user.pk,
                  cambios={"username": user.username, "roles": user.role_names(), "is_active": user.is_active})
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=UsuarioUpdateSerializer, responses=UserSerializer)
    def partial_update(self, request, *args, **kwargs):
        user = self.get_object()
        datos = UsuarioUpdateSerializer(user, data=request.data, partial=True)
        datos.is_valid(raise_exception=True)
        self._proteger_cuenta_propia(request.user, user, datos.validated_data)
        antes = {"email": user.email, "first_name": user.first_name, "last_name": user.last_name,
                 "telefono": user.telefono, "is_active": user.is_active, "roles": user.role_names()}
        user = datos.save()
        if "is_active" in datos.validated_data and not user.is_active:
            revocar_sesiones(user)
        user = self.get_queryset().get(pk=user.pk)  # relee los grupos
        despues = {"email": user.email, "first_name": user.first_name, "last_name": user.last_name,
                   "telefono": user.telefono, "is_active": user.is_active, "roles": user.role_names()}
        cambios = {c: [antes[c], despues[c]] for c in antes if antes[c] != despues[c]}
        if cambios:
            registrar(request=request, accion=Accion.MODIFICAR, entidad="usuario", entidad_id=user.pk,
                      cambios=cambios)
        return Response(UserSerializer(user).data)

    @staticmethod
    def _proteger_cuenta_propia(actor, objetivo, datos) -> None:
        """Evita que un administrador se deje a sí mismo sin acceso."""
        if actor.pk != objetivo.pk:
            return
        if datos.get("is_active") is False:
            raise ValidationError({"detail": "No puedes desactivar tu propia cuenta."})
        if "roles" in datos and ADMINISTRADOR not in datos["roles"] and not objetivo.is_superuser:
            raise ValidationError({"detail": "No puedes quitarte a ti mismo el rol de administrador."})

    def _cambiar_estado(self, request, activo: bool) -> Response:
        user = self.get_object()
        self._proteger_cuenta_propia(request.user, user, {"is_active": activo})
        if user.is_active != activo:
            user.is_active = activo
            user.save(update_fields=["is_active"])
            if not activo:
                revocar_sesiones(user)
            registrar(request=request, accion=Accion.MODIFICAR, entidad="usuario", entidad_id=user.pk,
                      cambios={"is_active": [not activo, activo]})
        return Response(UserSerializer(user).data)

    @extend_schema(request=None, responses=UserSerializer)
    @action(detail=True, methods=["post"])
    def activar(self, request, pk=None):
        return self._cambiar_estado(request, True)

    @extend_schema(request=None, responses=UserSerializer)
    @action(detail=True, methods=["post"])
    def desactivar(self, request, pk=None):
        return self._cambiar_estado(request, False)

    @extend_schema(request=None, responses={200: None})
    @action(detail=True, methods=["post"], url_path="cerrar-sesiones")
    def cerrar_sesiones(self, request, pk=None):
        user = self.get_object()
        cerradas = revocar_sesiones(user)
        registrar(request=request, accion=Accion.OTRO, entidad="usuario", entidad_id=user.pk,
                  cambios={"evento": "sesiones_cerradas_por_administrador", "sesiones": cerradas})
        return Response({"detail": f"Se cerraron {cerradas} sesión(es).", "sesiones": cerradas})


class RolListView(APIView):
    permission_classes = [IsAuthenticated, HasAnyRole]
    allowed_roles = [ADMINISTRADOR]

    @extend_schema(summary="Roles del sistema y usuarios activos de cada uno", responses=RolSerializer(many=True))
    def get(self, request):
        roles = []
        for nombre in TODOS:
            activos = User.objects.filter(is_active=True)
            condicion = Q(groups__name=nombre)
            if nombre == ADMINISTRADOR:
                condicion |= Q(is_superuser=True)
            roles.append({
                "nombre": nombre,
                "descripcion": DESCRIPCIONES[nombre],
                "usuarios_activos": activos.filter(condicion).distinct().count(),
            })
        return Response(roles)


__all__ = ["Group", "serializers"]  # (re-export evita avisos de importaciones sin uso en herramientas)
