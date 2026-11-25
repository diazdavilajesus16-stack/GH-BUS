import { useEffect, useState, type FormEvent } from 'react'
import { ErrorBox, OkBox, inputClass } from '@/components/Field'
import { mensajeDeError } from '@/services/http'
import {
  cerrarLiquidacion,
  listarLiquidaciones,
  registrarGastoViaje,
  type TripExpenseCategory,
  type TripSettlement,
  type TripSettlementFilters,
  type TripSettlementsPage,
} from '@/services/tripSettlementsApi'

const estados: Record<TripSettlement['settlement_status'], { label: string; className: string }> = {
  PENDING: { label: 'Pendiente', className: 'bg-amber-100 text-amber-800' },
  DRAFT: { label: 'En proceso', className: 'bg-blue-100 text-blue-800' },
  CLOSED: { label: 'Liquidada', className: 'bg-emerald-100 text-emerald-800' },
}

const categorias: { value: TripExpenseCategory; label: string }[] = [
  { value: 'FUEL', label: 'Combustible' },
  { value: 'TOLL', label: 'Peaje' },
  { value: 'PER_DIEM', label: 'Viáticos' },
  { value: 'OTHER', label: 'Otro' },
]

const moneda = (value: string | number) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(value))

const fechaHora = (value: string) =>
  new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))

function DetalleLiquidacion({ viaje, onActualizado }: {
  viaje: TripSettlement
  onActualizado: (message: string) => void
}) {
  const [categoria, setCategoria] = useState<TripExpenseCategory>('FUEL')
  const [monto, setMonto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmarCierre, setConfirmarCierre] = useState(false)

  const registrarGasto = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setGuardando(true)
    setError(null)
    try {
      await registrarGastoViaje(viaje.trip_id, {
        category: categoria,
        amount: monto,
        description: descripcion.trim(),
      })
      setMonto('')
      setDescripcion('')
      onActualizado('Gasto agregado a la liquidación.')
    } catch (requestError) {
      setError(mensajeDeError(requestError))
    } finally {
      setGuardando(false)
    }
  }

  const cerrar = async () => {
    setGuardando(true)
    setError(null)
    try {
      await cerrarLiquidacion(viaje.trip_id)
      setConfirmarCierre(false)
      onActualizado('Liquidación cerrada. Los importes quedaron congelados.')
    } catch (requestError) {
      setError(mensajeDeError(requestError))
    } finally {
      setGuardando(false)
    }
  }

  const liquidada = viaje.settlement_status === 'CLOSED'

  return (
    <section className="space-y-4 rounded-xl border border-brand/20 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-navy">Detalle del viaje {viaje.trip_code}</h2>
          <p className="text-sm text-slate-600">{viaje.origin} → {viaje.destination}</p>
        </div>
        {liquidada && viaje.settlement_closed_at && (
          <p className="text-sm text-slate-500">Cerrada {fechaHora(viaje.settlement_closed_at)}</p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-surface p-3">
          <p className="text-xs text-slate-500">Ingresos por boletos pagados</p>
          <p className="mt-1 font-semibold text-navy">{moneda(viaje.income_total)}</p>
        </div>
        <div className="rounded-lg bg-surface p-3">
          <p className="text-xs text-slate-500">Gastos registrados</p>
          <p className="mt-1 font-semibold text-navy">{moneda(viaje.expense_total)}</p>
        </div>
        <div className="rounded-lg bg-surface p-3">
          <p className="text-xs text-slate-500">Neto del viaje</p>
          <p className="mt-1 font-semibold text-navy">{moneda(viaje.net_total)}</p>
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-navy">Gastos del viaje</h3>
        {viaje.expenses.length > 0 ? (
          <ul className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200">
            {viaje.expenses.map((gasto) => (
              <li key={gasto.id} className="flex flex-wrap justify-between gap-2 px-3 py-2 text-sm">
                <span>{gasto.category_label}: {gasto.description}</span>
                <span className="font-semibold">{moneda(gasto.amount)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Aún no se registran gastos.</p>
        )}
      </div>

      <ErrorBox message={error} />

      {!liquidada && (
        <>
          <form onSubmit={registrarGasto} className="grid gap-3 rounded-lg bg-surface p-4 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Concepto
              <select
                className={inputClass}
                value={categoria}
                onChange={(event) => setCategoria(event.target.value as TripExpenseCategory)}
              >
                {categorias.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Monto (S/)
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                className={inputClass}
                value={monto}
                onChange={(event) => setMonto(event.target.value)}
              />
            </label>
            <label className="text-sm font-medium text-slate-700 sm:col-span-2">
              Descripción
              <input
                required
                maxLength={255}
                className={inputClass}
                value={descripcion}
                onChange={(event) => setDescripcion(event.target.value)}
              />
            </label>
            <button type="submit" disabled={guardando} className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-light disabled:opacity-60 sm:col-span-2">
              {guardando ? 'Guardando...' : 'Agregar gasto'}
            </button>
          </form>

          {!confirmarCierre ? (
            <button
              type="button"
              disabled={guardando}
              className="rounded-lg border border-emerald-700 px-4 py-2.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-60"
              onClick={() => setConfirmarCierre(true)}
            >
              Cerrar liquidación
            </button>
          ) : (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
              <p className="text-sm text-amber-900">
                Al cerrar, los ingresos y gastos quedarán congelados y no podrán modificarse.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={guardando}
                  className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                  onClick={() => void cerrar()}
                >
                  {guardando ? 'Cerrando...' : 'Confirmar cierre'}
                </button>
                <button
                  type="button"
                  disabled={guardando}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                  onClick={() => setConfirmarCierre(false)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}

export function LiquidacionViajesPage() {
  const [filtros, setFiltros] = useState<TripSettlementFilters>({ search: '', status: '', page: 1 })
  const [busqueda, setBusqueda] = useState('')
  const [datos, setDatos] = useState<TripSettlementsPage | null>(null)
  const [seleccionadoId, setSeleccionadoId] = useState<number | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    let cancelado = false
    listarLiquidaciones(filtros)
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
  }, [filtros, recarga])

  const cambiarFiltros = (cambio: Partial<TripSettlementFilters>) => {
    setCargando(true)
    setFiltros((actuales) => ({ ...actuales, ...cambio, page: cambio.page ?? 1 }))
  }

  const buscar = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    cambiarFiltros({ search: busqueda.trim() })
    setSeleccionadoId(null)
  }

  const actualizar = (confirmacion: string) => {
    setMensaje(confirmacion)
    setError(null)
    setCargando(true)
    setRecarga((value) => value + 1)
  }

  const viajeSeleccionado = datos?.results.find((viaje) => viaje.trip_id === seleccionadoId) ?? null
  const paginaActual = filtros.page ?? 1
  const totalPaginas = Math.max(1, Math.ceil((datos?.count ?? 0) / 20))

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-light">Financiero</p>
          <h1 className="text-2xl font-bold text-navy">Liquidación de viajes</h1>
          <p className="mt-1 text-sm text-slate-600">
            Revisa ingresos por boletos pagados, registra gastos y cierra viajes finalizados.
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-navy hover:bg-white disabled:opacity-60"
          disabled={cargando}
          onClick={() => { setCargando(true); setRecarga((value) => value + 1) }}
        >
          Actualizar
        </button>
      </header>

      <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
        El ingreso se calcula con pagos simulados confirmados. No se aplican comisiones de conductores.
      </p>

      <ErrorBox message={error} />
      <OkBox message={mensaje} />

      <form onSubmit={buscar} className="grid gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:grid-cols-[1fr_220px_auto]">
        <input
          aria-label="Buscar liquidaciones"
          placeholder="Buscar por código o ruta"
          className={inputClass}
          value={busqueda}
          onChange={(event) => setBusqueda(event.target.value)}
        />
        <select
          aria-label="Filtrar por estado de liquidación"
          className={inputClass}
          value={filtros.status ?? ''}
          onChange={(event) => {
            cambiarFiltros({ status: event.target.value as TripSettlementFilters['status'] })
            setSeleccionadoId(null)
          }}
        >
          <option value="">Todos los estados</option>
          <option value="PENDING">Pendientes</option>
          <option value="DRAFT">En proceso</option>
          <option value="CLOSED">Liquidadas</option>
        </select>
        <button type="submit" className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-light">
          Buscar
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full min-w-[950px] text-left text-sm">
          <thead className="bg-surface text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Viaje</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Ingresos</th>
              <th className="px-3 py-2">Gastos</th>
              <th className="px-3 py-2">Neto</th>
              <th className="px-3 py-2">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {cargando && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">Cargando liquidaciones...</td></tr>}
            {!cargando && !error && datos?.results.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">No hay viajes finalizados que coincidan con los filtros.</td></tr>
            )}
            {!cargando && datos?.results.map((viaje) => {
              const estado = estados[viaje.settlement_status]
              return (
                <tr key={viaje.trip_id} className="border-t border-slate-200 align-top">
                  <td className="px-3 py-3">
                    <p className="font-medium text-navy">{viaje.trip_code}</p>
                    <p>{viaje.origin} → {viaje.destination}</p>
                    <p className="mt-1 text-xs text-slate-500">{fechaHora(viaje.departure_at)}</p>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${estado.className}`}>
                      {estado.label}
                    </span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">{moneda(viaje.income_total)}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{moneda(viaje.expense_total)}</td>
                  <td className="px-3 py-3 whitespace-nowrap font-semibold">{moneda(viaje.net_total)}</td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-navy hover:bg-surface"
                      onClick={() => setSeleccionadoId((current) => current === viaje.trip_id ? null : viaje.trip_id)}
                    >
                      {seleccionadoId === viaje.trip_id ? 'Ocultar' : 'Gestionar'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
        <span>{datos?.count ?? 0} viaje(s) finalizado(s)</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={paginaActual <= 1 || cargando}
            className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
            onClick={() => cambiarFiltros({ page: paginaActual - 1 })}
          >
            Anterior
          </button>
          <span>Página {paginaActual} de {totalPaginas}</span>
          <button
            type="button"
            disabled={paginaActual >= totalPaginas || cargando}
            className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
            onClick={() => cambiarFiltros({ page: paginaActual + 1 })}
          >
            Siguiente
          </button>
        </div>
      </div>

      {viajeSeleccionado && (
        <DetalleLiquidacion
          key={viajeSeleccionado.trip_id}
          viaje={viajeSeleccionado}
          onActualizado={actualizar}
        />
      )}
    </div>
  )
}
