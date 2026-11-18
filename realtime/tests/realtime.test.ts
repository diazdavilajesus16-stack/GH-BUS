import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import { io as connect, type Socket } from 'socket.io-client';
import { createApp } from '../src/app';
import { loadEnv } from '../src/config/env';
import { signPayload } from '../src/security/hmac';

const JWT_KEY = 'k'.repeat(40);
const HMAC_KEY = 'h'.repeat(40);

const env = loadEnv({ NODE_ENV: 'test', PORT: '0', JWT_SIGNING_KEY: JWT_KEY, REALTIME_HMAC_SECRET: HMAC_KEY });
const { httpServer, io } = createApp(env);
let base = '';
const sockets: Socket[] = [];

const token = (extra: Record<string, unknown> = {}, key = JWT_KEY) =>
  jwt.sign({ token_type: 'access', user_id: 7, ...extra }, key, { algorithm: 'HS256', expiresIn: 60 });

function cliente(authToken?: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = connect(base, { auth: authToken ? { token: authToken } : {}, transports: ['websocket'], forceNew: true });
    sockets.push(s);
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

const emitAck = (s: Socket, ev: string, payload?: unknown): Promise<{ ok: boolean; error?: string }> =>
  new Promise((resolve) => s.emit(ev, payload, resolve));

const una = <T>(s: Socket, ev: string, ms = 2000): Promise<T> =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`no llegó ${ev}`)), ms);
    s.once(ev, (d: T) => {
      clearTimeout(t);
      resolve(d);
    });
  });

function publicar(body: unknown, opts: { secret?: string; ts?: string; sig?: string } = {}) {
  const raw = JSON.stringify(body);
  const ts = opts.ts ?? String(Math.floor(Date.now() / 1000));
  const sig = opts.sig ?? signPayload(opts.secret ?? HMAC_KEY, ts, raw);
  return fetch(`${base}/internal/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ghbus-timestamp': ts, 'x-ghbus-signature': sig },
    body: raw,
  });
}

before(async () => {
  await new Promise<void>((r) => httpServer.listen(0, r));
  base = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});

after(async () => {
  sockets.forEach((s) => s.close());
  await new Promise<void>((r) => io.close(() => r()));
});

describe('firma HMAC', () => {
  it('coincide con el vector de prueba compartido con Django', () => {
    assert.equal(
      signPayload('secreto-de-prueba', '1700000000', '{"a":1}'),
      'a98721d9303971fa0256de8a6f2d9ccc417ccd185bb1591543447256aee3fc6a',
    );
  });
});

describe('canal interno Django -> Node', () => {
  const evento = { event: 'seat.updated', data: { trip_id: 5, seat_number: 12, status: 'sold' } };

  it('reenvía un evento firmado a los visitantes de ese viaje', async () => {
    const s = await cliente();
    assert.deepEqual(await emitAck(s, 'trip:join', { trip_id: 5 }), { ok: true });
    const recibido = una<unknown>(s, 'seat.updated');
    const resp = await publicar(evento);
    assert.equal(resp.status, 202);
    assert.deepEqual(await recibido, evento.data);
  });

  it('no entrega el evento a quien está en otro viaje', async () => {
    const s = await cliente();
    await emitAck(s, 'trip:join', { trip_id: 99 });
    let llego = false;
    s.on('seat.updated', () => (llego = true));
    await publicar(evento);
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(llego, false);
  });

  it('rechaza firma incorrecta (401)', async () => {
    assert.equal((await publicar(evento, { secret: 'x'.repeat(40) })).status, 401);
  });

  it('rechaza mensajes antiguos (401)', async () => {
    const viejo = String(Math.floor(Date.now() / 1000) - 3600);
    assert.equal((await publicar(evento, { ts: viejo })).status, 401);
  });

  it('rechaza peticiones sin firma (401)', async () => {
    const r = await fetch(`${base}/internal/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(evento),
    });
    assert.equal(r.status, 401);
  });

  it('rechaza eventos con forma inválida (400)', async () => {
    assert.equal((await publicar({ event: 'seat.updated', data: { trip_id: -1 } })).status, 400);
    assert.equal((await publicar({ event: 'desconocido', data: {} })).status, 400);
  });
});

describe('autenticación de sockets', () => {
  it('rechaza un token inválido', async () => {
    await assert.rejects(cliente(token({}, 'z'.repeat(40))));
  });

  it('rechaza un refresh token usado como acceso', async () => {
    await assert.rejects(cliente(token({ token_type: 'refresh' })));
  });

  it('un visitante no puede entrar a la sala del personal', async () => {
    const s = await cliente();
    assert.deepEqual(await emitAck(s, 'staff:join'), { ok: false, error: 'forbidden' });
  });

  it('un usuario autenticado sin rol de personal tampoco', async () => {
    const s = await cliente(token());
    assert.deepEqual(await emitAck(s, 'staff:join'), { ok: false, error: 'forbidden' });
  });

  it('el personal recibe notificaciones y el usuario sus mensajes privados', async () => {
    const personal = await cliente(token({ roles: ['despachador'] }));
    assert.deepEqual(await emitAck(personal, 'staff:join'), { ok: true });
    const aviso = una<{ title: string }>(personal, 'notification.created');
    await publicar({ event: 'notification.created', data: { audience: 'staff', title: 'Viaje retrasado', message: 'Bus 3' } });
    assert.equal((await aviso).title, 'Viaje retrasado');

    const privado = una<{ title: string }>(personal, 'notification.created');
    await publicar({ event: 'notification.created', data: { user_id: 7, title: 'Hola', message: 'privado' } });
    assert.equal((await privado).title, 'Hola');
  });
});
