/**
 * Almacén de tokens.
 * - Token de acceso: solo en memoria (no queda en el disco del navegador).
 * - Token de refresco: sessionStorage (se borra al cerrar la pestaña).
 *
 * Esto es provisional: en el paso 9 el refresco pasará a una cookie httpOnly,
 * que JavaScript no puede leer (más seguro frente a XSS).
 */
const REFRESH_KEY = 'ghbus.refresh'

let accessToken: string | null = null

export const getAccessToken = (): string | null => accessToken
export const setAccessToken = (token: string | null): void => {
  accessToken = token
}

export function getRefreshToken(): string | null {
  try {
    return sessionStorage.getItem(REFRESH_KEY)
  } catch {
    return null
  }
}

export function setRefreshToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(REFRESH_KEY, token)
    else sessionStorage.removeItem(REFRESH_KEY)
  } catch {
    /* almacenamiento no disponible */
  }
}

export function clearTokens(): void {
  accessToken = null
  setRefreshToken(null)
}
