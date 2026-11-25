# Manual técnico — instalación y administración de GH BUS

## 1. Propósito y límites

Guía para ejecutar la versión local de presentación y preparar una demostración controlada. El sistema usa React/TypeScript, Django REST Framework, Node.js/Socket.IO y MySQL 8.4 mediante Docker Compose.

Esta versión **no debe ponerse en producción**: Yape/Visa son pagos simulados, no hay integración bancaria ni reembolsos, el envío SMTP no está configurado por defecto y no existe GPS en vivo. El catálogo cargado por `cargar_catalogo_ghbus` refleja datos proporcionados por la usuaria y no ha sido verificado independientemente; los montos son precios referenciales desde. Las tarifas iniciales solo corresponden a Estándar / Económico. `cargar_demo` añade activos ilustrativos para pruebas locales.

## 2. Requisitos

- Windows 10/11 con Docker Desktop y Docker Compose v2.
- Git para obtener el proyecto.
- Node.js 22+ solo si se desea ejecutar frontend o realtime fuera de Docker.
- Puertos locales 8080 y 3307 disponibles (el segundo es solo para MySQL local).

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
| `backend` | Django valida sesión, roles y reglas; es el único escritor de negocio en la base de datos. | Solo red interna; API bajo `/api/` |
| `realtime` | Node valida los mensajes firmados de Django y distribuye eventos Socket.IO. No decide disponibilidad ni estados. | Solo red interna |
| `db` | MySQL 8.4 persiste la aplicación. | `127.0.0.1:3307` en la configuración local |

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

La prueba usa una base temporal `test_ghbus_validation`, separada de la base local `MYSQL_DATABASE`; Django la elimina al terminar. No uses `docker compose down -v`: elimina el volumen MySQL y los datos locales.

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
