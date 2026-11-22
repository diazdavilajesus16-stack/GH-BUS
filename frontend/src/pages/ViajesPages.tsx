import { useCallback, useEffect, useState } from 'react'
import { ErrorBox, OkBox, inputClass, primaryButton } from '@/components/Field'
import { EstadoBadge, Motivos } from '@/components/Feedback'
import { ResourceForm } from '@/components/ResourceManager'
import { useAuth } from '@/hooks/useAuth'
import { useList } from '@/hooks/useList'
import { useStaffEvents, type Aviso } from '@/hooks/useStaffEvents'
import { mensajeDeError } from '@/services/http'
import {
  ACCIONES_DESPACHO, ESTADOS_ACTIVOS, ESTADOS_EDITABLES, ESTADOS_EN_CURSO, asignarConductor, asignarVehiculo, cambiarEstadoViaje,
  crearIncidencia, editarPrecio, generarViajes, historialViaje, listarAlertas, listarIncidencias, listarViajes, motivosDeError,
  obtenerViaje, quitarConductor, resolverIncidencia, type AlertaApi, type HistorialApi, type IncidenciaApi, type ResumenGeneracion,
  type RolConductor, type ViajeApi,
} from '@/services/tripsApi'
import type { Pagina } from '@/services/usersApi'
import { formatDateTime, type FieldDef, type Item } from '@/utils/forms'

const iso = (diasDesdeHoy: number) => {
  const d = new Date()
  d.setDate(d.getDate() + diasDesdeHoy)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const principal = (v: ViajeApi) => v.conductores.find((c) => c.rol === 'PRINCIPAL')?.conductor_nombre ?? '—'

function Encabezado({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="mb-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-brand-light">Operación y despacho</p>
      <h1 className="text-2xl font-bold text-navy">{titulo}</h1>
      <p className="text-sm text-slate-500">{texto}</p>
    </div>
  )
}

interface Veh { id: number; placa: string; marca: string; modelo: string }
interface Cond { id: number; nombres: string; apellidos: string; dni: string }

// ======================================================================= Programación
const RUTAS = { endpoint: '/rutas/', params: { activa: 'true' }, label: (i: Item) => `${String(i.codigo)} · ${String(i.nombre)}` }
const SERVICIOS = { endpoint: '/tipos-servicio/', params: { activo: 'true' }, label: (i: Item) => String(i.nombre) }
const camposViaje: FieldDef[] = [
  { name: 'ruta', label: 'Ruta', type: 'select', required: true, optionsFrom: RUTAS },
  { name: 'tipo_servicio', label: 'Servicio', type: 'select', required: true, optionsFrom: SERVICIOS },
  { name: 'salida_programada', label: 'Salida', type: 'datetime', required: true },
  { name: 'precio_base', label: 'Precio (S/)', type: 'number', step: '0.01', help: 'Vacío = tarifa vigente ese día' },
  { name: 'observaciones', label: 'Observaciones', type: 'text' },
]

function GenerarPanel({ onDone }: { onDone: () => void }) {
  const [desde, setDesde] = useState(() => iso(1))
  const [hasta, setHasta] = useState(() => iso(7))
  const [res, setRes] = useState<ResumenGeneracion | null>(null)
  const [motivos, setMotivos] = useState<string[]>([])
  const [cargando, setCargando] = useState(false)

  const generar = async () => {
    setMotivos([])
    setRes(null)
    setCargando(true)
    try {
      setRes(await generarViajes(desde, hasta))
      onDone()
    } catch (e) {
      setMotivos(motivosDeError(e))
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="space-y-3 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-lg font-semibold text-navy">Generar viajes desde los horarios</h2>
      <p className="text-sm text-slate-500">Crea los viajes que indican los horarios activos entre dos fechas. Se puede repetir sin duplicar y toma la tarifa vigente de cada día.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-600">Desde
          <input type="date" className={`${inputClass} w-44`} value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className="text-sm text-slate-600">Hasta
          <input type="date" className={`${inputClass} w-44`} value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
        <button type="button" disabled={cargando || !desde || !hasta} className={`${primaryButton} sm:w-auto`} onClick={() => void generar()}>
          {cargando ? 'Generando...' : 'Generar'}
        </button>
      </div>
      <Motivos motivos={motivos} />
      {res && (
        <div className="space-y-2">
          <OkBox message={`Se crearon ${res.creados} viaje(s). Ya existían ${res.ya_existian}. Omitidos por estar en el pasado: ${res.en_el_pasado}.`} />
          {res.sin_tarifa.length > 0 && (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <p className="font-medium">Sin tarifa vigente (no se crearon). Registra la tarifa y vuelve a generar:</p>
              <ul className="list-disc pl-5">{res.sin_tarifa.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DetalleViaje({ id, onChanged, onClose }: { id: number; onChanged: () => void; onClose: () => void }) {
  const [viaje, setViaje] = useState<ViajeApi | null>(null)
  const [hist, setHist] = useState<HistorialApi[]>([])
  const vehiculos = useList<Veh>('/vehiculos/', { activo: 'true' })
  const conductores = useList<Cond>('/conductores/', { activo: 'true' })
  const [veh, setVeh] = useState('')
  const [cond, setCond] = useState('')
  const [rol, setRol] = useState<RolConductor>('PRINCIPAL')
  const [precio, setPrecio] = useState('')
  const [motivos, setMotivos] = useState<string[]>([])
  const [ok, setOk] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const [v, h] = await Promise.all([obtenerViaje(id), historialViaje(id)])
    setViaje(v)
    setHist(h)
    setPrecio(v.precio_base)
  }, [id])
  useEffect(() => {
    let cancelado = false
    Promise.all([obtenerViaje(id), historialViaje(id)])
      .then(([v, h]) => { if (!cancelado) { setViaje(v); setHist(h); setPrecio(v.precio_base) } })
      .catch((e) => { if (!cancelado) setMotivos(motivosDeError(e)) })
    return () => { cancelado = true }
  }, [id])

  const ejecutar = async (accion: () => Promise<ViajeApi>, mensaje: string) => {
    setMotivos([])
    setOk(null)
    try {
      await accion()
      await cargar()
      setOk(mensaje)
      onChanged()
    } catch (e) {
      setMotivos(motivosDeError(e))
    }
  }

  if (!viaje) return <div className="rounded-xl bg-white p-5 text-sm text-slate-500 ring-1 ring-slate-200">Cargando viaje...</div>
  const editable = ESTADOS_EDITABLES.includes(viaje.estado)

  return (
    <section className="space-y-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200" aria-label={`Viaje ${viaje.codigo}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-navy">{viaje.codigo} · {viaje.origen_nombre} → {viaje.destino_nombre} <EstadoBadge estado={viaje.estado} /></h2>
          <p className="text-sm text-slate-500">Sale {formatDateTime(viaje.salida_programada)} · llega {formatDateTime(viaje.llegada_programada)} · {viaje.tipo_servicio_nombre} · S/ {viaje.precio_base}</p>
        </div>
        <button type="button" className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-surface" onClick={onClose}>Cerrar</button>
      </div>
      {!editable && <p className="rounded-lg bg-surface px-3 py-2 text-sm text-slate-600">El viaje está «{viaje.estado.toLowerCase().replace('_', ' ')}»: ya no se puede cambiar el vehículo ni los conductores.</p>}
      <Motivos motivos={motivos} />
      <OkBox message={ok} />

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-2">
          <h3 className="font-medium text-navy">Vehículo</h3>
          <p className="text-sm">{viaje.vehiculo_placa ? <>Asignado: <strong>{viaje.vehiculo_placa}</strong> ({viaje.capacidad} asientos)</> : <em className="text-slate-400">Sin vehículo</em>}</p>
          {editable && (
            <div className="flex flex-wrap gap-2">
              <select aria-label="Vehículo" className={`${inputClass} mt-0 w-64`} value={veh} onChange={(e) => setVeh(e.target.value)}>
                <option value="">Elige un vehículo</option>
                {vehiculos.map((v) => <option key={v.id} value={v.id}>{v.placa} · {v.marca} {v.modelo}</option>)}
              </select>
              <button type="button" disabled={!veh} className="rounded bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={() => void ejecutar(() => asignarVehiculo(id, Number(veh)), 'Vehículo asignado.')}>Asignar</button>
              {viaje.vehiculo && <button type="button" className="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-surface" onClick={() => void ejecutar(() => asignarVehiculo(id, null), 'Vehículo quitado.')}>Quitar</button>}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <h3 className="font-medium text-navy">Conductores</h3>
          <ul className="space-y-1 text-sm">
            {viaje.conductores.length === 0 && <li><em className="text-slate-400">Sin conductores</em></li>}
            {viaje.conductores.map((c) => (
              <li key={c.conductor} className="flex items-center gap-2">
                <span><strong>{c.conductor_nombre}</strong> · {c.rol === 'PRINCIPAL' ? 'principal' : 'copiloto'}</span>
                {editable && <button type="button" className="text-xs text-danger underline" onClick={() => void ejecutar(() => quitarConductor(id, c.conductor), 'Conductor quitado.')}>Quitar</button>}
              </li>
            ))}
          </ul>
          {editable && (
            <div className="flex flex-wrap gap-2">
              <select aria-label="Conductor" className={`${inputClass} mt-0 w-64`} value={cond} onChange={(e) => setCond(e.target.value)}>
                <option value="">Elige un conductor</option>
                {conductores.map((c) => <option key={c.id} value={c.id}>{c.apellidos}, {c.nombres} ({c.dni})</option>)}
              </select>
              <select aria-label="Rol del conductor" className={`${inputClass} mt-0 w-32`} value={rol} onChange={(e) => setRol(e.target.value as RolConductor)}>
                <option value="PRINCIPAL">Principal</option>
                <option value="COPILOTO">Copiloto</option>
              </select>
              <button type="button" disabled={!cond} className="rounded bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={() => void ejecutar(() => asignarConductor(id, Number(cond), rol), 'Conductor asignado.')}>Asignar</button>
            </div>
          )}
        </div>
      </div>

      {editable && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm text-slate-600">Precio de este viaje (S/)
            <input type="number" step="0.01" min="0" className={`${inputClass} w-36`} value={precio} onChange={(e) => setPrecio(e.target.value)} />
          </label>
          <button type="button" className="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-surface" onClick={() => void ejecutar(() => editarPrecio(id, Number(precio)), 'Precio actualizado.')}>Guardar precio</button>
        </div>
      )}

      <details>
        <summary className="cursor-pointer text-sm font-medium text-navy">Historial ({hist.length})</summary>
        <ul className="mt-2 space-y-1 text-sm text-slate-600">
          {[...hist].reverse().map((h) => (
            <li key={h.id}>{formatDateTime(h.cambiado_en)} · <strong>{h.estado_nuevo}</strong>{h.observacion ? ` — ${h.observacion}` : ''}{h.cambiado_por_nombre ? ` (${h.cambiado_por_nombre})` : ''}</li>
          ))}
        </ul>
      </details>
    </section>
  )
}

export function ProgramacionPage() {
  const [filtros, setFiltros] = useState(() => ({ desde: iso(0), hasta: iso(7), estado: '' }))
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Pagina<ViajeApi> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [sel, setSel] = useState<number | null>(null)
  const [modo, setModo] = useState<'generar' | 'manual' | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const refrescar = useCallback(() => setReload((n) => n + 1), [])
  useStaffEvents({ onTrip: refrescar })

  useEffect(() => {
    let cancelado = false
    listarViajes({ page, page_size: 20, fecha_desde: filtros.desde, fecha_hasta: filtros.hasta, ...(filtros.estado ? { estado: filtros.estado } : {}) })
      .then((d) => { if (!cancelado) { setData(d); setError(null); setLoading(false) } })
      .catch((e) => { if (!cancelado) { setError(mensajeDeError(e)); setLoading(false) } })
    return () => { cancelado = true }
  }, [filtros, page, reload])

  const cambiar = (parcial: Partial<typeof filtros>) => { setLoading(true); setPage(1); setFiltros((f) => ({ ...f, ...parcial })) }
  const paginas = data ? Math.max(1, Math.ceil(data.count / 20)) : 1

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Encabezado titulo="Programación de viajes" texto="Genera los viajes desde los horarios, asigna vehículo y conductores, y confirma la salida." />
      <div className="flex flex-wrap gap-3">
        <button type="button" className={`${primaryButton} sm:w-auto`} onClick={() => setModo(modo === 'generar' ? null : 'generar')}>Generar desde horarios</button>
        <button type="button" className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-navy hover:bg-surface" onClick={() => setModo(modo === 'manual' ? null : 'manual')}>Viaje manual</button>
      </div>
      {modo === 'generar' && <GenerarPanel onDone={refrescar} />}
      {modo === 'manual' && <ResourceForm fields={camposViaje} item={null} singular="viaje" endpoint="/viajes/" idKey="id" onCancel={() => setModo(null)} onDone={(m) => { setModo(null); setOk(m); refrescar() }} />}

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-slate-600">Desde<input type="date" aria-label="Desde" className={`${inputClass} w-44`} value={filtros.desde} onChange={(e) => cambiar({ desde: e.target.value })} /></label>
        <label className="text-sm text-slate-600">Hasta<input type="date" aria-label="Hasta" className={`${inputClass} w-44`} value={filtros.hasta} onChange={(e) => cambiar({ hasta: e.target.value })} /></label>
        <label className="text-sm text-slate-600">Estado
          <select aria-label="Estado" className={`${inputClass} w-44`} value={filtros.estado} onChange={(e) => cambiar({ estado: e.target.value })}>
            <option value="">Todos</option>
            {['PROGRAMADO', 'CONFIRMADO', 'EN_EMBARQUE', 'EN_RUTA', 'RETRASADO', 'FINALIZADO', 'CANCELADO'].map((e) => <option key={e} value={e}>{e.replace('_', ' ').toLowerCase()}</option>)}
          </select>
        </label>
      </div>
      <OkBox message={ok} />
      <ErrorBox message={error} />

      {sel !== null && <DetalleViaje key={sel} id={sel} onChanged={refrescar} onClose={() => setSel(null)} />}

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface text-xs uppercase text-slate-500">
            <tr><th className="px-3 py-2">Código</th><th className="px-3 py-2">Ruta</th><th className="px-3 py-2">Salida</th><th className="px-3 py-2">Vehículo</th><th className="px-3 py-2">Conductor</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Acciones</th></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">Cargando...</td></tr>}
            {!loading && data?.results.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">No hay viajes en ese rango. Usa «Generar desde horarios».</td></tr>}
            {!loading && data?.results.map((v) => (
              <tr key={v.id} className="border-t border-slate-200 align-top">
                <td className="px-3 py-2.5 font-medium">{v.codigo}</td>
                <td className="px-3 py-2.5">{v.origen_nombre} → {v.destino_nombre}<br /><span className="text-xs text-slate-500">{v.tipo_servicio_nombre}</span></td>
                <td className="px-3 py-2.5">{formatDateTime(v.salida_programada)}</td>
                <td className="px-3 py-2.5">{v.vehiculo_placa ?? <em className="text-slate-400">sin asignar</em>}</td>
                <td className="px-3 py-2.5">{principal(v)}</td>
                <td className="px-3 py-2.5"><EstadoBadge estado={v.estado} /></td>
                <td className="px-3 py-2.5"><button type="button" className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-surface" onClick={() => setSel(v.id)}>Gestionar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && data.count > 20 && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>{data.count} viaje(s)</span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page <= 1} className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40" onClick={() => { setLoading(true); setPage(page - 1) }}>Anterior</button>
            <span>Página {page} de {paginas}</span>
            <button type="button" disabled={page >= paginas} className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40" onClick={() => { setLoading(true); setPage(page + 1) }}>Siguiente</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ======================================================================= Despacho
const SITUACION_ALERTA: Record<AlertaApi['situacion'], { texto: string; clase: string }> = {
  VENCIDO: { texto: 'Vencido', clase: 'bg-red-100 text-red-800' },
  POR_VENCER: { texto: 'Por vencer', clase: 'bg-amber-100 text-amber-800' },
  SIN_REGISTRO: { texto: 'Sin registro', clase: 'bg-slate-200 text-slate-700' },
}

function AlertasPanel({ recarga }: { recarga: number }) {
  const [alertas, setAlertas] = useState<AlertaApi[]>([])
  useEffect(() => {
    let cancelado = false
    listarAlertas().then((a) => { if (!cancelado) setAlertas(a) }).catch(() => undefined)
    return () => { cancelado = true }
  }, [recarga])
  if (alertas.length === 0) return null
  return (
    <details className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200" open={alertas.some((a) => a.situacion === 'VENCIDO')}>
      <summary className="cursor-pointer text-sm font-semibold text-amber-900">Documentos y licencias que requieren atención ({alertas.length})</summary>
      <ul className="mt-3 space-y-1.5 text-sm">
        {alertas.map((a) => {
          const s = SITUACION_ALERTA[a.situacion]
          return (
            <li key={`${a.categoria}-${a.referencia}-${a.detalle}`} className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.clase}`}>{s.texto}</span>
              <span><strong>{a.referencia}</strong> · {a.detalle}{a.dias !== null ? ` · ${a.dias < 0 ? `venció hace ${-a.dias} d` : `vence en ${a.dias} d`}` : ''}</span>
              {a.bloquea_asignacion && <span className="text-xs text-red-700">bloquea la asignación</span>}
            </li>
          )
        })}
      </ul>
    </details>
  )
}

function TarjetaDespacho({ viaje, onCambio }: { viaje: ViajeApi; onCambio: () => void }) {
  const [pidiendo, setPidiendo] = useState<{ destino: ViajeApi['estado']; etiqueta: string } | null>(null)
  const [motivo, setMotivo] = useState('')
  const [motivos, setMotivos] = useState<string[]>([])
  const [trabajando, setTrabajando] = useState(false)

  const aplicar = async (destino: ViajeApi['estado'], obs = '') => {
    setMotivos([])
    setTrabajando(true)
    try {
      await cambiarEstadoViaje(viaje.id, destino, obs)
      setPidiendo(null)
      setMotivo('')
      onCambio()
    } catch (e) {
      setMotivos(motivosDeError(e))
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <article className="space-y-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200" aria-label={`Viaje ${viaje.codigo}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-navy">{viaje.codigo} · {viaje.origen_nombre} → {viaje.destino_nombre}</p>
          <p className="text-sm text-slate-500">Sale {formatDateTime(viaje.salida_programada)} · {viaje.tipo_servicio_nombre}</p>
        </div>
        <EstadoBadge estado={viaje.estado} />
      </div>
      <p className="text-sm text-slate-700">Vehículo: <strong>{viaje.vehiculo_placa ?? 'sin asignar'}</strong> · Conductor: <strong>{principal(viaje)}</strong></p>
      <Motivos motivos={motivos} />
      <div className="flex flex-wrap gap-2">
        {ACCIONES_DESPACHO[viaje.estado].map((a) => (
          <button key={a.destino} type="button" disabled={trabajando}
            className={a.peligrosa ? 'rounded border border-danger px-3 py-1.5 text-sm text-danger hover:bg-danger/10' : 'rounded bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-light disabled:opacity-60'}
            onClick={() => { setMotivos([]); if (a.pideMotivo) setPidiendo({ destino: a.destino, etiqueta: a.etiqueta }); else void aplicar(a.destino) }}>
            {a.etiqueta}
          </button>
        ))}
      </div>
      {pidiendo && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm text-slate-600">Motivo ({pidiendo.etiqueta.toLowerCase()})
            <input className={`${inputClass} w-72`} value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
          </label>
          <button type="button" disabled={!motivo.trim() || trabajando} className="rounded bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={() => void aplicar(pidiendo.destino, motivo)}>Aplicar</button>
          <button type="button" className="rounded border border-slate-300 px-3 py-2 text-sm" onClick={() => { setPidiendo(null); setMotivo('') }}>Volver</button>
        </div>
      )}
    </article>
  )
}

export function DespachoPage() {
  const [viajes, setViajes] = useState<ViajeApi[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const refrescar = useCallback(() => setReload((n) => n + 1), [])
  useStaffEvents({ onTrip: refrescar })

  useEffect(() => {
    let cancelado = false
    listarViajes({ estado: ESTADOS_ACTIVOS.join(','), fecha_hasta: iso(2), page_size: 100 })
      .then((d) => { if (!cancelado) { setViajes(d.results); setError(null); setLoading(false) } })
      .catch((e) => { if (!cancelado) { setError(mensajeDeError(e)); setLoading(false) } })
    return () => { cancelado = true }
  }, [reload])

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Encabezado titulo="Despacho de unidades" texto="Viajes activos hasta dentro de 2 días. Cada salida se valida de nuevo: vehículo y conductor deben seguir habilitados." />
      <AlertasPanel recarga={reload} />
      <ErrorBox message={error} />
      {loading && <p className="text-sm text-slate-500">Cargando...</p>}
      {!loading && viajes.length === 0 && <p className="rounded-xl bg-white p-6 text-center text-sm text-slate-500 ring-1 ring-slate-200">No hay viajes activos en este momento.</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {viajes.map((v) => <TarjetaDespacho key={`${v.id}-${v.estado}-${v.vehiculo ?? 0}-${v.conductores.length}`} viaje={v} onCambio={refrescar} />)}
      </div>
    </div>
  )
}

// ======================================================================= Seguimiento
const TIPOS_INCIDENCIA = [['MECANICA', 'Mecánica'], ['RETRASO', 'Retraso'], ['ACCIDENTE', 'Accidente'], ['CLIMA', 'Clima'], ['PASAJERO', 'Pasajero'], ['OTRO', 'Otro']]
const CLASE_SEVERIDAD = { BAJA: 'bg-slate-200 text-slate-700', MEDIA: 'bg-amber-100 text-amber-800', ALTA: 'bg-red-100 text-red-800' }

function FormIncidencia({ viajes, onCreada }: { viajes: ViajeApi[]; onCreada: () => void }) {
  const [viaje, setViaje] = useState('')
  const [tipo, setTipo] = useState('MECANICA')
  const [severidad, setSeveridad] = useState('BAJA')
  const [descripcion, setDescripcion] = useState('')
  const [motivos, setMotivos] = useState<string[]>([])
  const [ok, setOk] = useState<string | null>(null)

  const enviar = async () => {
    setMotivos([])
    setOk(null)
    try {
      await crearIncidencia({ viaje: Number(viaje), tipo, severidad, descripcion })
      setDescripcion('')
      setOk('Incidencia registrada.')
      onCreada()
    } catch (e) {
      setMotivos(motivosDeError(e))
    }
  }

  return (
    <form className="space-y-3 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200" onSubmit={(e) => { e.preventDefault(); void enviar() }}>
      <h2 className="text-lg font-semibold text-navy">Registrar incidencia</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm text-slate-600">Viaje
          <select aria-label="Viaje de la incidencia" className={inputClass} value={viaje} onChange={(e) => setViaje(e.target.value)}>
            <option value="">Elige un viaje en curso</option>
            {viajes.map((v) => <option key={v.id} value={v.id}>{v.codigo} · {v.origen_nombre} → {v.destino_nombre}</option>)}
          </select>
        </label>
        <label className="text-sm text-slate-600">Tipo
          <select aria-label="Tipo de incidencia" className={inputClass} value={tipo} onChange={(e) => setTipo(e.target.value)}>{TIPOS_INCIDENCIA.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        <label className="text-sm text-slate-600">Severidad
          <select aria-label="Severidad" className={inputClass} value={severidad} onChange={(e) => setSeveridad(e.target.value)}><option value="BAJA">Baja</option><option value="MEDIA">Media</option><option value="ALTA">Alta (avisa al personal)</option></select>
        </label>
      </div>
      <label className="block text-sm text-slate-600">Qué ocurrió
        <textarea aria-label="Descripción de la incidencia" rows={2} className={inputClass} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      </label>
      <Motivos motivos={motivos} />
      <OkBox message={ok} />
      <button type="submit" disabled={!viaje || descripcion.trim().length < 5} className={`${primaryButton} sm:w-auto`}>Registrar</button>
    </form>
  )
}

function FilaIncidencia({ inc, puedeResolver, onCambio }: { inc: IncidenciaApi; puedeResolver: boolean; onCambio: () => void }) {
  const [abierta, setAbierta] = useState(false)
  const [texto, setTexto] = useState('')
  const [err, setErr] = useState<string[]>([])
  const resolver = async () => {
    setErr([])
    try {
      await resolverIncidencia(inc.id, texto)
      setAbierta(false)
      onCambio()
    } catch (e) {
      setErr(motivosDeError(e))
    }
  }
  return (
    <li className="space-y-1 rounded-lg border border-slate-200 bg-white p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CLASE_SEVERIDAD[inc.severidad]}`}>{inc.severidad}</span>
        <strong>{inc.viaje_codigo}</strong> · {inc.tipo.toLowerCase()} · {formatDateTime(inc.ocurrida_en)} · {inc.registrada_por_nombre}
        {inc.resuelta && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">Resuelta</span>}
      </div>
      <p>{inc.descripcion}</p>
      {inc.resuelta && <p className="text-slate-500">Resolución: {inc.resolucion}</p>}
      {!inc.resuelta && puedeResolver && !abierta && <button type="button" className="text-xs underline text-brand-light" onClick={() => setAbierta(true)}>Marcar como resuelta</button>}
      {abierta && (
        <div className="flex flex-wrap items-end gap-2">
          <input aria-label="Resolución" className={`${inputClass} mt-0 w-72`} placeholder="Cómo se resolvió" value={texto} onChange={(e) => setTexto(e.target.value)} />
          <button type="button" disabled={!texto.trim()} className="rounded bg-brand px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" onClick={() => void resolver()}>Guardar</button>
        </div>
      )}
      <Motivos motivos={err} />
    </li>
  )
}

export function SeguimientoPage() {
  const { user } = useAuth()
  const puedeResolver = !!user?.roles.some((r) => r === 'administrador' || r === 'despachador')
  const [viajes, setViajes] = useState<ViajeApi[]>([])
  const [incidencias, setIncidencias] = useState<IncidenciaApi[]>([])
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const refrescar = useCallback(() => setReload((n) => n + 1), [])
  useStaffEvents({ onTrip: refrescar, onNotification: (a) => { setAviso(a); refrescar() } })

  useEffect(() => {
    let cancelado = false
    Promise.all([listarViajes({ estado: ESTADOS_EN_CURSO.join(','), page_size: 100 }), listarIncidencias({ page_size: 30 })])
      .then(([v, i]) => { if (!cancelado) { setViajes(v.results); setIncidencias(i.results); setError(null) } })
      .catch((e) => { if (!cancelado) setError(mensajeDeError(e)) })
    return () => { cancelado = true }
  }, [reload])

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Encabezado titulo="Seguimiento de viajes" texto="Viajes en embarque, en ruta o retrasados, e incidencias. Se actualiza solo en tiempo real." />
      {aviso && (
        <div role="status" className="flex items-start justify-between gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900 ring-1 ring-red-200">
          <p><strong>{aviso.title}.</strong> {aviso.message}</p>
          <button type="button" className="text-xs underline" onClick={() => setAviso(null)}>Cerrar</button>
        </div>
      )}
      <ErrorBox message={error} />
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-navy">En curso ({viajes.length})</h2>
        {viajes.length === 0 && <p className="rounded-xl bg-white p-6 text-center text-sm text-slate-500 ring-1 ring-slate-200">No hay viajes en curso.</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {viajes.map((v) => (
            <article key={v.id} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-navy">{v.codigo} · {v.origen_nombre} → {v.destino_nombre}</p>
                <EstadoBadge estado={v.estado} />
              </div>
              <p className="text-sm text-slate-500">Salió {v.salida_real ? formatDateTime(v.salida_real) : 'aún no'} · llegada prevista {formatDateTime(v.llegada_programada)}</p>
              <p className="text-sm">Vehículo <strong>{v.vehiculo_placa}</strong> · {principal(v)}</p>
            </article>
          ))}
        </div>
      </section>
      <FormIncidencia viajes={viajes} onCreada={refrescar} />
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-navy">Incidencias recientes</h2>
        {incidencias.length === 0 && <p className="text-sm text-slate-500">Sin incidencias registradas.</p>}
        <ul className="space-y-2">{incidencias.map((i) => <FilaIncidencia key={`${i.id}-${i.resuelta}`} inc={i} puedeResolver={puedeResolver} onCambio={refrescar} />)}</ul>
      </section>
    </div>
  )
}
