import axios from 'axios'
import { env } from '@/config/env'
import type { AuthUser } from '@/types/auth'
import { toRoles } from '@/utils/roles'
import { clearTokens, setAccessToken, setSessionFlag } from './tokenStore'

// Cliente "limpio" (sin interceptores) para evitar bucles al renovar el token.
// withCredentials: el navegador envía/recibe la cookie httpOnly del refresco.
const bare = axios.create({ baseURL: env.apiUrl, timeout: 15000, withCredentials: true })

interface SesionApi {
  access: string
  user: Omit<AuthUser, 'roles'> & { roles: unknown }
}

export interface Sesion {
  access: string
  user: AuthUser
}

function aSesion(data: SesionApi): Sesion {
  setAccessToken(data.access)
  setSessionFlag(true)
  return { access: data.access, user: { ...data.user, roles: toRoles(data.user.roles) } }
}

export interface RegistroDatos {
  username: string
  email: string
  password: string
  first_name: string
  last_name: string
  telefono?: string
}

export async function login(username: string, password: string): Promise<Sesion> {
  const { data } = await bare.post<SesionApi>('/auth/login/', { username, password })
  return aSesion(data)
}

export async function registrar(datos: RegistroDatos): Promise<Sesion> {
  const { data } = await bare.post<SesionApi>('/auth/register/', datos)
  return aSesion(data)
}

let refreshing: Promise<Sesion> | null = null

/** Renueva la sesión con la cookie. Si varias peticiones lo piden a la vez, comparten una sola llamada
 * (el refresco es de un solo uso: dos llamadas paralelas harían fallar a la segunda). */
export function refreshSession(): Promise<Sesion> {
  if (refreshing) return refreshing
  refreshing = bare
    .post<SesionApi>('/auth/refresh/')
    .then(({ data }) => aSesion(data))
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

export async function logout(): Promise<void> {
  try {
    await bare.post('/auth/logout/')
  } catch {
    /* si el servidor no responde igual cerramos la sesión local */
  }
  clearTokens()
}

export async function solicitarRecuperacion(email: string): Promise<void> {
  await bare.post('/auth/password/reset/', { email })
}

export async function restablecerClave(uid: string, token: string, new_password: string): Promise<void> {
  await bare.post('/auth/password/reset/confirm/', { uid, token, new_password })
}
