import { createContext } from 'react'
import type { AuthStatus, AuthUser } from '@/types/auth'

export interface AuthContextValue {
  user: AuthUser | null
  status: AuthStatus
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)
