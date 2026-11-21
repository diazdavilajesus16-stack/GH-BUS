import { AxiosError } from 'axios'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { EstadoViaje } from './tripsApi'

// El módulo importa la configuración, que lee window.location; se simula sin añadir jsdom.
let ACCIONES_DESPACHO: typeof import('./tripsApi').ACCIONES_DESPACHO
let motivosDeError: typeof import('./tripsApi').motivosDeError
beforeAll(async () => {
  vi.stubGlobal('window', { location: { origin: 'http://localhost' } })
  ;({ ACCIONES_DESPACHO, motivosDeError } = await import('./tripsApi'))
})

describe('ACCIONES_DESPACHO', () => {
  it('los estados finales no tienen acciones', () => {
    expect(ACCIONES_DESPACHO.FINALIZADO).toEqual([])
    expect(ACCIONES_DESPACHO.CANCELADO).toEqual([])
  })
  it('retraso y cancelación piden motivo', () => {
    const todas = Object.values(ACCIONES_DESPACHO).flat()
    for (const a of todas.filter((x) => x.destino === 'CANCELADO' || x.destino === 'RETRASADO')) expect(a.pideMotivo).toBe(true)
  })
  it('seguir el flujo normal es posible desde PROGRAMADO hasta FINALIZADO', () => {
    let estado: EstadoViaje = 'PROGRAMADO'
    const visto: EstadoViaje[] = [estado]
    while (estado !== 'FINALIZADO') {
      const sig: { destino: EstadoViaje } | undefined = ACCIONES_DESPACHO[estado].find((a) => !a.peligrosa && a.destino !== 'RETRASADO')
      expect(sig).toBeDefined()
      estado = sig!.destino
      visto.push(estado)
    }
    expect(visto).toEqual(['PROGRAMADO', 'CONFIRMADO', 'EN_EMBARQUE', 'EN_RUTA', 'FINALIZADO'])
  })
})

describe('motivosDeError', () => {
  it('devuelve la lista de motivos del servidor', () => {
    const e = new AxiosError('x')
    e.response = { data: { detail: 'No', motivos: ['SOAT vencido', 'Sin licencia'] }, status: 400, statusText: '', headers: {}, config: {} as never }
    expect(motivosDeError(e)).toEqual(['SOAT vencido', 'Sin licencia'])
  })
  it('con otro error devuelve un único mensaje', () => {
    expect(motivosDeError(new Error('boom'))).toHaveLength(1)
  })
})
