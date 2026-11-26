import { useEffect, useState, type FormEvent } from 'react'
import { ErrorBox, inputClass, OkBox } from '@/components/Field'
import { mensajeDeError } from '@/services/http'
import {
  confirmarPagoEfectivo,
  listarReservas,
  type ReservationFilters,
  type ReservationListItem,
  type ReservationStatus,
  type ReservationsPage,
} from '@/services/reservationsAdminApi'

const estados: Record<ReservationStatus, { label: string; className: string }> = {
  PENDING: { label: 'Pendiente de pago', className: 'bg-amber-100 text-amber-800' },
  CONFIRMED: { label: 'Confirmada', className: 'bg-emerald-100 text-emerald-800' },
  EXPIRED: { label: 'Expirada', className: 'bg-slate-200 text-slate-700' },
  CANCELLED: { label: 'Cancelada', className: 'bg-red-100 text-red-800' },
}

const fechaHora = (value: string) =>
  new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))

const moneda = (value: string) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(value))

function FilaReserva({
  reserva,
  confirmarPago,
  pagando,
}: {
  reserva: ReservationListItem
  confirmarPago: (reserva: ReservationListItem) => void
  pagando: boolean
}) {
  const estado = estados[reserva.status]
  const metodoPago = {
    YAPE: 'Yape (simulado)',
    VISA: 'Visa (simulado)',
    CASH: 'Efectivo en caja',
    '': '—',
  }[reserva.payment_method]
  return (
    <tr className="border-t border-slate-200 align-top">
      <td className="px-3 py-3">
        <p className="font-medium text-navy">#{reserva.id.slice(0, 8).toUpperCase()}</p>
        <p className="mt-1 text-xs text-slate-500">Creada {fechaHora(reserva.created_at)}</p>
      </td>
      <td className="px-3 py-3">
        <p className="font-medium text-navy">{reserva.trip_code}</p>
        <p>{reserva.origin} → {reserva.destination}</p>
        <p className="mt-1 text-xs text-slate-500">{fechaHora(reserva.departure_at)}</p>
      </td>
      <td className="px-3 py-3">{reserva.passenger_name || 'Sin datos de pasajero'}</td>
      <td className="px-3 py-3">{reserva.seat_numbers.length ? reserva.seat_numbers.join(', ') : '—'}</td>
      <td className="px-3 py-3 whitespace-nowrap">{moneda(reserva.total_amount)}</td>
      <td className="px-3 py-3">
        <span className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${estado.className}`}>
          {estado.label}
        </span>
      </td>
      <td className="px-3 py-3">{metodoPago}</td>
      <td className="px-3 py-3">
        {reserva.status === 'PENDING' && reserva.payment_method === 'CASH' && (
          <button
            type="button"
            disabled={pagando}
            className="whitespace-nowrap rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            onClick={() => confirmarPago(reserva)}
          >
            {pagando ? 'Registrando...' : 'Confirmar efectivo'}
          </button>
        )}
      </td>
    </tr>
  )
}

export function ReservasPage() {
  const [filtros, setFiltros] = useState<ReservationFilters>({ search: '', status: '', page: 1 })
  const [busqueda, setBusqueda] = useState('')
  const [datos, setDatos] = useState<ReservationsPage | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    let cancelado = false
    listarReservas(filtros)
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

  const buscar = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    actualizarFiltros({ search: busqueda.trim(), page: 1 })
  }
  const actualizarFiltros = (cambio: Partial<ReservationFilters>) => {
    setCargando(true)
    setFiltros((current) => ({ ...current, ...cambio }))
  }
  const cambiarEstado = (status: ReservationStatus | '') => actualizarFiltros({ status, page: 1 })

  const confirmarPago = async (reserva: ReservationListItem) => {
    setConfirmandoId(reserva.id)
    setError(null)
    setMensaje(null)
    try {
      await confirmarPagoEfectivo(reserva.id)
      setMensaje(`Pago en efectivo de la reserva ${reserva.id.slice(0, 8).toUpperCase()} registrado en caja.`)
      setCargando(true)
      setRecarga((value) => value + 1)
    } catch (requestError: unknown) {
      setError(mensajeDeError(requestError))
    } finally {
      setConfirmandoId(null)
    }
  }

  const totalPaginas = Math.max(1, Math.ceil((datos?.count ?? 0) / 20))
  const paginaActual = filtros.page ?? 1

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-light">Comercial</p>
          <h1 className="text-2xl font-bold text-navy">Reservas</h1>
          <p className="mt-1 text-sm text-slate-600">Consulta las reservas y los boletos asociados a cada viaje.</p>
        </div>
        <button
          type="button"
          className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-navy hover:bg-white disabled:opacity-60"
          disabled={cargando}
          onClick={() => { setCargando(true); setRecarga((value) => value + 1) }}
        >
          Actualizar
        </button>
      </div>

      <form onSubmit={buscar} className="grid gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:grid-cols-[1fr_220px_auto]">
        <input
          aria-label="Buscar reservas"
          placeholder="Buscar por pasajero, viaje o ruta"
          className={inputClass}
          value={busqueda}
          onChange={(event) => setBusqueda(event.target.value)}
        />
        <select
          aria-label="Filtrar por estado"
          className={inputClass}
          value={filtros.status ?? ''}
          onChange={(event) => cambiarEstado(event.target.value as ReservationStatus | '')}
        >
          <option value="">Todos los estados</option>
          {Object.entries(estados).map(([status, value]) => (
            <option key={status} value={status}>{value.label}</option>
          ))}
        </select>
        <button type="submit" className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-light">
          Buscar
        </button>
      </form>

      <OkBox message={mensaje} />
      <ErrorBox message={error} />

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="bg-surface text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Reserva</th>
              <th className="px-3 py-2">Viaje</th>
              <th className="px-3 py-2">Pasajero</th>
              <th className="px-3 py-2">Asientos</th>
              <th className="px-3 py-2">Total</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Método de pago</th>
              <th className="px-3 py-2">Acción</th>
            </tr>
          </thead>
          <tbody>
            {cargando && <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-500">Cargando reservas...</td></tr>}
            {!cargando && !error && datos?.results.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-500">No hay reservas que coincidan con los filtros.</td></tr>
            )}
            {!cargando && datos?.results.map((reserva) => (
              <FilaReserva
                key={reserva.id}
                reserva={reserva}
                confirmarPago={(item) => void confirmarPago(item)}
                pagando={confirmandoId === reserva.id}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
        <span>{datos?.count ?? 0} reserva(s)</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={paginaActual <= 1 || cargando}
            className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
            onClick={() => actualizarFiltros({ page: paginaActual - 1 })}
          >
            Anterior
          </button>
          <span>Página {paginaActual} de {totalPaginas}</span>
          <button
            type="button"
            disabled={paginaActual >= totalPaginas || cargando}
            className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
            onClick={() => actualizarFiltros({ page: paginaActual + 1 })}
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  )
}
