import { describe, expect, it } from 'vitest'
import { claveSchema, telefonoSchema, usernameSchema } from './validation'

describe('validaciones de formulario', () => {
  it('clave: mínimo 8 y no solo números', () => {
    expect(claveSchema.safeParse('corta1').success).toBe(false)
    expect(claveSchema.safeParse('12345678').success).toBe(false)
    expect(claveSchema.safeParse('Clave-Segura-1').success).toBe(true)
  })
  it('usuario: se normaliza a minúsculas y rechaza espacios', () => {
    expect(usernameSchema.parse(' Maria ')).toBe('maria')
    expect(usernameSchema.safeParse('a b c').success).toBe(false)
  })
  it('teléfono: opcional pero válido', () => {
    expect(telefonoSchema.safeParse('').success).toBe(true)
    expect(telefonoSchema.safeParse('+51 999 888 777').success).toBe(true)
    expect(telefonoSchema.safeParse('abc').success).toBe(false)
  })
})
