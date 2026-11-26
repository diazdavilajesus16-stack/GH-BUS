"""Emisión, rotación y revocación de tokens JWT.

- Refresh (1 día): va en cookie httpOnly. Es de un solo uso: cada renovación lo reemplaza por otro.
- Access (15 min): lleva el claim `roles`, que el servicio Node usa para decidir qué salas puede ver.
"""
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()


def emitir_tokens(user):
    """Devuelve (refresh, access) nuevos para el usuario. Los roles se leen de la base en este momento."""
    refresh = RefreshToken.for_user(user)
    access = refresh.access_token
    access["roles"] = user.role_names()
    return refresh, access


def _consumir(refresh: RefreshToken) -> None:
    """Marca el refresh como usado. Si ya lo estaba (reuso o carrera entre dos pestañas), falla."""
    try:
        registro = OutstandingToken.objects.get(jti=refresh[api_settings.JTI_CLAIM])
    except OutstandingToken.DoesNotExist as exc:
        raise TokenError("Token desconocido") from exc
    _, creado = BlacklistedToken.objects.get_or_create(token=registro)
    if not creado:
        raise TokenError("Token ya utilizado")


def rotar_refresh(token_crudo: str):
    """Valida el refresh recibido, lo consume y emite un par nuevo. Lanza TokenError si no es válido."""
    anterior = RefreshToken(token_crudo)  # verifica firma, vencimiento y lista negra
    try:
        user = User.objects.get(pk=anterior[api_settings.USER_ID_CLAIM], is_active=True)
    except User.DoesNotExist as exc:
        raise TokenError("Usuario inexistente o inactivo") from exc
    _consumir(anterior)
    refresh, access = emitir_tokens(user)
    return user, refresh, access


def invalidar_refresh(token_crudo: str):
    """Para el cierre de sesión. Devuelve el usuario dueño del token, o None si el token no era válido."""
    try:
        refresh = RefreshToken(token_crudo)
        user = User.objects.filter(pk=refresh[api_settings.USER_ID_CLAIM]).first()
        _consumir(refresh)
        return user
    except TokenError:
        return None


def revocar_sesiones(user) -> int:
    """Cierra TODAS las sesiones del usuario (ppone en lista negra sus refresh vigentes)."""
    pendientes = list(OutstandingToken.objects.filter(user=user, blacklistedtoken__isnull=True))
    BlacklistedToken.objects.bulk_create([BlacklistedToken(token=t) for t in pendientes], ignore_conflicts=True)
    return len(pendientes)
