import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import type { Env } from '../config/env';
import { verifyAccessToken, type AuthUser } from '../security/jwt';

/** Nombres de rol del personal. Los roles reales y el claim "roles" del JWT se definen en el paso 9. */
export const STAFF_ROLES = ['administrador', 'despachador', 'cajero', 'conductor'];

const MAX_TRIP_ROOMS_PER_SOCKET = 20;
const joinSchema = z.object({ trip_id: z.number().int().positive() });

type Ack = (r: { ok: boolean; error?: string }) => void;
const callAck = (ack: unknown, r: { ok: boolean; error?: string }) => {
  if (typeof ack === 'function') (ack as Ack)(r);
};

export function setupSockets(io: Server, env: Env): void {
  // Autenticación opcional: sin token = visitante (solo datos públicos de asientos).
  // Token presente pero inválido = conexión rechazada.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (token === undefined || token === null || token === '') {
      socket.data.user = null;
      return next();
    }
    try {
      socket.data.user = verifyAccessToken(String(token), env.JWT_SIGNING_KEY);
      return next();
    } catch {
      return next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as AuthUser | null;

    if (user) {
      socket.join(`user:${user.id}`);
      // El token solo vale hasta su expiración: se corta la conexión y el cliente
      // debe reconectarse con un token renovado.
      const ms = Math.max(0, user.exp * 1000 - Date.now());
      const timer = setTimeout(() => socket.disconnect(true), ms);
      timer.unref();
      socket.on('disconnect', () => clearTimeout(timer));
    }

    socket.on('trip:join', (payload: unknown, ack?: unknown) => {
      const parsed = joinSchema.safeParse(payload);
      if (!parsed.success) return callAck(ack, { ok: false, error: 'invalid' });
      const tripRooms = [...socket.rooms].filter((r) => r.startsWith('trip:')).length;
      if (tripRooms >= MAX_TRIP_ROOMS_PER_SOCKET) return callAck(ack, { ok: false, error: 'limit' });
      socket.join(`trip:${parsed.data.trip_id}`);
      callAck(ack, { ok: true });
    });

    socket.on('trip:leave', (payload: unknown, ack?: unknown) => {
      const parsed = joinSchema.safeParse(payload);
      if (!parsed.success) return callAck(ack, { ok: false, error: 'invalid' });
      socket.leave(`trip:${parsed.data.trip_id}`);
      callAck(ack, { ok: true });
    });

    socket.on('staff:join', (_payload: unknown, ack?: unknown) => {
      const permitido = user !== null && user.roles.some((r) => STAFF_ROLES.includes(r));
      if (!permitido) return callAck(ack, { ok: false, error: 'forbidden' });
      socket.join('staff');
      callAck(ack, { ok: true });
    });
  });
}
