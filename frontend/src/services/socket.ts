import { io, type Socket } from 'socket.io-client'
import { env } from '@/config/env'
import { refreshSession } from './authService'
import { SESSION_EXPIRED_EVENT } from './http'
import { clearTokens, getAccessToken } from './tokenStore'

let socket: Socket | null = null
let authRetries = 0
const MAX_AUTH_RETRIES = 2

/**
 * Conexión única a Socket.IO. Los visitantes se conectan sin token (solo ven
 * cambios públicos de asientos); con sesión iniciada se envía el token de acceso.
 */
export function getSocket(): Socket {
  if (socket) return socket

  const s = io(env.realtimeUrl, {
    autoConnect: false,
    transports: ['websocket'],
    // Función: en cada (re)conexión se toma el token vigente.
    auth: (cb) => cb({ token: getAccessToken() ?? '' }),
  })

  s.on('connect', () => {
    authRetries = 0
  })

  // El servidor corta la conexión cuando vence el token: reconectar con uno nuevo.
  s.on('disconnect', (reason) => {
    if (reason === 'io server disconnect') s.connect()
  })

  s.on('connect_error', async (err) => {
    if (err.message !== 'unauthorized' || authRetries >= MAX_AUTH_RETRIES) return
    authRetries += 1
    try {
      await refreshSession()
    } catch {
      clearTokens()
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
    }
    s.connect()
  })

  socket = s
  return s
}

/** Reconecta (si ya existe) para que el servidor reconozca el nuevo estado de sesión. */
export function resetSocket(): void {
  if (!socket) return
  socket.disconnect()
  socket.connect()
}
