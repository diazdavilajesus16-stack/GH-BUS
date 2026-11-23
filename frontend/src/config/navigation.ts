import type { AuthUser, Role } from '@/types/auth'

export interface NavItem {
  label: string
  path: string
  /** Roles que ven y pueden abrir la pantalla. El backend vuelve a verificar cada permiso. */
  roles: readonly Role[]
}

export interface NavModule {
  id: string
  label: string
  items: NavItem[]
}

const ADMIN: Role = 'administrador'
const DESP: Role = 'despachador'
const CAJA: Role = 'cajero'
const COND: Role = 'conductor'

export const NAV_MODULES: NavModule[] = [
  {
    id: 'operacion',
    label: 'Operación y despacho',
    items: [
      { label: 'Rutas', path: '/panel/operacion/rutas', roles: [ADMIN] },
      { label: 'Horarios', path: '/panel/operacion/horarios', roles: [ADMIN, DESP] },
      { label: 'Vehículos', path: '/panel/operacion/vehiculos', roles: [ADMIN, DESP] },
      { label: 'Conductores', path: '/panel/operacion/conductores', roles: [ADMIN, DESP] },
      { label: 'Programación de viajes', path: '/panel/operacion/programacion', roles: [ADMIN, DESP] },
      { label: 'Despacho de unidades', path: '/panel/operacion/despacho', roles: [ADMIN, DESP] },
      { label: 'Seguimiento de viajes', path: '/panel/operacion/seguimiento', roles: [ADMIN, DESP, COND] },
    ],
  },
  {
    id: 'comercial',
    label: 'Comercial',
    items: [
      { label: 'Reservas', path: '/panel/comercial/reservas', roles: [ADMIN, CAJA] },
      { label: 'Venta de boletos', path: '/panel/comercial/venta', roles: [ADMIN, CAJA] },
      { label: 'Mapa de asientos', path: '/panel/comercial/mapa-asientos', roles: [ADMIN, CAJA] },
      { label: 'Pasajeros', path: '/panel/comercial/pasajeros', roles: [ADMIN, CAJA] },
      { label: 'Control de embarque', path: '/panel/comercial/embarque', roles: [ADMIN, DESP] },
    ],
  },
  {
    id: 'financiero',
    label: 'Financiero',
    items: [
      { label: 'Caja y movimientos', path: '/panel/financiero/caja', roles: [ADMIN, CAJA] },
      { label: 'Liquidación de viajes', path: '/panel/financiero/liquidacion', roles: [ADMIN] },
    ],
  },
  {
    id: 'seguridad',
    label: 'Seguridad y control',
    items: [
      { label: 'Reportes y estadísticas', path: '/panel/seguridad/reportes', roles: [ADMIN] },
      { label: 'Usuarios', path: '/panel/seguridad/usuarios', roles: [ADMIN] },
      { label: 'Roles y permisos', path: '/panel/seguridad/roles', roles: [ADMIN] },
      { label: 'Configuración general', path: '/panel/seguridad/configuracion', roles: [ADMIN] },
    ],
  },
]

/** Módulos con solo las pantallas que el usuario puede ver; omite los módulos vacíos. */
export function visibleModules(user: AuthUser | null): NavModule[] {
  if (!user) return []
  return NAV_MODULES.map((m) => ({
    ...m,
    items: m.items.filter((i) => i.roles.some((r) => user.roles.includes(r))),
  })).filter((m) => m.items.length > 0)
}
