#!/bin/sh
# Aplica las migraciones y asegura la tabla de caché antes de iniciar Gunicorn.
set -e
python manage.py migrate --fake-initial --noinput
# Tabla de caché (contador de intentos de login). Es idempotente.
python manage.py createcachetable
exec gunicorn config.wsgi:application \
    --bind "0.0.0.0:${PORT:-10000}" \
    --workers "${GUNICORN_WORKERS:-3}" \
    --timeout 60 \
    --access-logfile -
