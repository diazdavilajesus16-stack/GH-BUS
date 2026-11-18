import axios from 'axios'
import { env } from '@/config/env'
import { clearTokens, getRefreshToken, setAccessToken, setRefreshToken } from './tokenStore'

// Cliente "limpio" (sin interceptores) para evitar bucles al renovar el token.
const bare = axios.create({ baseURL: env.apiUrl, timeout: 15000 })

interface TokenPair {
  access: string
  refresh: string
}

export async function login(username: string, password: string): Promise<string> {
  const { data } = await bare.post<TokenPair>('/auth/token/', { username, password })
  setAccessToken(data.access)
  setRefreshToken(data.refresh)
  return data.access
}

let refreshing: Promise<string> | null = null

/** Renueva el token de acceso. Si varias peticiones lo piden a la vez, comparten una sola llamada. */
export function refreshAccessToken(): Promise<string> {
  if (refreshing) return refreshing
  const refresh = getRefreshToken()
  if (!refresh) return Promise.reject(new Error('sin-refresh'))

  refreshing = bare
    .post<{ access: string; refresh?: string }>('/auth/token/refresh/', { refresh })
    .then(({ data }) => {
      setAccessToken(data.access)
      if (data.refresh) setRefreshToken(data.refresh)
      return data.access
    })
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

export function logout(): void {
  clearTokens()
}
