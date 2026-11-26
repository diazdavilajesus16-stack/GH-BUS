/**
 * Estado de la sesión en el navegador.
 * - Token de acceso: solo en memoria (no queda en el disco del navegador).
 * - Token de refresco: NO lo ve JavaScript; viaja en una cookie httpOnly que gestiona el servidor.
 * - Marca `ghbus.session`: solo indica «hubo una sesión» para no pedir renovación a los visitantes
 *   anónimos. No contiene ningún secreto.
 */
const SESSION_FLAG = 'ghbus.session'

let accessToken: string | null = null

export const getAccessToken = (): string | null => accessToken
export const setAccessToken = (token: string | null): void => {
  accessToken = token
}

export function hasSessionFlag(): boolean {
  try {
    return localStorage.getItem(SESSION_FLAG) === '1'
  } catch {
    return false
  }
}

export function setSessionFlag(active: boolean): void {
  try {
    if (active) localStorage.setItem(SESSION_FLAG, '1')
    else localStorage.removeItem(SESSION_FLAG)
  } catch {
    /* almacenamiento no disponible */
  }
}

export function clearTokens(): void {
  accessToken = null
  setSessionFlag(false)
}
