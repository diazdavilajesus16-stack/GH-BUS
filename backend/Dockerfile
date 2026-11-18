# Backend GH BUS (Django + Gunicorn)
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# Herramientas para compilar mysqlclient (driver de MySQL)
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential pkg-config default-libmysqlclient-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Archivos estáticos (admin, etc.). Las variables son solo para poder cargar la configuración durante la compilación.
RUN DJANGO_SECRET_KEY=build-only DB_ENGINE=sqlite JWT_SIGNING_KEY=build-only \
    python manage.py collectstatic --noinput

# Usuario sin privilegios
RUN useradd --system --no-create-home --uid 10001 app && chmod +x docker-entrypoint.sh
USER app

EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:8000/api/health/', headers={'Host': 'localhost'}), timeout=4)"

ENTRYPOINT ["./docker-entrypoint.sh"]
