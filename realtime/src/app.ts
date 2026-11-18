import http from 'node:http';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { Server } from 'socket.io';
import type { Env } from './config/env';
import { createInternalRouter } from './events/internalRouter';
import { setupSockets } from './sockets';

export function createApp(env: Env) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: env.CORS_ALLOWED_ORIGINS, methods: ['GET', 'POST'] },
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'realtime' });
  });

  // Se conserva el cuerpo crudo: la firma HMAC se calcula sobre los bytes exactos recibidos.
  app.use(
    '/internal',
    express.json({
      limit: '16kb',
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
    createInternalRouter(io, env),
  );

  setupSockets(io, env);

  // Manejo de errores (JSON mal formado, cuerpo demasiado grande, etc.)
  app.use((err: { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    const status = typeof err.status === 'number' && err.status >= 400 && err.status < 500 ? err.status : 500;
    res.status(status).json({ error: status === 500 ? 'error interno' : 'solicitud inválida' });
  });

  return { app, httpServer, io };
}
