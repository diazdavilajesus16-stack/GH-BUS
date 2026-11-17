import { z } from 'zod';

const id = z.number().int().positive();

/**
 * Eventos que Django puede publicar. Node NO decide nada: solo valida la forma
 * del mensaje y lo reenvía a las salas correspondientes. Los campos no declarados
 * se descartan (no se filtran datos personales por error).
 */
export const eventSchema = z.discriminatedUnion('event', [
  z.object({
    event: z.literal('seat.updated'),
    data: z.object({
      trip_id: id,
      seat_number: z.number().int().positive(),
      status: z.enum(['available', 'held', 'sold']),
    }),
  }),
  z.object({
    event: z.literal('trip.status_changed'),
    data: z.object({ trip_id: id, status: z.string().min(1).max(30) }),
  }),
  z.object({
    event: z.literal('unit.location_updated'),
    data: z.object({
      trip_id: id,
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      recorded_at: z.string().max(40).optional(),
    }),
  }),
  z.object({
    event: z.literal('notification.created'),
    data: z
      .object({
        user_id: id.optional(),
        audience: z.literal('staff').optional(),
        title: z.string().min(1).max(200),
        message: z.string().max(1000),
      })
      .refine((d) => d.user_id !== undefined || d.audience !== undefined, {
        message: 'Se requiere user_id o audience',
      }),
  }),
]);

export type RealtimeEvent = z.infer<typeof eventSchema>;

/** Salas destinatarias de cada evento. */
export function roomsFor(e: RealtimeEvent): string[] {
  switch (e.event) {
    case 'seat.updated':
      return [`trip:${e.data.trip_id}`];
    case 'trip.status_changed':
    case 'unit.location_updated':
      return [`trip:${e.data.trip_id}`, 'staff'];
    case 'notification.created':
      return e.data.user_id !== undefined ? [`user:${e.data.user_id}`] : ['staff'];
  }
}
