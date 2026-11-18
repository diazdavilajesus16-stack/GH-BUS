/**
 * URL del servicio de tiempo real.
 * - Sin definir: valor de desarrollo (http://localhost:4000).
 * - Vacía (build de Docker): mismo origen que la página, detrás de nginx.
 */
export function resolveRealtimeUrl(raw: string | undefined, origin: string): string {
  if (raw === undefined) return 'http://localhost:4000'
  return raw === '' ? origin : raw
}

export const env = {
  apiUrl: (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000/api',
  realtimeUrl: resolveRealtimeUrl(import.meta.env.VITE_REALTIME_URL as string | undefined, window.location.origin),
}
