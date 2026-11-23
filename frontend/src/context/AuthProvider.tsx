import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  login as apiLogin,
  logout as apiLogout,
  refreshSession,
  registrar as apiRegistrar,
  type RegistroDatos,
} from '@/services/authService'
import { SESSION_EXPIRED_EVENT } from '@/services/http'
import { resetSocket } from '@/services/socket'
import { clearTokens, hasSessionFlag } from '@/services/tokenStore'
import type { AuthStatus, AuthUser } from '@/types/auth'
import { AuthContext, type AuthContextValue } from './authContextValue'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')

  // Al abrir la aplicación: si hubo una sesión, intenta restaurarla con la cookie de refresco.
  useEffect(() => {
    let cancelled = false
    async function restore() {
      if (!hasSessionFlag()) {
        setStatus('anonymous')
        return
      }
      try {
        const { user: restored } = await refreshSession()
        if (cancelled) return
        setUser(restored)
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

  const start = useCallback((u: AuthUser) => {
    setUser(u)
    setStatus('authenticated')
    resetSocket()
    return u
  }, [])

  const login = useCallback(async (username: string, password: string) => start((await apiLogin(username, password)).user), [start])
  const register = useCallback(async (datos: RegistroDatos) => start((await apiRegistrar(datos)).user), [start])

  const endSession = useCallback(() => {
    clearTokens()
    setUser(null)
    setStatus('anonymous')
    resetSocket()
  }, [])

  const logout = useCallback(async () => {
    await apiLogout()
    endSession()
  }, [endSession])

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, register, logout, setUser, endSession }),
    [user, status, login, register, logout, endSession],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
