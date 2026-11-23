import logging

from django.db import transaction

from .models import RegistroAuditoria
from .utils import client_ip

logger = logging.getLogger(__name__)

Accion = RegistroAuditoria.Accion


def registrar(
    *,
    accion: str,
    entidad: str,
    request=None,
    usuario=None,
    usuario_nombre: str | None = None,
    entidad_id=None,
    cambios: dict | None = None,
) -> None:
    """Escribe un registro de auditoría.

    Si falla, solo se deja constancia en el log: la auditoría no debe tumbar la operación.
    Se usa un savepoint para que un error aquí no deje rota la transacción que la rodea.
    """
    try:
        if usuario is None and request is not None:
            candidato = getattr(request, "user", None)
            if candidato is not None and getattr(candidato, "is_authenticated", False):
                usuario = candidato
        meta = request.META if request is not None else {}
        with transaction.atomic():
            RegistroAuditoria.objects.create(
                usuario=usuario,
                usuario_nombre=(usuario_nombre or (usuario.get_username() if usuario else ""))[:150],
                accion=accion,
                entidad=entidad[:60],
                entidad_id=None if entidad_id is None else str(entidad_id)[:40],
                cambios=cambios,
                ip=client_ip(request) if request is not None else None,
                user_agent=(meta.get("HTTP_USER_AGENT") or "")[:255] or None,
            )
    except Exception:
        logger.exception("No se pudo registrar la auditoría (%s %s)", accion, entidad)
