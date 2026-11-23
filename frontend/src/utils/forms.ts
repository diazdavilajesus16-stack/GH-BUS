import { z } from 'zod'

export type FieldType =
  | 'text' | 'textarea' | 'number' | 'date' | 'time' | 'datetime' | 'checkbox' | 'select' | 'weekdays' | 'pisos'

export interface Option {
  value: string
  label: string
}

export type Item = Record<string, unknown>

export interface FieldDef {
  name: string
  label: string
  type: FieldType
  required?: boolean
  options?: Option[]
  /** Opciones tomadas de la API (p. ej. las ciudades activas para elegir origen). */
  optionsFrom?: { endpoint: string; label: (item: Item) => string; params?: Record<string, string> }
  /** El valor del selector es numérico (id). Por defecto los selectores con `optionsFrom` lo son. */
  numeric?: boolean
  createOnly?: boolean
  help?: string
  step?: string
  placeholder?: string
  defaultValue?: unknown
}

export const DIAS = [
  { bit: 1, label: 'Lun' }, { bit: 2, label: 'Mar' }, { bit: 4, label: 'Mié' }, { bit: 8, label: 'Jue' },
  { bit: 16, label: 'Vie' }, { bit: 32, label: 'Sáb' }, { bit: 64, label: 'Dom' },
] as const

export function diasTexto(mask: number): string {
  if (mask === 127) return 'Todos los días'
  return DIAS.filter((d) => (mask & d.bit) !== 0).map((d) => d.label).join(', ') || '—'
}

/** «2027-01-05» → «05/01/2027». Se arma a mano para no depender de la zona horaria del navegador. */
export function formatDate(iso: unknown): string {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '—'
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

export function formatDateTime(iso: unknown): string {
  if (typeof iso !== 'string') return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** ISO (UTC) → valor de <input type="datetime-local"> en hora local. */
export function toLocalInput(iso: unknown): string {
  if (typeof iso !== 'string') return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function fieldSchema(f: FieldDef): z.ZodType {
  const req = !!f.required
  const msg = 'Requerido'
  switch (f.type) {
    case 'text':
    case 'textarea':
      return req ? z.string().trim().min(1, msg) : z.string().trim()
    case 'number':
      return z
        .string()
        .trim()
        .refine((v) => (v === '' ? !req : Number.isFinite(Number(v)) && Number(v) >= 0), req ? 'Ingresa un número válido' : 'Número no válido')
        .transform((v) => (v === '' ? null : Number(v)))
    case 'date':
      return z
        .string()
        .refine((v) => (v === '' ? !req : /^\d{4}-\d{2}-\d{2}$/.test(v)), msg)
        .transform((v) => (v === '' ? null : v))
    case 'time':
      return z
        .string()
        .refine((v) => (v === '' ? !req : /^\d{2}:\d{2}(:\d{2})?$/.test(v)), msg)
        .transform((v) => (v === '' ? null : v.slice(0, 5)))
    case 'datetime':
      return z
        .string()
        .refine((v) => (v === '' ? !req : !Number.isNaN(new Date(v).getTime())), msg)
        .transform((v) => (v === '' ? null : new Date(v).toISOString()))
    case 'select': {
      const numeric = f.numeric ?? !!f.optionsFrom
      return z
        .string()
        .refine((v) => (v === '' ? !req : true), 'Elige una opción')
        .transform((v) => (v === '' ? null : numeric ? Number(v) : v))
    }
    case 'checkbox':
      return z.boolean()
    case 'weekdays':
      return z.number().int().min(1, 'Elige al menos un día').max(127)
    case 'pisos':
      return z
        .array(
          z.object({
            filas: z.number({ error: 'Número de filas' }).int().min(1, 'Mínimo 1 fila').max(20, 'Máximo 20 filas'),
            asientos_por_fila: z.number({ error: 'Asientos por fila' }).int().min(2, 'Mínimo 2').max(5, 'Máximo 5'),
          }),
        )
        .min(1)
        .max(2)
  }
}

/** Esquema Zod del formulario. Al editar se omiten los campos «solo al crear». */
export function buildSchema(fields: FieldDef[], editing: boolean) {
  const shape: Record<string, z.ZodType> = {}
  for (const f of fields) {
    if (editing && f.createOnly) continue
    shape[f.name] = fieldSchema(f)
  }
  return z.object(shape)
}

/** Valores iniciales del formulario (todo como texto, que es lo que producen los <input>). */
export function initialValues(fields: FieldDef[], item: Item | null): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of fields) {
    if (item && f.createOnly) continue
    const v = item ? item[f.name] : f.defaultValue
    switch (f.type) {
      case 'checkbox':
        out[f.name] = typeof v === 'boolean' ? v : !item
        break
      case 'weekdays':
        out[f.name] = typeof v === 'number' ? v : 127
        break
      case 'pisos':
        out[f.name] = Array.isArray(v) ? v : [{ filas: 10, asientos_por_fila: 4 }]
        break
      case 'datetime':
        out[f.name] = toLocalInput(v)
        break
      case 'time':
        out[f.name] = typeof v === 'string' ? v.slice(0, 5) : ''
        break
      default:
        out[f.name] = v === null || v === undefined ? '' : String(v)
    }
  }
  return out
}

/** Asigna los errores de campo que devuelve DRF ({campo: [mensajes]}) y devuelve el resto como texto. */
export function erroresDeApi(data: unknown, campos: string[]): { porCampo: Record<string, string>; general: string | null } {
  const porCampo: Record<string, string> = {}
  const generales: string[] = []
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      const texto = Array.isArray(v) ? v.map(String).join(' ') : typeof v === 'string' ? v : ''
      if (!texto) continue
      if (campos.includes(k)) porCampo[k] = texto
      else generales.push(texto)
    }
  } else if (Array.isArray(data)) {
    generales.push(data.map(String).join(' '))
  }
  return { porCampo, general: generales.length ? generales.join(' ') : null }
}
