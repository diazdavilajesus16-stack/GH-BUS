"""Autenticación y protección contra fuerza bruta."""
import hashlib

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache

from apps.audit.utils import client_ip

User = get_user_model()


def buscar_usuario(identificador: str):
    """Busca por nombre de usuario (exacto) y, si no existe, por correo (sin distinguir mayúsculas)."""
    identificador = identificador.strip()
    return (
        User.objects.filter(username=identificador).first()
        or User.objects.filter(email__iexact=identificador).first()
    )


def autenticar(identificador: str, password: str):
    """Devuelve (usuario autenticado o None, usuario encontrado o None)."""
    encontrado = buscar_usuario(identificador)
    if encontrado is None:
        User().set_password(password)  # gasta el mismo tiempo que un usuario real
        return None, None
    if encontrado.is_active and encontrado.check_password(password):
        return encontrado, encontrado
    return None, encontrado


# --- Límite de intentos fallidos por (IP, usuario) -------------------------------------------
# Se liga también a la IP para que un atacante no pueda bloquear la cuenta de otra persona.

def _clave(request, identificador: str) -> str:
    crudo = f"{client_ip(request)}|{identificador.strip().lower()}"
    return "login_fallos:" + hashlib.sha256(crudo.encode()).hexdigest()


def esta_bloqueado(request, identificador: str) -> bool:
    return cache.get(_clave(request, identificador), 0) >= settings.LOGIN_MAX_FAILURES


def registrar_fallo(request, identificador: str) -> None:
    clave = _clave(request, identificador)
    cache.set(clave, cache.get(clave, 0) + 1, timeout=settings.LOGIN_LOCKOUT_SECONDS)


def limpiar_fallos(request, identificador: str) -> None:
    cache.delete(_clave(request, identificador))
