"""Configuración de Django para GH BUS.

Toda la configuración sensible se lee de variables de entorno (backend/.env).
"""
from datetime import timedelta
from pathlib import Path

import environ
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(DEBUG=(bool, False))
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("DJANGO_SECRET_KEY")
DEBUG = env("DEBUG")
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

# --------------------------------------------------------------------------
# Aplicaciones
# --------------------------------------------------------------------------
DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
    "drf_spectacular",
]

LOCAL_APPS = [
    "apps.core",
    "apps.users",
    "apps.operations",
    "apps.fleet",
    "apps.drivers",
    "apps.routes",
    "apps.trips",
    "apps.reservations",
    "apps.tickets",
    "apps.passengers",
    "apps.finance",
    "apps.reports",
    "apps.audit",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

AUTH_USER_MODEL = "users.User"

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",  # sirve /static/ (admin, etc.) sin depender de nginx
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# --------------------------------------------------------------------------
# Base de datos. PostgreSQL es el destino de producción (Supabase).
# MySQL se conserva para el entorno Docker actual y la exportación de datos.
# SQLite se usa únicamente en pruebas rápidas y durante collectstatic.
# --------------------------------------------------------------------------
DB_ENGINE = env("DB_ENGINE", default="mysql").lower()

if DB_ENGINE == "sqlite":
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }
elif DB_ENGINE == "postgres":
    DATABASES = {"default": env.db_url("DATABASE_URL")}
    DATABASES["default"].update(
        {
            "CONN_MAX_AGE": 60,
            "CONN_HEALTH_CHECKS": True,
        }
    )
elif DB_ENGINE == "mysql":
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.mysql",
            "NAME": env("DB_NAME"),
            "USER": env("DB_USER"),
            "PASSWORD": env("DB_PASSWORD"),
            "HOST": env("DB_HOST", default="127.0.0.1"),
            "PORT": env("DB_PORT", default="3306"),
            # Sin ATOMIC_REQUESTS: las operaciones críticas usan transaction.atomic().
            "CONN_MAX_AGE": 60,
            "OPTIONS": {
                "charset": "utf8mb4",
                "isolation_level": "read committed",
                "init_command": "SET sql_mode='STRICT_TRANS_TABLES'",
            },
        }
    }
else:
    raise ImproperlyConfigured(
        f"DB_ENGINE no reconocido: {DB_ENGINE}. Usa postgres, mysql o sqlite."
    )

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
DATABASES["default"]["ATOMIC_REQUESTS"] = False

# Caché en base de datos: compartida entre los procesos de Gunicorn (límites de intentos de login).
# La tabla se crea con `python manage.py createcachetable` (el entrypoint de Docker lo hace).
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.db.DatabaseCache",
        "LOCATION": "cache_tabla",
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Contraseñas con Argon2/PBKDF2: Django usa PBKDF2-SHA256 por defecto (hash seguro con sal).

# --------------------------------------------------------------------------
# Internacionalización
# --------------------------------------------------------------------------
LANGUAGE_CODE = "es-pe"
TIME_ZONE = "America/Lima"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}

# --------------------------------------------------------------------------
# Django REST Framework + JWT + Swagger
# --------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    # Todo endpoint exige autenticación salvo que se indique lo contrario.
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.StandardPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ),
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_RENDERER_CLASSES": ("rest_framework.renderers.JSONRenderer",),
    "EXCEPTION_HANDLER": "api.exceptions.exception_handler",
    # Límites de uso. Cada vista elige qué límites aplica (login, registro, recuperación).
    "DEFAULT_THROTTLE_RATES": {
        "login_ip": "30/min",
        "register": "10/hour",
        "password_reset": "5/hour",
        "assistant": "20/hour",
    },
    # Detrás de nginx hay 1 proxy: la IP real del cliente es la que nginx añade a X-Forwarded-For.
    "NUM_PROXIES": 1 if env.bool("USE_PROXY_HEADERS", default=False) else 0,
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=1),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
    # Clave propia para firmar los JWT (distinta de SECRET_KEY): el servicio Node.js
    # la usa solo para VERIFICAR tokens, sin necesidad de conocer la clave de Django.
    "ALGORITHM": "HS256",
    "SIGNING_KEY": env("JWT_SIGNING_KEY"),
}

# --------------------------------------------------------------------------
# Sesión: el token de refresco viaja en una cookie httpOnly (JavaScript no puede leerla).
# El token de acceso (15 min) se entrega en el cuerpo y vive solo en memoria del navegador.
# --------------------------------------------------------------------------
AUTH_COOKIE_NAME = "ghbus_refresh"
AUTH_COOKIE_PATH = "/api/auth/"
AUTH_COOKIE_SAMESITE = "Strict"
# True cuando el sitio se sirva por HTTPS. En desarrollo local por http debe ser False.
AUTH_COOKIE_SECURE = env.bool("AUTH_COOKIE_SECURE", default=not DEBUG)

# Solo True detrás del nginx de Docker (única puerta de entrada): permite leer la IP real del cliente.
USE_PROXY_HEADERS = env.bool("USE_PROXY_HEADERS", default=False)

# Intentos fallidos de login permitidos por usuario + IP antes de bloquear temporalmente.
LOGIN_MAX_FAILURES = env.int("LOGIN_MAX_FAILURES", default=5)
LOGIN_LOCKOUT_SECONDS = env.int("LOGIN_LOCKOUT_SECONDS", default=900)
GEMINI_API_KEY = env("GEMINI_API_KEY", default="")
GEMINI_MODEL = env("GEMINI_MODEL", default="gemini-3.6-flash")

# --------------------------------------------------------------------------
# Correo (recuperación de contraseña). Por defecto se imprime en la consola del servidor.
# Para enviar correos reales: EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend + datos SMTP.
# --------------------------------------------------------------------------
EMAIL_BACKEND = env("EMAIL_BACKEND", default="django.core.mail.backends.console.EmailBackend")
EMAIL_HOST = env("EMAIL_HOST", default="localhost")
EMAIL_PORT = env.int("EMAIL_PORT", default=587)
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=True)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="GH BUS <no-responder@ghbus.local>")
# Dirección pública del frontend (se usa en los enlaces de los correos).
FRONTEND_URL = env("FRONTEND_URL", default="http://localhost:5173").rstrip("/")
# El enlace de recuperación de contraseña vence a la hora.
PASSWORD_RESET_TIMEOUT = 3600

# --------------------------------------------------------------------------
# Servicio de tiempo real (Node.js). Django publica eventos firmados (HMAC).
# Si REALTIME_URL está vacío, la publicación se desactiva (útil en pruebas).
# --------------------------------------------------------------------------
REALTIME_URL = env("REALTIME_URL", default="")
REALTIME_HMAC_SECRET = env("REALTIME_HMAC_SECRET", default="")
REALTIME_TIMEOUT = env.float("REALTIME_TIMEOUT", default=2.0)

SPECTACULAR_SETTINGS = {
    "TITLE": "GH BUS API",
    "DESCRIPTION": "API REST del sistema de gestión de transporte interprovincial GH BUS.",
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

# --------------------------------------------------------------------------
# CORS
# --------------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=["http://localhost:5173"])
# Orígenes desde los que se permite iniciar sesión en /admin/ (necesario detrás de nginx/HTTPS).
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=[])

# --------------------------------------------------------------------------
# Logs
# --------------------------------------------------------------------------
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "simple": {"format": "{asctime} {levelname} {name} {message}", "style": "{"},
    },
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "simple"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
