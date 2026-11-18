/** Perfiles definidos en la especificación. Deben coincidir con los roles del backend (paso 9). */
export const ROLES = ['administrador', 'despachador', 'cajero', 'conductor', 'cliente'] as const

export type Role = (typeof ROLES)[number]

export interface AuthUser {
  id: string
  roles: Role[]
}

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'
