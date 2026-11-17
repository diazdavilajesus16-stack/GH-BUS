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

## Flujo de ramas
`main` (estable) <- `develop` (integración) <- `feature/*`

## Seguridad
No subir `.env`, contraseñas, tokens ni credenciales. Usar `.env.example` como plantilla.
