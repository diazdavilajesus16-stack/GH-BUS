import { describe, expect, it } from 'vitest'
import { buildSchema, diasTexto, erroresDeApi, formatDate, initialValues, type FieldDef } from './forms'

const campos: FieldDef[] = [
  { name: 'codigo', label: 'Código', type: 'text', required: true },
  { name: 'duracion', label: 'Duración', type: 'number', required: true },
  { name: 'km', label: 'Km', type: 'number' },
  { name: 'ciudad', label: 'Ciudad', type: 'select', required: true, numeric: true, options: [{ value: '3', label: 'X' }] },
  { name: 'hasta', label: 'Hasta', type: 'date' },
  { name: 'salida', label: 'Salida', type: 'time', required: true },
  { name: 'activa', label: 'Activa', type: 'checkbox' },
  { name: 'dias', label: 'Días', type: 'weekdays' },
  { name: 'clave', label: 'Solo al crear', type: 'text', createOnly: true },
]

const valido = {
  codigo: ' abc ', duracion: '180', km: '', ciudad: '3', hasta: '', salida: '08:30:00',
  activa: true, dias: 5, clave: 'x',
}

describe('buildSchema', () => {
  it('transforma los textos del formulario al formato de la API', () => {
    expect(buildSchema(campos, false).parse(valido)).toEqual({
      codigo: 'abc', duracion: 180, km: null, ciudad: 3, hasta: null, salida: '08:30', activa: true, dias: 5, clave: 'x',
    })
  })

  it('rechaza vacíos obligatorios, números negativos o no numéricos y días en cero', () => {
    const r = buildSchema(campos, false).safeParse({ ...valido, codigo: ' ', duracion: 'abc', ciudad: '', salida: '', dias: 0 })
    expect(r.success).toBe(false)
    const claves = r.success ? [] : r.error.issues.map((i) => i.path[0])
    expect(claves).toEqual(expect.arrayContaining(['codigo', 'duracion', 'ciudad', 'salida', 'dias']))
    expect(buildSchema(campos, false).safeParse({ ...valido, duracion: '-5' }).success).toBe(false)
  })

  it('al editar omite los campos «solo al crear»', () => {
    const { clave: _c, ...sinClave } = valido
    const r = buildSchema(campos, true).parse(sinClave)
    expect('clave' in r).toBe(false)
  })

  it('valida los pisos (asientos por fila 2 a 5, máximo 2 pisos)', () => {
    const s = buildSchema([{ name: 'pisos', label: 'Pisos', type: 'pisos' }], false)
    expect(s.safeParse({ pisos: [{ filas: 10, asientos_por_fila: 4 }] }).success).toBe(true)
    expect(s.safeParse({ pisos: [{ filas: 10, asientos_por_fila: 9 }] }).success).toBe(false)
    expect(s.safeParse({ pisos: [] }).success).toBe(false)
    expect(s.safeParse({ pisos: Array(3).fill({ filas: 1, asientos_por_fila: 2 }) }).success).toBe(false)
  })
})

describe('initialValues', () => {
  it('nuevo: activo por defecto y todos los días; editar: toma los valores del registro', () => {
    const n = initialValues(campos, null)
    expect(n.activa).toBe(true)
    expect(n.dias).toBe(127)
    const e = initialValues(campos, { codigo: 'A', duracion: 90, km: null, ciudad: 4, activa: false, dias: 3, salida: '07:00:00' })
    expect(e).toMatchObject({ codigo: 'A', duracion: '90', km: '', ciudad: '4', activa: false, dias: 3, salida: '07:00' })
    expect('clave' in e).toBe(false)
  })
})

describe('formato', () => {
  it('fechas sin depender de la zona horaria', () => {
    expect(formatDate('2027-01-05')).toBe('05/01/2027')
    expect(formatDate(null)).toBe('—')
  })
  it('días de la semana', () => {
    expect(diasTexto(127)).toBe('Todos los días')
    expect(diasTexto(1 | 4 | 16)).toBe('Lun, Mié, Vie')
  })
})

describe('erroresDeApi', () => {
  it('separa errores de campo de los generales', () => {
    const r = erroresDeApi({ codigo: ['Ya existe.'], non_field_errors: ['Se cruza con otra tarifa.'], detail: 'x' }, ['codigo'])
    expect(r.porCampo).toEqual({ codigo: 'Ya existe.' })
    expect(r.general).toBe('Se cruza con otra tarifa. x')
  })
})
