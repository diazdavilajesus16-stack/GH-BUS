import axios, { type InternalAxiosRequestConfig } from 'axios'
import { env } from '@/config/env'
import { refreshAccessToken } from './authService'
import { clearTokens, getAccessToken, getRefreshToken } from './tokenStore'

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
      if (error.response?.status === 401 && original && !original._retry && getRefreshToken()) {
        original._retry = true
        try {
          const token = await refreshAccessToken()
          original.headers.Authorization = `Bearer ${token}`
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
