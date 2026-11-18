import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(4000),
  // Misma clave con la que Django firma los JWT (SIMPLE_JWT.SIGNING_KEY).
  JWT_SIGNING_KEY: z.string().min(32, 'JWT_SIGNING_KEY debe tener al menos 32 caracteres'),
  // Secreto compartido con Django para firmar los eventos internos (HMAC-SHA256).
  REALTIME_HMAC_SECRET: z.string().min(32, 'REALTIME_HMAC_SECRET debe tener al menos 32 caracteres'),
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((s) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  EVENT_TOLERANCE_SECONDS: z.coerce.number().int().positive().default(300),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const detalle = parsed.error.issues.map((i) => `- ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuración inválida del servicio realtime:\n${detalle}`);
  }
  return parsed.data;
}
