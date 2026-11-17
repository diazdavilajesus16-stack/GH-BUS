import { Router, type Request } from 'express';
import type { Server } from 'socket.io';
import type { Env } from '../config/env';
import { verifySignature } from '../security/hmac';
import { eventSchema, roomsFor } from './schema';

type RawBodyRequest = Request & { rawBody?: Buffer };

/**
 * Canal interno Django -> Node. Cada mensaje debe venir firmado (HMAC) y reciente.
 * En producción este prefijo (/internal) no debe exponerse fuera de la red de Docker.
 */
export function createInternalRouter(io: Server, env: Env): Router {
  const router = Router();

  router.post('/events', (req: RawBodyRequest, res) => {
    const ok = verifySignature({
      secret: env.REALTIME_HMAC_SECRET,
      timestamp: req.header('x-ghbus-timestamp'),
      signature: req.header('x-ghbus-signature'),
      rawBody: req.rawBody,
      toleranceSeconds: env.EVENT_TOLERANCE_SECONDS,
    });
    if (!ok) {
      res.status(401).json({ error: 'firma inválida' });
      return;
    }

    const parsed = eventSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'evento inválido' });
      return;
    }

    const evento = parsed.data;
    io.to(roomsFor(evento)).emit(evento.event, evento.data);
    res.status(202).json({ delivered: true });
  });

  return router;
}
