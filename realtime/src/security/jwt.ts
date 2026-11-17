import jwt from 'jsonwebtoken';

export interface AuthUser {
  id: string;
  roles: string[];
  /** Expiración del token (segundos desde epoch). */
  exp: number;
}

/** Valida un token de acceso emitido por Django (SimpleJWT, HS256). Lanza error si no es válido. */
export function verifyAccessToken(token: string, signingKey: string): AuthUser {
  const payload = jwt.verify(token, signingKey, { algorithms: ['HS256'] });
  if (typeof payload === 'string') throw new Error('Token inválido');
  if (payload.token_type !== 'access') throw new Error('Tipo de token inválido');
  if (payload.user_id === undefined || payload.user_id === null) throw new Error('Token sin usuario');
  if (typeof payload.exp !== 'number') throw new Error('Token sin expiración');

  const roles = Array.isArray(payload.roles)
    ? payload.roles.filter((r: unknown): r is string => typeof r === 'string')
    : [];
  return { id: String(payload.user_id), roles, exp: payload.exp };
}
