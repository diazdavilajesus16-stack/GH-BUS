import { describe, expect, it } from 'vitest'
import { ROLES, type AuthUser, type Role } from '@/types/auth'
import { hasAnyRole, homePathFor } from '@/utils/roles'
import { NAV_MODULES, visibleModules } from './navigation'

const usuario = (...roles: AuthUser['roles']): AuthUser => ({ id: 1, username: 'u', email: 'u@e.pe', first_name: '', last_name: '', telefono: '', roles })
const rutasVisibles = (u: AuthUser | null) => visibleModules(u).flatMap((m) => m.items.map((i) => i.path))
const todas = NAV_MODULES.flatMap((m) => m.items)
const rutasPorRol: Record<Role, string[]> = {
  administrador: todas.map((item) => item.path),
  despachador: [
    '/panel/operacion/horarios',
    '/panel/operacion/vehiculos',
    '/panel/operacion/conductores',
    '/panel/operacion/programacion',
    '/panel/operacion/despacho',
    '/panel/operacion/seguimiento',
    '/panel/comercial/embarque',
  ],
  cajero: [
    '/panel/comercial/reservas',
    '/panel/comercial/venta',
    '/panel/comercial/mapa-asientos',
    '/panel/comercial/pasajeros',
    '/panel/financiero/caja',
  ],
  conductor: ['/panel/operacion/seguimiento', '/panel/comercial/embarque'],
  cliente: [],
}

describe('menú por rol', () => {
  it('no hay pantallas duplicadas ni sin roles', () => {
    expect(new Set(todas.map((i) => i.path)).size).toBe(todas.length)
    expect(todas.every((i) => i.roles.length > 0)).toBe(true)
  })

  it('sin sesión o sin rol no se muestra nada', () => {
    expect(visibleModules(null)).toEqual([])
    expect(visibleModules(usuario())).toEqual([])
  })

  it('el administrador ve todas las pantallas', () => {
    expect(rutasVisibles(usuario('administrador'))).toHaveLength(todas.length)
  })

  it('el cajero ve ventas pero no usuarios ni liquidaciones', () => {
    const rutas = rutasVisibles(usuario('cajero'))
    expect(rutas).toContain('/panel/comercial/venta')
    expect(rutas).not.toContain('/panel/seguridad/usuarios')
    expect(rutas).not.toContain('/panel/financiero/liquidacion')
  })

  it('el conductor ve el seguimiento y el control de embarque', () => {
    expect(rutasVisibles(usuario('conductor'))).toEqual([
      '/panel/operacion/seguimiento',
      '/panel/comercial/embarque',
    ])
  })

  it('el menú y el control de rutas respetan exactamente los permisos descritos por rol', () => {
    for (const rol of ROLES) {
      const user = usuario(rol)
      const rutasPermitidas = rutasPorRol[rol]
      expect(rutasVisibles(user).sort()).toEqual([...rutasPermitidas].sort())
      for (const item of todas) {
        expect(hasAnyRole(user, item.roles)).toBe(rutasPermitidas.includes(item.path))
      }
    }
  })

  it('envía al cliente a Mi cuenta y al personal al panel', () => {
    expect(homePathFor(usuario('cliente'))).toBe('/mi-cuenta')
    for (const rol of ROLES.filter((item) => item !== 'cliente')) {
      expect(homePathFor(usuario(rol))).toBe('/panel')
    }
  })
})
