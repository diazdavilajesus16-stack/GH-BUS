import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ErrorBox, inputClass } from '@/components/Field'
import { mensajeDeError } from '@/services/http'
import {
  CLASE_ESTADO_VIAJE,
  ETIQUETA_ESTADO_VIAJE,
  listarViajes,
  type ViajeApi,
} from '@/services/tripsApi'
import type { Pagina } from '@/services/usersApi'
import { formatDateTime } from '@/utils/forms'

interface FiltrosVenta {
  search: string
  desde: string
  hasta: string
  page: number
}

function fechaLocal(fecha: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`
}

function filtrosIniciales(): FiltrosVenta {
  const hoy = new Date()
  const fin = new Date(hoy)
  fin.setDate(fin.getDate() + 30)
  return { search: '', desde: fechaLocal(hoy), hasta: fechaLocal(fin), page: 1 }
}

const soles = (amount: string) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(amount))

function FilaViaje({ viaje }: { viaje: ViajeApi }) {
  return (
    <tr className="border-t border-slate-200 align-top">
      <td className="px-3 py-3">
        <p className="font-semibold text-navy">{viaje.codigo}</p>
        <p>{viaje.origen_nombre} → {viaje.destino_nombre}</p>
      </td>
      <td className="px-3 py-3 whitespace-nowrap">{formatDateTime(viaje.salida_programada)}</td>
      <td className="px-3 py-3">
        <p>{viaje.tipo_servicio_nombre}</p>
        <span className={`mt-1 inline-block rounded-full px-2 py-1 text-xs font-medium ${CLASE_ESTADO_VIAJE[viaje.estado]}`}>
          {ETIQUETA_ESTADO_VIAJE[viaje.estado]}
        </span>
      </td>
      <td className="px-3 py-3 whitespace-nowrap">{soles(viaje.precio_base)}</td>
      <td className="px-3 py-3">
        <p>{viaje.capacidad ?? 40} asientos</p>
        <p className="text-xs text-slate-500">{viaje.vehiculo_placa ?? 'Unidad por asignar'}</p>
      </td>
      <td className="px-3 py-3">
        <Link
          to={`/reservar/${viaje.id}?origen=comercial`}
          className="inline-block whitespace-nowrap rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-light"
        >
          Vender boletos
        </Link>
      </td>
    </tr>
  )
}

export function VentaBoletosPage() {
  const [filtros, setFiltros] = useState<FiltrosVenta>(filtrosIniciales)
  const [busqueda, setBusqueda] = useState('')
  const [datos, setDatos] = useState<Pagina<ViajeApi> | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    listarViajes({
      estado: 'PROGRAMADO,CONFIRMADO',
      salida_desde: new Date().toISOString(),
      fecha_desde: filtros.desde,
      fecha_hasta: filtros.hasta,
      search: filtros.search || undefined,
      page: filtros.page,
      page_size: 20,
    })
      .then((response) => {
        if (!cancelado) {
          setDatos(response)
          setError(null)
        }
      })
      .catch((requestError: unknown) => {
        if (!cancelado) {
          setDatos(null)
          setError(mensajeDeError(requestError))
        }
      })
      .finally(() => {
        if (!cancelado) setCargando(false)
      })
    return () => { cancelado = true }
  }, [filtros])

  const actualizarFiltros = (cambio: Partial<FiltrosVenta>) => {
    setCargando(true)
    setFiltros((actuales) => ({ ...actuales, ...cambio }))
  }

  const buscar = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    actualizarFiltros({ search: busqueda.trim(), page: 1 })
  }

  const totalPaginas = Math.max(1, Math.ceil((datos?.count ?? 0) / 20))

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-light">Comercial</p>
        <h1 className="text-2xl font-bold text-navy">Venta de boletos</h1>
        <p className="mt-1 text-sm text-slate-600">Elige un viaje disponible para seleccionar asientos y emitir los boletos.</p>
      </div>

      <form onSubmit={buscar} className="grid gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:grid-cols-2 lg:grid-cols-[1fr_180px_180px_auto]">
        <input
          aria-label="Buscar viaje"
          placeholder="Buscar por código, ruta o destino"
          className={inputClass}
          value={busqueda}
          onChange={(event) => setBusqueda(event.target.value)}
        />
        <label className="text-sm text-slate-600">
          Desde
          <input
            type="date"
            aria-label="Fecha desde"
            className={inputClass}
            value={filtros.desde}
            onChange={(event) => actualizarFiltros({ desde: event.target.value, page: 1 })}
          />
        </label>
        <label className="text-sm text-slate-600">
          Hasta
          <input
            type="date"
            aria-label="Fecha hasta"
            className={inputClass}
            value={filtros.hasta}
            onChange={(event) => actualizarFiltros({ hasta: event.target.value, page: 1 })}
          />
        </label>
        <button type="submit" className="self-end rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-light">
          Buscar
        </button>
      </form>

      <ErrorBox message={error} />

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-surface text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Viaje y ruta</th>
              <th className="px-3 py-2">Salida</th>
              <th className="px-3 py-2">Servicio / estado</th>
              <th className="px-3 py-2">Precio</th>
              <th className="px-3 py-2">Unidad</th>
              <th className="px-3 py-2">Acción</th>
            </tr>
          </thead>
          <tbody>
            {cargando && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">Cargando viajes disponibles...</td></tr>}
            {!cargando && !error && datos?.results.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">No hay viajes disponibles en esas fechas.</td></tr>
            )}
            {!cargando && datos?.results.map((viaje) => <FilaViaje key={viaje.id} viaje={viaje} />)}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
        <span>{datos?.count ?? 0} viaje(s) disponible(s)</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={(filtros.page ?? 1) <= 1 || cargando}
            className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
            onClick={() => actualizarFiltros({ page: filtros.page - 1 })}
          >
            Anterior
          </button>
          <span>Página {filtros.page} de {totalPaginas}</span>
          <button
            type="button"
            disabled={filtros.page >= totalPaginas || cargando}
            className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
            onClick={() => actualizarFiltros({ page: filtros.page + 1 })}
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  )
}
