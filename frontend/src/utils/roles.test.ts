import { describe, expect, it } from 'vitest'
import type { AuthUser } from '@/types/auth'
import { hasAnyRole, homePathFor, toRoles } from './roles'

const usuario = (...roles: AuthUser['roles']): AuthUser => ({ id: 1, username: 'u', email: 'u@e.pe', first_name: '', last_name: '', telefono: '', roles })

describe('toRoles', () => {
  it('descarta valores que no son roles válidos', () => {
    expect(toRoles(['cajero', 'hacker', 5, 'administrador'])).toEqual(['cajero', 'administrador'])
    expect(toRoles(undefined)).toEqual([])
    expect(toRoles('cajero')).toEqual([])
  })
})

describe('hasAnyRole', () => {
  it('exige autenticación', () => {
    expect(hasAnyRole(null)).toBe(false)
  })

  it('sin roles requeridos basta con estar autenticado', () => {
    expect(hasAnyRole(usuario())).toBe(true)
  })

  it('compara contra los roles requeridos', () => {
    expect(hasAnyRole(usuario('cajero'), ['administrador', 'cajero'])).toBe(true)
    expect(hasAnyRole(usuario('conductor'), ['administrador'])).toBe(false)
    expect(hasAnyRole(usuario(), ['administrador'])).toBe(false)
  })
})

describe('homePathFor', () => {
  it('personal al panel, cliente (o sin rol) a su cuenta', () => {
    expect(homePathFor(usuario('cajero'))).toBe('/panel')
    expect(homePathFor(usuario('cliente', 'despachador'))).toBe('/panel')
    expect(homePathFor(usuario('cliente'))).toBe('/mi-cuenta')
    expect(homePathFor(usuario())).toBe('/mi-cuenta')
  })
})
