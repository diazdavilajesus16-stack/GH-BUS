# Arquitectura de GH BUS

## Componentes

| Servicio | Tecnología | Responsabilidad | Puerto (interno) |
|---|---|---|---|
| `web` | nginx + React/Vite/TypeScript/Tailwind | Interfaz y **única puerta pública**; reparte tráfico | 80 (publicado: 8080) |
| `backend` | Python + Django REST Framework | Toda la lógica de negocio, validaciones, transacciones, JWT, permisos, auditoría, reportes | 8000 |
| `realtime` | Node.js + Express + Socket.IO (TypeScript) | Solo tiempo real: reenvía eventos. **No decide nada** | 4000 |
| `db` | MySQL 8.4 | Única fuente de datos. Solo Django escribe | 3306 (solo `127.0.0.1`) |

```
Navegador ──HTTPS──> nginx ──/──────────> archivos de React
                       │ ──/api, /admin──> Django ──ORM──> MySQL
                       │ ──/socket.io────> Node.js
                       └ /internal ───────> 404 (bloqueado)

Django ──(evento firmado HMAC, red interna)──> Node.js ──WebSocket──> Navegadores
```

## Flujos principales

**Venta de un asiento.** El navegador pide a Django bloquear el asiento (§6.1 de `database.md`). Django valida, guarda y, **solo después de confirmar la transacción**, envía `seat.updated` a Node, que lo reenvía a todos los que miran ese viaje. El aviso solo refresca la pantalla: la disponibilidad real siempre la decide Django.

**Autenticación.** Login contra Django, que emite un JWT de acceso (15 min, en memoria del navegador, con el claim `roles`) y uno de refresco (1 día, de un solo uso, rotativo, con lista negra) que viaja solo en una cookie `httpOnly` `SameSite=Strict` limitada a `/api/auth/`. El navegador renueva el acceso solo. Node únicamente **verifica** los JWT con una clave compartida.

## Seguridad entre servicios

- Django → Node: cada mensaje lleva firma HMAC-SHA256 sobre `timestamp.cuerpo`; Node rechaza firmas falsas y mensajes de más de 5 minutos.
- El canal `/internal` no tiene puerto público y nginx lo bloquea.
- Los secretos (`DJANGO_SECRET_KEY`, `JWT_SIGNING_KEY`, `REALTIME_HMAC_SECRET`) viven solo en `.env`, distintos entre sí.
- Los permisos se verifican **siempre en el backend**; ocultar botones en React es solo comodidad.

## Reglas de integración

1. El frontend consume solo APIs. 2. Django centraliza la lógica. 3. Node solo hace tiempo real. 4. MySQL es la única fuente de datos. 5. Docker Compose levanta todo coordinado. 6. Toda comunicación entre servicios está autenticada.

Ver también: [`database.md`](database.md) (modelo de datos) y el [`README`](../README.md) (puesta en marcha).
