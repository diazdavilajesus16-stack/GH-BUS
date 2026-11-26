from django.conf import settings


def client_ip(request) -> str | None:
    """IP del cliente.

    Solo se confía en X-Forwarded-For cuando USE_PROXY_HEADERS está activo (detrás del nginx de Docker,
    única puerta de entrada). Se toma el ÚLTIMO valor: es el que añade nuestro nginx, no uno falsificado.
    """
    meta = request.META
    if settings.USE_PROXY_HEADERS:
        forwarded = meta.get("HTTP_X_FORWARDED_FOR")
        if forwarded:
            return forwarded.split(",")[-1].strip()[:45] or None
    return (meta.get("REMOTE_ADDR") or "")[:45] or None
