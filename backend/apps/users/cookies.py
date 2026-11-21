from django.conf import settings


def poner_cookie_refresh(response, refresh) -> None:
    response.set_cookie(
        settings.AUTH_COOKIE_NAME,
        str(refresh),
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        httponly=True,  # JavaScript no puede leerla: un XSS no puede robar la sesión
        secure=settings.AUTH_COOKIE_SECURE,
        samesite=settings.AUTH_COOKIE_SAMESITE,
        path=settings.AUTH_COOKIE_PATH,  # solo viaja a /api/auth/*
    )


def borrar_cookie_refresh(response) -> None:
    response.delete_cookie(
        settings.AUTH_COOKIE_NAME, path=settings.AUTH_COOKIE_PATH, samesite=settings.AUTH_COOKIE_SAMESITE
    )
