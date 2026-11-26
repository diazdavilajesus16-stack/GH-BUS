import { createContext } from 'react'
import type { RegistroDatos } from '@/services/authService'
import type { AuthStatus, AuthUser } from '@/types/auth'

export interface AuthContextValue {
  user: AuthUser | null
  status: AuthStatus
  login: (username: string, password: string) => Promise<AuthUser>
  register: (datos: RegistroDatos) => Promise<AuthUser>
  logout: () => Promise<void>
  /** Actualiza el usuario en memoria (p. ej. tras editar el perfil). */
  setUser: (user: AuthUser) => void
  /** Pasa a «anónimo» sin llamar al servidor (p. ej. tras cambiar la contraseña, que cierra todas las sesiones). */
  endSession: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
