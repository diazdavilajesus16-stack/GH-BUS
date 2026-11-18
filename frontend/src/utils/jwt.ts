export interface TokenClaims {
  user_id: string | number
  exp: number
  token_type?: string
  roles?: unknown
}

/**
 * Lee los datos de un JWT SIN verificar su firma. Solo sirve para mostrar la interfaz
 * (nombre de rol, menú). La seguridad real la aplica siempre el backend.
 */
export function decodeJwt(token: string): TokenClaims | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const claims = JSON.parse(atob(padded)) as Partial<TokenClaims>
    if (claims.user_id === undefined || typeof claims.exp !== 'number') return null
    return claims as TokenClaims
  } catch {
    return null
  }
}

export function isExpired(claims: TokenClaims, skewSeconds = 0, nowMs = Date.now()): boolean {
  return claims.exp - skewSeconds <= Math.floor(nowMs / 1000)
}
