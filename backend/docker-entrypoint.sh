#!/bin/sh
# Aplica las migraciones y arranca Gunicorn. MySQL ya está "healthy" gracias a depends_on.
set -e
python manage.py migrate --noinput
exec gunicorn config.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers "${GUNICORN_WORKERS:-3}" \
    --timeout 60 \
    --access-logfile -
