# GH BUS

Sistema web integral de gestión de transporte interprovincial.

## Arquitectura
| Servicio | Tecnología | Carpeta |
|---|---|---|
| Frontend | React + Vite + TypeScript + Tailwind | `frontend/` |
| Backend principal | Python + Django REST Framework | `backend/` |
| Servicio en tiempo real | Node.js + Express + Socket.IO (TypeScript) | `realtime/` |
| Base de datos | MySQL | (Docker) |
| Orquestación | Docker Compose | `docker-compose.yml` |

Django centraliza la lógica de negocio y es el único que escribe en operaciones críticas. Node.js solo gestiona tiempo real.

## Estado
- [x] Fase 1: análisis y planificación
- [ ] Fase 2: backend
- [ ] Fase 3: frontend
- [ ] Fase 4: integración
- [ ] Fase 5: pruebas y despliegue

## Puesta en marcha (desarrollo)

### 1. Base de datos MySQL (Docker)
```bash
cp .env.example .env          # edita las contraseñas
docker compose up -d db
docker compose ps             # debe mostrar "healthy"
```

### 2. Backend Django
```bash
cd backend
python -m venv .venv
# Windows (PowerShell): .venv\Scripts\Activate.ps1   |   Linux/Mac: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # completa DJANGO_SECRET_KEY y DB_PASSWORD
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```
- Salud del servicio: http://localhost:8000/api/health/
- Swagger: http://localhost:8000/api/docs/
- Pruebas: `python manage.py test`

## Flujo de ramas
`main` (estable) <- `develop` (integración) <- `feature/*`

## Seguridad
No subir `.env`, contraseñas, tokens ni credenciales. Usar `.env.example` como plantilla.
