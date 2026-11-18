import { describe, expect, it } from 'vitest'

// env.ts lee window al importarse; en el entorno de pruebas (node) se simula.
const cargar = async () => {
  ;(globalThis as { window?: unknown }).window = { location: { origin: 'https://ghbus.example' } }
  return import('./env')
}

describe('resolveRealtimeUrl', () => {
  it('usa el valor de desarrollo si no hay variable', async () => {
    const { resolveRealtimeUrl } = await cargar()
    expect(resolveRealtimeUrl(undefined, 'https://ghbus.example')).toBe('http://localhost:4000')
  })

  it('usa el mismo origen cuando la variable está vacía (Docker)', async () => {
    const { resolveRealtimeUrl } = await cargar()
    expect(resolveRealtimeUrl('', 'https://ghbus.example')).toBe('https://ghbus.example')
  })

  it('respeta una URL explícita', async () => {
    const { resolveRealtimeUrl } = await cargar()
    expect(resolveRealtimeUrl('https://rt.ghbus.pe', 'https://ghbus.example')).toBe('https://rt.ghbus.pe')
  })
})
