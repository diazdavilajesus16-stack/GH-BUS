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
> Django 6.1 exige **MySQL 8.4 o superior**. El MySQL de Docker Compose ya es 8.4; si usas uno instalado en tu equipo, debe ser 8.4+.

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

### 3. Servicio de tiempo real (Node.js)
```bash
cd realtime
cp .env.example .env     # JWT_SIGNING_KEY y REALTIME_HMAC_SECRET iguales a los de backend/.env
npm install
npm test
npm run dev              # http://localhost:4000/health
```
Los tres secretos (`JWT_SIGNING_KEY`, `REALTIME_HMAC_SECRET`) se generan con, por ejemplo:
`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

### 4. Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev              # http://localhost:5173
npm test                 # pruebas unitarias
npm run build            # compilación de producción
```
Variables opcionales en `frontend/.env` (ver `.env.example`): `VITE_API_URL` y `VITE_REALTIME_URL`.

### 5. Todo el sistema con Docker (un solo comando)
```bash
cp .env.example .env
# Completa en .env: DJANGO_SECRET_KEY, JWT_SIGNING_KEY y REALTIME_HMAC_SECRET
# (tres valores distintos; genéralos con el comando que indica el propio .env.example)
docker compose up -d --build
docker compose ps        # los 4 servicios deben aparecer "healthy"
```
Abre http://localhost:8080. Solo se publica el servicio `web` (nginx):

| Ruta | Destino |
|---|---|
| `/` | Aplicación React |
| `/api/`, `/admin/` | Backend Django (Swagger en `/api/docs/`) |
| `/socket.io/` | Servicio de tiempo real |
| `/internal` | **Bloqueado** (canal privado Django → Node) |

Backend y realtime no tienen puertos públicos; MySQL escucha solo en `127.0.0.1`.
Crear el primer usuario: `docker compose exec backend python manage.py createsuperuser`.
Detener: `docker compose down` (los datos persisten en el volumen `mysql_data`; `down -v` los borra).

## Flujo de ramas
`main` (estable) <- `develop` (integración) <- `feature/*`

## Seguridad
No subir `.env`, contraseñas, tokens ni credenciales. Usar `.env.example` como plantilla.
