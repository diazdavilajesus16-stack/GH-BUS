import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { login as apiLogin, logout as apiLogout, refreshAccessToken } from '@/services/authService'
import { SESSION_EXPIRED_EVENT } from '@/services/http'
import { resetSocket } from '@/services/socket'
import { clearTokens, getRefreshToken } from '@/services/tokenStore'
import type { AuthStatus, AuthUser } from '@/types/auth'
import { decodeJwt } from '@/utils/jwt'
import { toRoles } from '@/utils/roles'
import { AuthContext, type AuthContextValue } from './authContextValue'

function userFromToken(token: string): AuthUser {
  const claims = decodeJwt(token)
  if (!claims) throw new Error('Token inválido')
  return { id: String(claims.user_id), roles: toRoles(claims.roles) }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')

  // Al abrir la aplicación: si hay token de refresco, intenta restaurar la sesión.
  useEffect(() => {
    let cancelled = false
    async function restore() {
      if (!getRefreshToken()) {
        setStatus('anonymous')
        return
      }
      try {
        const token = await refreshAccessToken()
        if (cancelled) return
        setUser(userFromToken(token))
        setStatus('authenticated')
      } catch {
        clearTokens()
        if (!cancelled) setStatus('anonymous')
      }
    }
    void restore()
    return () => {
      cancelled = true
    }
  }, [])

  // Sesión vencida detectada por la capa HTTP o por el socket.
  useEffect(() => {
    const onExpired = () => {
      setUser(null)
      setStatus('anonymous')
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const token = await apiLogin(username, password)
    setUser(userFromToken(token))
    setStatus('authenticated')
    resetSocket()
  }, [])

  const logout = useCallback(() => {
    apiLogout()
    setUser(null)
    setStatus('anonymous')
    resetSocket()
  }, [])

  const value = useMemo<AuthContextValue>(() => ({ user, status, login, logout }), [user, status, login, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
