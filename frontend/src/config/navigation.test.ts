import { describe, expect, it } from 'vitest'
import type { AuthUser } from '@/types/auth'
import { NAV_MODULES, visibleModules } from './navigation'

const usuario = (...roles: AuthUser['roles']): AuthUser => ({ id: 1, username: 'u', email: 'u@e.pe', first_name: '', last_name: '', telefono: '', roles })
const rutasVisibles = (u: AuthUser | null) => visibleModules(u).flatMap((m) => m.items.map((i) => i.path))
const todas = NAV_MODULES.flatMap((m) => m.items)

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

  it('el conductor solo ve el seguimiento de viajes', () => {
    expect(rutasVisibles(usuario('conductor'))).toEqual(['/panel/operacion/seguimiento'])
  })
})
