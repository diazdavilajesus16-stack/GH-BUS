import axios, { type InternalAxiosRequestConfig } from 'axios'
import { env } from '@/config/env'
import { refreshSession } from './authService'
import { clearTokens, getAccessToken, hasSessionFlag } from './tokenStore'

export const SESSION_EXPIRED_EVENT = 'ghbus:session-expired'

/** Cliente HTTP para toda la API de Django. */
export const http = axios.create({ baseURL: env.apiUrl, timeout: 15000 })

http.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

http.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined
      if (error.response?.status === 401 && original && !original._retry && hasSessionFlag()) {
        original._retry = true
        try {
          const { access } = await refreshSession()
          original.headers.Authorization = `Bearer ${access}`
          return http(original)
        } catch {
          clearTokens()
          window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
        }
      }
    }
    return Promise.reject(error)
  },
)

/** Extrae un mensaje legible de un error de la API (DRF: {detail} o {campo: [mensajes]}). */
export function mensajeDeError(error: unknown, porDefecto = 'Ocurrió un error inesperado. Inténtalo nuevamente.'): string {
  if (!axios.isAxiosError(error)) return porDefecto
  if (!error.response) return 'No se pudo conectar con el servidor. Inténtalo nuevamente.'
  const data: unknown = error.response.data
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    if (typeof d.detail === 'string') return d.detail
    const partes = Object.values(d).flatMap((v) => (Array.isArray(v) ? v.map(String) : typeof v === 'string' ? [v] : []))
    if (partes.length) return partes.join(' ')
  }
  return porDefecto
}
