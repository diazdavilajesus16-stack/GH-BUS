# Manual técnico — instalación y administración de GH BUS

## 1. Propósito y límites

Guía para ejecutar la versión local y preparar el despliegue. La aplicación usa React/TypeScript, Django REST Framework y Node.js/Socket.IO. PostgreSQL en Supabase es el destino; el MySQL 8.4 de Docker Compose se conserva temporalmente como origen de los datos actuales.

Esta versión **no debe ponerse en producción**: Yape/Visa son pagos simulados, no hay integración bancaria ni reembolsos, el envío SMTP no está configurado por defecto y no existe GPS en vivo. El catálogo cargado por `cargar_catalogo_ghbus` refleja datos proporcionados por la usuaria y no ha sido verificado independientemente; los montos son precios referenciales desde. Las tarifas iniciales solo corresponden a Estándar / Económico. `cargar_demo` añade activos ilustrativos para pruebas locales.

## 2. Requisitos

- Windows 10/11 con Docker Desktop y Docker Compose v2.
- Git para obtener el proyecto.
- Node.js 22+ solo si se desea ejecutar frontend o realtime fuera de Docker.
- Puertos locales 8080 y 3307 disponibles (el segundo es solo para el MySQL local de origen).

## 3. Arranque local en PowerShell

Desde la raíz del repositorio:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Abre `.env` y define secretos propios para `DJANGO_SECRET_KEY`, `JWT_SIGNING_KEY` y `REALTIME_HMAC_SECRET`. No los compartas ni los subas al repositorio. Después:

```powershell
docker compose up -d --build
docker compose ps
```

Espera a que `db`, `backend`, `realtime` y `web` aparezcan saludables. La aplicación está en `http://localhost:8080`; la API responde en `http://localhost:8080/api/health/`.

El backend aplica migraciones al arrancar. Para crear el primer administrador:

```powershell
docker compose exec backend python manage.py createsuperuser
```

Carga el catálogo de localidades, rutas de ida y tarifas referenciales:

```powershell
docker compose exec backend python manage.py cargar_catalogo_ghbus --forzar
```

El comando es idempotente. Carga 20 localidades, nueve rutas de ida y cinco tipos de servicio; asigna las tarifas base solo a Estándar / Económico y conserva inactivos los registros históricos de Comfort Class. Desactiva las antiguas rutas, tarifas y horarios DEMO. No crea horarios porque no se proporcionaron horas de salida.

Para una presentación local que necesite un vehículo y una distribución de asientos de ejemplo:

```powershell
docker compose exec backend python manage.py cargar_demo --forzar
```

Este comando carga también el catálogo y añade `DEMO-001` con una plantilla ilustrativa. No crea usuarios, conductores, licencias ni documentos vehiculares. Registra el conductor y los documentos desde la interfaz, tal como se explica en el [manual de usuario](manual-usuario.md).

## 4. Servicios y responsabilidades

| Servicio | Responsabilidad | Acceso |
|---|---|---|
| `web` | Nginx sirve React y enruta las peticiones. Es el único servicio publicado por Compose. | `http://localhost:8080` |
| `backend` | Django valida sesión, roles y reglas; es el único escritor de negocio en la base de datos. | Compose: solo red interna. Render Free: URL pública del servicio; la API exige autenticación salvo rutas públicas |
| `realtime` | Node valida los mensajes firmados de Django y distribuye eventos Socket.IO. No decide disponibilidad ni estados. | Compose: solo red interna. Render Free: URL pública; `/internal/events` exige firma HMAC |
| `db` | MySQL 8.4 local, conservado para los datos actuales. | `127.0.0.1:3307` |

Para conectar Django local a Supabase, configura `DB_ENGINE=postgres` y `DATABASE_URL` en `backend/.env`. En Render, define esas variables en el backend como secretos; no expongas `DATABASE_URL` al frontend.

### 4.1 Prueba gratuita en Render

El archivo `render.yaml` crea tres servicios web gratuitos: API Django, realtime y Nginx/React. El frontend conserva un único origen para el navegador y hace proxy hacia las URL públicas de los otros dos servicios. En el plan gratuito no se puede depender de que un servicio Free reciba tráfico por la red privada de Render.

1. Publica `render.yaml` y los cambios de despliegue en la rama que quieres probar; para validar antes de integrar, usa `integration/develop-to-main`.
2. En Render, elige **New > Blueprint**, conecta el repositorio GH-BUS y selecciona esa rama. Revisa el Blueprint antes de aplicarlo: deben ser tres servicios con plan **Free**.
3. Cuando Render lo solicite, pega `DATABASE_URL` de Supabase solo en el servicio `ghbus-diaz16-preview-api`. No la guardes en el repositorio ni la compartas por chat. Render genera `DJANGO_SECRET_KEY`, `JWT_SIGNING_KEY` y `REALTIME_HMAC_SECRET`, y comparte con realtime únicamente las claves que necesita.
4. Los servicios quedan en Virginia. Si tu proyecto de Supabase está en otra región, cambia `region` en `render.yaml` antes de crear los servicios; Render no permite mover un servicio existente a otra región.
5. Comprueba `/` en `ghbus-diaz16-preview-web.onrender.com`, `/api/health/` en `ghbus-diaz16-preview-api.onrender.com` y `/health` en `ghbus-diaz16-preview-realtime.onrender.com`. Después prueba inicio de sesión, cookie de refresco y eventos en tiempo real desde la web.

Los servicios Free se duermen después de 15 minutos sin tráfico y pueden tardar alrededor de un minuto en despertar. Las 750 horas gratuitas mensuales son compartidas por los servicios Free del workspace; también hay límites de ancho de banda y compilación. La API y realtime tienen subdominios públicos: el API requiere autenticación por defecto y el endpoint interno de realtime exige HMAC. Esto es para pruebas, no producción; no ingreses datos reales ni habilites cobros. Los datos persistentes deben vivir en Supabase, no en el disco de Render.

Las reglas de compra, asignación, embarque y caja se deben validar en Django; el navegador y Socket.IO solo presentan cambios.

## 5. Roles y relaciones de datos

- **Administrador:** configura catálogos y usuarios, además de gestionar módulos operativos, comerciales y financieros.
- **Despachador:** programa y despacha viajes, y gestiona incidencias.
- **Cajero:** realiza ventas, confirma efectivo y opera su propia caja.
- **Conductor:** ve viajes asignados y puede registrar o validar acciones permitidas para esos viajes.
- **Cliente:** se registra públicamente y consulta únicamente sus reservas.

Las cuentas de personal las crea el administrador en Seguridad y control. Los clientes se registran desde la web. Un perfil de conductor puede vincularse a una cuenta con el rol conductor; sin esa relación el conductor puede existir y ser asignado, pero no iniciar sesión como tal.

Los modelos y migraciones de Django son la fuente de verdad del esquema actual. [database.md](database.md) conserva decisiones de diseño iniciales y no reemplaza las migraciones.

## 6. Flujos que conviene validar antes de presentar

1. **Operación:** ruta, tarifa y horario activos → generar viaje futuro → asignar vehículo con SOAT y revisión técnica vigentes → asignar conductor con licencia vigente → confirmar → embarque.
2. **Comercial:** cuenta de cliente → elegir viaje y asiento → crear reserva → pago simulado o espera de efectivo → boleto QR.
3. **Caja:** cajero abre caja → confirma efectivo pendiente → registra movimientos → cierra caja y revisa diferencia.
4. **Control:** validar un QR pagado una sola vez; un conductor solo valida el viaje que tiene asignado.
5. **Cierre:** finalizar viaje → registrar gastos → cerrar liquidación → revisar reporte.
6. **Cancelación:** cancelar viaje con motivo → reservas y boletos asociados pasan a cancelados, asientos se liberan y los clientes dejan de ver el QR. No se procesa un reembolso.
7. **Catálogo:** revisar las 20 localidades y nueve trayectos de ida; introducir horarios solo después de confirmar las horas de salida. Validar externamente las duraciones, tarifas y agencia de La Victoria antes de cualquier operación comercial.

Ejemplos de navegación y datos están en el [manual de usuario](manual-usuario.md); rutas de API, en [api.md](api.md).

## 7. Validación técnica

Los comandos siguientes no eliminan la base de datos principal:

```powershell
docker compose exec backend python manage.py check
docker compose exec backend python manage.py makemigrations --check --dry-run
docker compose run --build --no-deps --rm -e DB_NAME=ghbus_validation --entrypoint python backend manage.py test
npm test --prefix frontend
npm run build --prefix frontend
npm test --prefix realtime
npm run typecheck --prefix realtime
```

La prueba usa una base temporal separada de la base de aplicación. No uses `docker compose down -v`: elimina el volumen MySQL que conserva los datos actuales.

## 8. Diagnóstico

```powershell
docker compose ps
docker compose logs --tail=100 backend
docker compose logs --tail=100 realtime
docker compose logs --tail=100 web
```

- **Web no abre:** comprueba que `web` esté saludable y el puerto configurado en `.env`.
- **Error de conexión/API:** comprueba `backend`, `db` y `/api/health/`.
- **Sin eventos en tiempo real:** comprueba `realtime`; vuelve a cargar la vista para obtener el estado actual desde Django.
- **Restablecimiento de contraseña sin correo:** por defecto el mensaje se registra en la consola del backend. Configura SMTP antes de necesitar correo saliente.
- **Migración pendiente:** revisa el log de `backend`; no edites la base manualmente.

## 9. Antes de cualquier operación real

Hace falta un proyecto explícito de producción: dominio y HTTPS, secretos y almacenamiento seguro, política de copias de seguridad y restauración probada, SMTP, monitoreo, privacidad y retención, validación oficial de rutas, agencia, documentos, horarios y tarifas, pruebas de carga, y una pasarela autorizada con cuenta de comercio y proceso de reembolsos. No se deben activar cobros reales únicamente cambiando una variable de entorno.
