import 'dotenv/config';
import { loadEnv } from './config/env';
import { createApp } from './app';

const env = loadEnv();
const { httpServer, io } = createApp(env);

httpServer.listen(env.PORT, () => {
  console.log(`[realtime] escuchando en el puerto ${env.PORT}`);
});

function shutdown(signal: string) {
  console.log(`[realtime] ${signal} recibido, cerrando...`);
  io.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
