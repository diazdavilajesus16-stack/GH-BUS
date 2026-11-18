import { describe, expect, it } from 'vitest'
import type { AuthUser } from '@/types/auth'
import { hasAnyRole, toRoles } from './roles'

const usuario = (...roles: AuthUser['roles']): AuthUser => ({ id: '1', roles })

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
