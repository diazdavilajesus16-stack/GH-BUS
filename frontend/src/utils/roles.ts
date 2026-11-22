import { ROLES, STAFF_ROLES, type AuthUser, type Role } from '@/types/auth'

/** Filtra un valor desconocido (claim del token) y deja solo roles válidos. */
export function toRoles(value: unknown): Role[] {
  if (!Array.isArray(value)) return []
  return value.filter((r): r is Role => typeof r === 'string' && (ROLES as readonly string[]).includes(r))
}

/** Sin roles requeridos = basta con estar autenticado. */
export function hasAnyRole(user: AuthUser | null, required?: readonly Role[]): boolean {
  if (!user) return false
  if (!required || required.length === 0) return true
  return user.roles.some((r) => required.includes(r))
}

/** Pantalla de inicio según el rol: el personal va al panel; el cliente, a su cuenta. */
export function homePathFor(user: AuthUser): string {
  return user.roles.some((r) => STAFF_ROLES.includes(r)) ? '/panel' : '/mi-cuenta'
}
