import { zodResolver } from '@hookform/resolvers/zod'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Controller, useForm, type FieldValues, type Resolver } from 'react-hook-form'
import { ErrorBox, OkBox, inputClass, primaryButton } from '@/components/Field'
import { http, mensajeDeError } from '@/services/http'
import { DIAS, buildSchema, erroresDeApi, initialValues, type FieldDef, type Item, type Option } from '@/utils/forms'

export interface Column {
  header: string
  cell: (item: Item) => ReactNode
}

interface Props {
  endpoint: string
  /** Nombre en singular para los textos: «ruta», «vehículo»… */
  singular: string
  columns: Column[]
  fields: FieldDef[]
  /** Campo booleano que indica si el registro está activo (permite activar/desactivar). */
  activeKey?: string
  idKey?: string
  canCreate?: boolean
  searchable?: boolean
  /** Filtros fijos de la consulta (p. ej. solo los de un vehículo). */
  params?: Record<string, string>
  /** Texto de ayuda sobre la tabla. */
  intro?: string
}

const PAGE_SIZE = 20

function useOptions(field: FieldDef): Option[] {
  const [loaded, setLoaded] = useState<Option[]>([])
  const origen = field.optionsFrom
  useEffect(() => {
    if (!origen) return
    let cancelado = false
    http
      .get<{ results: Item[] }>(origen.endpoint, { params: { page_size: 200, ...origen.params } })
      .then(({ data }) => {
        if (!cancelado) setLoaded(data.results.map((i) => ({ value: String(i.id), label: origen.label(i) })))
      })
      .catch(() => undefined)
    return () => {
      cancelado = true
    }
  }, [origen])
  return origen ? loaded : (field.options ?? [])
}

function FieldInput({ field, form, error }: { field: FieldDef; form: ReturnType<typeof useForm<FieldValues>>; error?: string }) {
  const options = useOptions(field)
  const id = `f_${field.name}`
  const { register, control } = form
  const label = (
    <label htmlFor={id} className="text-sm font-medium text-slate-700">
      {field.label}
      {field.required && <span className="text-danger"> *</span>}
    </label>
  )
  const aviso = (
    <>
      {field.help && !error && <p className="mt-1 text-xs text-slate-400">{field.help}</p>}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </>
  )

  if (field.type === 'checkbox') {
    return (
      <div className="flex items-center gap-2 pt-6">
        <input id={id} type="checkbox" {...register(field.name)} />
        <label htmlFor={id} className="text-sm font-medium text-slate-700">{field.label}</label>
      </div>
    )
  }
  if (field.type === 'weekdays') {
    return (
      <Controller
        control={control}
        name={field.name}
        render={({ field: f }) => (
          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-medium text-slate-700">{field.label}</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {DIAS.map((d) => {
                const on = ((f.value as number) & d.bit) !== 0
                return (
                  <label key={d.bit} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${on ? 'border-brand bg-brand text-white' : 'border-slate-300 text-slate-600'}`}>
                    <input type="checkbox" className="sr-only" checked={on} onChange={() => f.onChange((f.value as number) ^ d.bit)} />
                    {d.label}
                  </label>
                )
              })}
            </div>
            {aviso}
          </fieldset>
        )}
      />
    )
  }
  if (field.type === 'pisos') {
    return (
      <Controller
        control={control}
        name={field.name}
        render={({ field: f }) => {
          const pisos = f.value as { filas: number; asientos_por_fila: number }[]
          const total = pisos.reduce((s, p) => s + (Number(p.filas) || 0) * (Number(p.asientos_por_fila) || 0), 0)
          const set = (i: number, k: 'filas' | 'asientos_por_fila', v: string) =>
            f.onChange(pisos.map((p, j) => (j === i ? { ...p, [k]: v === '' ? NaN : Number(v) } : p)))
          return (
            <fieldset className="sm:col-span-2">
              <legend className="text-sm font-medium text-slate-700">Pisos</legend>
              <div className="mt-1 space-y-2">
                {pisos.map((p, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-3">
                    <span className="w-14 text-sm text-slate-500">Piso {i + 1}</span>
                    <label className="text-xs text-slate-500">Filas
                      <input type="number" min={1} max={20} className={`${inputClass} w-24`} value={Number.isNaN(p.filas) ? '' : p.filas} onChange={(e) => set(i, 'filas', e.target.value)} />
                    </label>
                    <label className="text-xs text-slate-500">Asientos por fila (2 a 5)
                      <input type="number" min={2} max={5} className={`${inputClass} w-24`} value={Number.isNaN(p.asientos_por_fila) ? '' : p.asientos_por_fila} onChange={(e) => set(i, 'asientos_por_fila', e.target.value)} />
                    </label>
                    {i === 1 && (
                      <button type="button" className="text-sm text-danger underline" onClick={() => f.onChange(pisos.slice(0, 1))}>Quitar piso</button>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-4 text-sm">
                {pisos.length < 2 && (
                  <button type="button" className="text-brand-light underline" onClick={() => f.onChange([...pisos, { filas: 5, asientos_por_fila: 4 }])}>Agregar segundo piso</button>
                )}
                <span className="text-slate-500">Total: <strong>{total}</strong> asientos (máximo 80)</span>
              </div>
              {error && <p className="mt-1 text-xs text-danger">{error}</p>}
            </fieldset>
          )
        }}
      />
    )
  }
  if (field.type === 'select') {
    return (
      <div>
        {label}
        <select id={id} className={inputClass} aria-invalid={error ? 'true' : 'false'} {...register(field.name)}>
          <option value="">{field.required ? 'Elige una opción' : '— ninguno —'}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {aviso}
      </div>
    )
  }
  if (field.type === 'textarea') {
    return (
      <div className="sm:col-span-2">
        {label}
        <textarea id={id} rows={3} className={inputClass} {...register(field.name)} />
        {aviso}
      </div>
    )
  }
  const htmlType = { text: 'text', number: 'number', date: 'date', time: 'time', datetime: 'datetime-local' }[field.type]
  return (
    <div>
      {label}
      <input
        id={id}
        type={htmlType}
        step={field.step ?? (field.type === 'number' ? 'any' : undefined)}
        placeholder={field.placeholder}
        className={inputClass}
        aria-invalid={error ? 'true' : 'false'}
        {...register(field.name)}
      />
      {aviso}
    </div>
  )
}

function ResourceForm({ fields, item, singular, endpoint, idKey, onDone, onCancel }: {
  fields: FieldDef[]; item: Item | null; singular: string; endpoint: string; idKey: string
  onDone: (mensaje: string) => void; onCancel: () => void
}) {
  const editing = item !== null
  const schema = useMemo(() => buildSchema(fields, editing), [fields, editing])
  const visibles = fields.filter((f) => !(editing && f.createOnly))
  const form = useForm<FieldValues>({
    resolver: zodResolver(schema) as unknown as Resolver<FieldValues>,
    defaultValues: initialValues(fields, item),
  })
  const [serverError, setServerError] = useState<string | null>(null)
  const { handleSubmit, setError, formState: { errors, isSubmitting } } = form

  const onSubmit = async (valores: FieldValues) => {
    setServerError(null)
    try {
      if (editing) await http.patch(`${endpoint}${String(item[idKey])}/`, valores)
      else await http.post(endpoint, valores)
      onDone(editing ? 'Cambios guardados.' : `${singular[0].toUpperCase()}${singular.slice(1)} creado.`)
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 400) {
        const { porCampo, general } = erroresDeApi(e.response.data, visibles.map((f) => f.name))
        for (const [campo, texto] of Object.entries(porCampo)) setError(campo, { message: texto })
        setServerError(general ?? (Object.keys(porCampo).length ? null : mensajeDeError(e)))
      } else {
        setServerError(mensajeDeError(e))
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-lg font-semibold text-navy">{editing ? `Editar ${singular}` : `Nuevo ${singular}`}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {visibles.map((f) => {
          const raw = errors[f.name]
          const msg = raw ? (typeof raw.message === 'string' && raw.message ? raw.message : 'Revisa este campo') : undefined
          return <FieldInput key={f.name} field={f} form={form} error={msg} />
        })}
      </div>
      <ErrorBox message={serverError} />
      <div className="flex gap-3">
        <button type="submit" disabled={isSubmitting} className={`${primaryButton} sm:w-auto`}>{isSubmitting ? 'Guardando...' : 'Guardar'}</button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-navy hover:bg-surface">Cancelar</button>
      </div>
    </form>
  )
}

/** Lista + formulario de alta/edición de un catálogo, sobre cualquier endpoint de `CatalogViewSet`. */
export function ResourceManager({ endpoint, singular, columns, fields, activeKey, idKey = 'id', canCreate = true, searchable = true, params, intro }: Props) {
  const [items, setItems] = useState<Item[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [editing, setEditing] = useState<Item | 'new' | null>(null)
  const [reload, setReload] = useState(0)
  const paramsKey = JSON.stringify(params ?? {})

  useEffect(() => {
    let cancelado = false
    http
      .get<{ results: Item[]; count: number } | Item[]>(endpoint, { params: { page, page_size: PAGE_SIZE, ...(search ? { search } : {}), ...JSON.parse(paramsKey) } })
      .then(({ data }) => {
        if (cancelado) return
        const lista = Array.isArray(data) ? data : data.results
        setItems(lista)
        setCount(Array.isArray(data) ? data.length : data.count)
        setError(null)
        setLoading(false)
      })
      .catch((e) => {
        if (cancelado) return
        setError(mensajeDeError(e))
        setLoading(false)
      })
    return () => {
      cancelado = true
    }
  }, [endpoint, page, search, paramsKey, reload])

  const refrescar = useCallback(() => setReload((n) => n + 1), [])
  const totalPaginas = Math.max(1, Math.ceil(count / PAGE_SIZE))

  const alternar = async (item: Item) => {
    if (!activeKey) return
    try {
      await http.patch(`${endpoint}${String(item[idKey])}/`, { [activeKey]: !item[activeKey] })
      setOk(item[activeKey] ? 'Desactivado.' : 'Activado.')
      setError(null)
      refrescar()
    } catch (e) {
      setOk(null)
      setError(mensajeDeError(e))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-500">{intro}</p>
        {canCreate && editing === null && (
          <button type="button" className={`${primaryButton} sm:w-auto`} onClick={() => { setOk(null); setEditing('new') }}>Nuevo {singular}</button>
        )}
      </div>

      {editing !== null && (
        <ResourceForm
          key={editing === 'new' ? 'new' : String(editing[idKey])}
          fields={fields} item={editing === 'new' ? null : editing} singular={singular} endpoint={endpoint} idKey={idKey}
          onCancel={() => setEditing(null)}
          onDone={(m) => { setEditing(null); setOk(m); refrescar() }}
        />
      )}

      {searchable && (
        <input aria-label="Buscar" placeholder="Buscar..." className={`${inputClass} max-w-sm`} value={search}
          onChange={(e) => { setLoading(true); setPage(1); setSearch(e.target.value) }} />
      )}
      <OkBox message={ok} />
      <ErrorBox message={error} />

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface text-xs uppercase text-slate-500">
            <tr>
              {columns.map((c) => <th key={c.header} className="px-3 py-2">{c.header}</th>)}
              {activeKey && <th className="px-3 py-2">Estado</th>}
              <th className="px-3 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={columns.length + 2} className="px-3 py-6 text-center text-slate-500">Cargando...</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={columns.length + 2} className="px-3 py-6 text-center text-slate-500">Aún no hay registros.</td></tr>}
            {!loading && items.map((item) => (
              <tr key={String(item[idKey])} className="border-t border-slate-200 align-top">
                {columns.map((c) => <td key={c.header} className="px-3 py-2.5">{c.cell(item)}</td>)}
                {activeKey && (
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${item[activeKey] ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>{item[activeKey] ? 'Activo' : 'Inactivo'}</span>
                  </td>
                )}
                <td className="px-3 py-2.5">
                  <div className="flex gap-2 text-xs">
                    <button type="button" className="rounded border border-slate-300 px-2 py-1 hover:bg-surface" onClick={() => { setOk(null); setEditing(item) }}>Editar</button>
                    {activeKey && (
                      <button type="button" className="rounded border border-slate-300 px-2 py-1 hover:bg-surface" onClick={() => void alternar(item)}>{item[activeKey] ? 'Desactivar' : 'Activar'}</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {count > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>{count} registro(s)</span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page <= 1} className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40" onClick={() => { setLoading(true); setPage(page - 1) }}>Anterior</button>
            <span>Página {page} de {totalPaginas}</span>
            <button type="button" disabled={page >= totalPaginas} className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40" onClick={() => { setLoading(true); setPage(page + 1) }}>Siguiente</button>
          </div>
        </div>
      )}
    </div>
  )
}
