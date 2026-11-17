"""Publicación de eventos hacia el servicio de tiempo real (Node.js).

Reglas:
- Django valida y guarda primero; el evento se envía solo DESPUÉS de confirmar la
  transacción (transaction.on_commit), así nunca se anuncia algo que se revirtió.
- Si el servicio de tiempo real no responde, se registra una advertencia pero la
  operación de negocio NO falla: el tiempo real es un complemento.
- Cada mensaje va firmado con HMAC-SHA256 sobre "<timestamp>.<cuerpo>".

Uso:
    from api.realtime import publish_event
    publish_event("seat.updated", {"trip_id": 5, "seat_number": 12, "status": "sold"})
"""
import hashlib
import hmac
import json
import logging
import time
import urllib.request

from django.conf import settings
from django.db import transaction

logger = logging.getLogger(__name__)


def sign_payload(secret: str, timestamp: str, body: bytes) -> str:
    """Firma idéntica a realtime/src/security/hmac.ts."""
    return hmac.new(secret.encode("utf-8"), timestamp.encode("utf-8") + b"." + body, hashlib.sha256).hexdigest()


def _send(event: str, data: dict) -> None:
    url = settings.REALTIME_URL
    secret = settings.REALTIME_HMAC_SECRET
    if not url or not secret:
        return

    body = json.dumps({"event": event, "data": data}, separators=(",", ":"), ensure_ascii=False, default=str).encode("utf-8")
    timestamp = str(int(time.time()))
    request = urllib.request.Request(
        url.rstrip("/") + "/internal/events",
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-GHBUS-Timestamp": timestamp,
            "X-GHBUS-Signature": sign_payload(secret, timestamp, body),
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=settings.REALTIME_TIMEOUT):
            pass
    except Exception:
        logger.warning("No se pudo publicar el evento %s al servicio de tiempo real", event, exc_info=True)


def publish_event(event: str, data: dict) -> None:
    """Programa el envío del evento para cuando la transacción actual se confirme."""
    transaction.on_commit(lambda: _send(event, data))
