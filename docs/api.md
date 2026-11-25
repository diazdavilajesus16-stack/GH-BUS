# Índice de API de GH BUS

Base local: `http://localhost:8080/api/`. La interfaz Swagger está en `/api/docs/` y la especificación OpenAPI en `/api/schema/`.

La autenticación entrega un token de acceso para `Authorization: Bearer <access>` y mantiene el token de renovación en una cookie `httpOnly`. Los permisos se verifican en el backend. Este índice documenta las rutas implementadas; algunas vistas todavía no tienen todos sus esquemas request/response completos en Swagger.

## Sesión y usuarios

| Método | Ruta | Uso |
|---|---|---|
| POST | `/auth/login/` | Iniciar sesión. |
| POST | `/auth/refresh/` | Renovar la sesión usando la cookie. |
| POST | `/auth/logout/` | Cerrar sesión y revocar la cookie de renovación. |
| POST | `/auth/register/` | Registrar una cuenta de cliente. |
| GET | `/auth/me/` | Consultar el usuario autenticado. |
| POST | `/auth/password/change/` | Cambiar contraseña. |
| POST | `/auth/password/reset/` | Solicitar restablecimiento. |
| POST | `/auth/password/reset/confirm/` | Confirmar restablecimiento. |
| GET | `/roles/` | Roles y conteo de usuarios activos; administrador. |
| `/usuarios/` | CRUD limitado | Administración de cuentas, restringida por rol y métodos permitidos. |

## Rutas, flota y despacho

| Recurso o acción | Rutas principales |
|---|---|
| Catálogos de rutas | `/ciudades/`, `/tipos-servicio/`, `/rutas/`, `/paradas/`, `/tarifas/`, `/horarios/` |
| Flota | `/configuraciones-asientos/`, `/vehiculos/`, `/tipos-documento-vehicular/`, `/documentos-vehiculares/`, `/mantenimientos/` |
| Conductores | `/conductores/`, `/licencias/`, `/turnos/` |
| Viajes | `/viajes/`, `/viajes/{id}/`, `/viajes/generar/`, `/viajes/{id}/vehiculo/`, `/viajes/{id}/conductor/`, `/viajes/{id}/quitar-conductor/`, `/viajes/{id}/estado/`, `/viajes/{id}/historial/` |
| Incidencias y alertas | `/incidencias/`, `/alertas/` |

Los viajes usan acciones validadas por reglas de negocio; no se deben cambiar estados con una edición directa genérica.

## Reservas, boletos y pasajeros

| Método | Ruta | Uso |
|---|---|---|
| GET | `/trips/{trip_id}/seats/` | Consultar asientos disponibles. |
| POST | `/reservations/` | Crear reserva y retener los asientos. |
| GET | `/reservations/my/` | Listar reservas del cliente autenticado. |
| GET | `/reservations/management/` | Listar reservas para personal autorizado. |
| POST | `/reservations/{reservation_id}/pay/` | Confirmar pago de demostración o dejar pago en efectivo pendiente. |
| POST | `/tickets/validate/` | Validar un QR pagado para embarque. |
| GET | `/passengers/management/` | Consultar pasajeros; personal autorizado. |

Yape/Visa no llaman a una pasarela: el estado confirmado y el QR son parte de la simulación académica.

## Caja, liquidaciones y reportes

| Método | Ruta | Uso |
|---|---|---|
| GET | `/cash/summary/` | Consultar caja abierta y totales. |
| POST | `/cash/register/open/` | Abrir caja del usuario. |
| POST | `/cash/register/close/` | Cerrar caja e informar diferencia. |
| GET, POST | `/cash/movements/` | Consultar o registrar movimientos manuales. |
| GET | `/trip-settlements/` | Consultar liquidaciones de viajes finalizados. |
| POST | `/trip-settlements/{trip_id}/expenses/` | Registrar gasto de viaje finalizado. |
| POST | `/trip-settlements/{trip_id}/close/` | Cerrar liquidación. |
| GET | `/reportes/estadisticas/` | Resumen para administradores. |
| GET | `/auditoria/` | Consultar bitácora; solo administrador. |

## Salud y asistentes

| Método | Ruta | Uso |
|---|---|---|
| GET | `/health/` | Salud del backend. |
| GET | `/assistant/destinations/` | Destinos públicos. |
| POST | `/assistant/chat/` | Asistente; requiere configuración de proveedor para respuestas externas. |

En las rutas marcadas como recurso, los métodos permitidos dependen del rol y del `ViewSet`; un `DELETE` no está habilitado para borrar registros de negocio.

`/ciudades/` acepta y devuelve `nombre`, `provincia`, `departamento`, `observaciones` (agencia o referencia local) y `activa`.
