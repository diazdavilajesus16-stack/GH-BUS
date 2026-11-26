/** Perfiles definidos en la especificación. Coinciden con los grupos creados por el backend. */
export const ROLES = ['administrador', 'despachador', 'cajero', 'conductor', 'cliente'] as const

export type Role = (typeof ROLES)[number]

/** Roles que usan el panel interno. El cliente solo ve «Mi cuenta». */
export const STAFF_ROLES: readonly Role[] = ['administrador', 'despachador', 'cajero', 'conductor']

export interface AuthUser {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  telefono: string
  roles: Role[]
}

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'
