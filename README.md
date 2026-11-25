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

## Estado actual
- Flujos de operación, despacho, comercial, caja, liquidaciones, reportes y seguridad implementados para demostración local.
- Roles, reservas, asientos, pagos simulados, emisión/validación de QR y cancelación de viajes conectados entre frontend y backend.
- **Alcance académico:** no hay pasarela real de pago, reembolsos, GPS en vivo ni SMTP configurado por defecto. No presentar la versión local como producción.

## Manuales
- [Manual de usuario por roles y recorrido de demostración](docs/manual-usuario.md)
- [Manual técnico de instalación y administración](docs/manual-tecnico.md)
- [Índice de rutas API](docs/api.md)

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
python manage.py createcachetable   # tabla del contador de intentos de login
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

**Primer administrador.** `createsuperuser` crea un usuario que el sistema reconoce como *administrador*
(sin necesidad de asignarle el grupo). Desde ahí, en el panel → Seguridad y control → Usuarios, se crean el
resto de cuentas. En desarrollo, el frontend (`npm run dev`) manda `/api` a Django por el proxy de Vite.

Backend y realtime no tienen puertos públicos; MySQL escucha solo en `127.0.0.1`.
Crear el primer usuario: `docker compose exec backend python manage.py createsuperuser`.
Detener: `docker compose down` (los datos persisten en el volumen `mysql_data`; `down -v` los borra).

## Autenticación y roles (Paso 9)
- **Roles** (grupos de Django): administrador, despachador, cajero, conductor, cliente. Se crean solos con `migrate`.
- **Sesión:** token de acceso de 15 min (en memoria del navegador) + token de refresco de 1 día en cookie
  `httpOnly` + `SameSite=Strict` (JavaScript no puede leerla), de un solo uso y rotativo. Cambiar la contraseña,
  desactivar al usuario o «cerrar sesiones» invalida todos sus refrescos. Un token de acceso ya emitido sigue
  valiendo hasta 15 min.
- **Protección:** bloqueo tras 5 intentos fallidos por IP + usuario (15 min), límites por IP, mensajes de error que
  no revelan si una cuenta existe, contraseñas validadas por Django.
- **Auditoría:** tabla `registro_auditoria` (solo se agrega, no se edita ni borra): inicios de sesión, fallos,
  cambios de usuarios y roles, permisos denegados. Consulta: `GET /api/auditoria/` (solo administrador).
- **Recuperación de contraseña:** envía un enlace por correo. Por defecto el correo sale en la consola del
  backend (`docker compose logs backend`); para enviarlo de verdad configura `EMAIL_*` (SMTP) en `.env`.
- **Producción con HTTPS:** pon `AUTH_COOKIE_SECURE=True`.
- Pendiente a futuro: verificación del correo al registrarse.

## Operación y despacho — catálogos (Paso 10, parte 1)
Pantallas del panel (según rol): **Rutas** (rutas, paradas, tarifas, ciudades, tipos de servicio; solo administrador),
**Horarios**, **Vehículos** (flota, distribución de asientos, documentos, mantenimientos), **Conductores**
(licencias, turnos y descansos) y **Configuración general** (parámetros; solo administrador). Horarios, Vehículos y
Conductores los usan administrador y despachador. El cajero puede *leer* rutas, tarifas y horarios (los necesitará para vender).
- Nada se borra: los registros se **desactivan**. Cada alta y cambio queda en la bitácora de auditoría.
- Reglas ya aplicadas: tarifas activas de una misma ruta/servicio no se cruzan; paradas dentro de la duración de la ruta;
  turnos de un conductor no se cruzan; el estado «En viaje» de un vehículo solo lo pone el sistema; placas y códigos en mayúsculas.
- **Catálogo de localidades, rutas, tipos de servicio y precios referenciales proporcionados para GH BUS:** `python manage.py cargar_catalogo_ghbus` (con Docker: `docker compose exec backend python manage.py cargar_catalogo_ghbus --forzar`). Las tarifas iniciales se asignan solo a Estándar / Económico; los datos no han sido verificados independientemente y no se crean horarios porque no se informaron horas de salida.
  Ciudades reales de San Martín; duraciones, precios y la flota son inventados, solo para probar las pantallas.
- Los **parámetros** (minutos de bloqueo, margen entre viajes, descanso del conductor, categorías de licencia, IGV…) traen
  los valores iniciales de `docs/database.md` §7 y **deben confirmarse con la empresa** (en especial las categorías de licencia con el MTC).

## Operación y despacho — viajes (Paso 10, parte 2)
Tres pantallas nuevas: **Programación de viajes** (administrador, despachador), **Despacho de unidades** (administrador, despachador)
y **Seguimiento de viajes** (también conductor, que ve solo sus viajes).
- **Generar desde horarios:** crea los viajes de un rango de fechas (máx. 62 días) con la tarifa vigente de cada día. Se puede repetir sin duplicar;
  avisa qué rutas/servicios no tienen tarifa. También hay «Viaje manual».
- **Asignación sin cruces:** un vehículo o conductor no puede estar en dos viajes a la vez (margen entre viajes y descanso del conductor
  según *Configuración*). Se bloquea al vehículo inactivo, en mantenimiento, de otro servicio, o con **SOAT / revisión técnica** vencidos o ausentes;
  y al conductor inactivo, sin licencia vigente de categoría permitida, o en descanso/vacaciones. El servidor explica cada motivo y,
  ante dos personas asignando a la vez, solo una gana (bloqueo de filas, probado con 10 hilos en MySQL).
- **Estados:** Programado → Confirmado → En embarque → En ruta ⇄ Retrasado → Finalizado; Cancelado desde antes de salir. Retraso y cancelación exigen motivo;
  cada cambio queda en el historial y en la auditoría y se avisa en tiempo real (Socket.IO) a las pantallas del personal.
- **Incidencias** (mecánica, retraso, accidente, clima, pasajero, otro): las de severidad alta generan aviso inmediato al personal.
- **Alertas** de documentos y licencias vencidos o por vencer, en Despacho.
- **Para una presentación local:** `cargar_demo` carga el catálogo y añade la plantilla de asientos y el vehículo ilustrativo `DEMO-001`. No crea horarios, cuentas, conductores, licencias ni documentos vehiculares; registra esos datos de prueba antes de asignar.
- Al cancelar un viaje, las reservas y boletos asociados se anulan y se liberan los asientos; no existe un flujo de reembolso.
- Límites conocidos: el cambio a «En embarque» no restringe la hora; el tipo de turno «TURNO» no bloquea al conductor (solo descanso y vacaciones); `posicion_unidad` (GPS) no se construyó.

## Comercial y financiero
- El cliente autenticado o el personal autorizado puede reservar asientos; el servidor controla la disponibilidad y vence reservas pendientes según la configuración.
- La confirmación emite el QR. Cancelar un viaje anula sus reservas y boletos relacionados. Las cancelaciones no generan reembolsos.
- **Yape y Visa son simulados:** no se contacta una pasarela ni se cobran tarjetas. El efectivo queda pendiente hasta que un cajero con caja abierta lo confirme.
- Caja registra ingresos y egresos de demostración; las liquidaciones se habilitan para viajes finalizados. Los datos no deben interpretarse como contabilidad real.

## Flujo de ramas
`main` (estable) <- `develop` (integración) <- `feature/*`

## Seguridad
No subir `.env`, contraseñas, tokens ni credenciales. Usar `.env.example` como plantilla.
