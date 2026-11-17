import { createHmac, timingSafeEqual } from 'node:crypto';

/** Firma HMAC-SHA256 de `${timestamp}.${cuerpo}` en hexadecimal. Debe coincidir con backend/api/realtime.py. */
export function signPayload(secret: string, timestamp: string, rawBody: Buffer | string): string {
  const h = createHmac('sha256', secret);
  h.update(`${timestamp}.`);
  h.update(rawBody);
  return h.digest('hex');
}

export interface VerifyParams {
  secret: string;
  timestamp: string | undefined;
  signature: string | undefined;
  rawBody: Buffer | undefined;
  toleranceSeconds: number;
  nowMs?: number;
}

/** Verifica firma y antigüedad del mensaje (evita falsificaciones y reenvíos antiguos). */
export function verifySignature(p: VerifyParams): boolean {
  if (!p.timestamp || !p.signature || !p.rawBody) return false;
  if (!/^\d{1,12}$/.test(p.timestamp)) return false;

  const nowSeconds = Math.floor((p.nowMs ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - Number(p.timestamp)) > p.toleranceSeconds) return false;

  const expected = Buffer.from(signPayload(p.secret, p.timestamp, p.rawBody), 'hex');
  let received: Buffer;
  try {
    received = Buffer.from(p.signature, 'hex');
  } catch {
    return false;
  }
  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}
