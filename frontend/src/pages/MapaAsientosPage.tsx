import { useEffect, useState } from 'react'
import { SeatMap } from '@/components/SeatMap'
import { ErrorBox } from '@/components/Field'
import { reservationsApi, type SeatMapResponse } from '@/services/reservations'
import { mensajeDeError } from '@/services/http'
import { listarViajes, type ViajeApi } from '@/services/tripsApi'
import { formatDateTime } from '@/utils/forms'

const etiquetaViaje = (viaje: ViajeApi) =>
  `${viaje.codigo} · ${viaje.origen_nombre} → ${viaje.destino_nombre} · ${formatDateTime(viaje.salida_programada)}`

export function MapaAsientosPage() {
  const [viajes, setViajes] = useState<ViajeApi[]>([])
  const [viajeId, setViajeId] = useState('')
  const [mapa, setMapa] = useState<SeatMapResponse | null>(null)
  const [cargandoViajes, setCargandoViajes] = useState(true)
  const [cargandoMapa, setCargandoMapa] = useState(false)
  const [errorViajes, setErrorViajes] = useState<string | null>(null)
  const [errorMapa, setErrorMapa] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    let cancelado = false
    listarViajes({
      estado: 'PROGRAMADO,CONFIRMADO',
      salida_desde: new Date().toISOString(),
      page_size: 200,
    })
      .then((response) => {
        if (cancelado) return
        setViajes(response.results)
        setErrorViajes(null)
        if (response.results.length > 0) {
          setViajeId((actual) =>
            response.results.some((viaje) => String(viaje.id) === actual)
              ? actual
              : String(response.results[0].id),
          )
          setCargandoMapa(true)
        } else {
          setViajeId('')
          setMapa(null)
        }
      })
      .catch((requestError: unknown) => {
        if (!cancelado) setErrorViajes(mensajeDeError(requestError))
      })
      .finally(() => {
        if (!cancelado) setCargandoViajes(false)
      })
    return () => { cancelado = true }
  }, [recarga])

  useEffect(() => {
    if (!viajeId) return
    let cancelado = false
    reservationsApi.getSeatMap(Number(viajeId))
      .then((response) => {
        if (!cancelado) {
          setMapa(response)
          setErrorMapa(null)
        }
      })
      .catch((requestError: unknown) => {
        if (!cancelado) {
          setMapa(null)
          setErrorMapa(mensajeDeError(requestError, 'No se pudo cargar el mapa de asientos.'))
        }
      })
      .finally(() => {
        if (!cancelado) setCargandoMapa(false)
      })
    return () => { cancelado = true }
  }, [viajeId, recarga])

  const viajeSeleccionado = viajes.find((viaje) => String(viaje.id) === viajeId)
  const ocupados = mapa?.seats.filter((seat) => seat.status === 'OCCUPIED').length ?? 0
  const disponibles = mapa ? mapa.seats.length - ocupados : 0

  const seleccionarViaje = (id: string) => {
    setViajeId(id)
    setMapa(null)
    setErrorMapa(null)
    setCargandoMapa(Boolean(id))
  }

  const actualizarMapa = () => {
    setMapa(null)
    setErrorMapa(null)
    setCargandoMapa(Boolean(viajeId))
    setRecarga((value) => value + 1)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-light">Comercial</p>
          <h1 className="text-2xl font-bold text-navy">Mapa de asientos</h1>
          <p className="mt-1 text-sm text-slate-600">Consulta la disponibilidad de asientos por viaje.</p>
        </div>
        <button
          type="button"
          className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-navy hover:bg-white disabled:opacity-60"
          disabled={!viajeId || cargandoMapa}
          onClick={actualizarMapa}
        >
          Actualizar mapa
        </button>
      </div>

      <ErrorBox message={errorViajes} />

      <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <label htmlFor="viaje-mapa" className="block text-sm font-medium text-slate-700">Selecciona un viaje</label>
        <select
          id="viaje-mapa"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-light focus:ring-2 focus:ring-brand-light/30"
          value={viajeId}
          disabled={cargandoViajes || viajes.length === 0}
          onChange={(event) => seleccionarViaje(event.target.value)}
        >
          <option value="">
            {cargandoViajes ? 'Cargando viajes...' : viajes.length ? 'Selecciona un viaje' : 'No hay viajes futuros disponibles'}
          </option>
          {viajes.map((viaje) => <option key={viaje.id} value={viaje.id}>{etiquetaViaje(viaje)}</option>)}
        </select>
      </section>

      {viajeSeleccionado && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs uppercase text-slate-500">Ruta</p>
            <p className="mt-1 font-semibold text-navy">{viajeSeleccionado.origen_nombre} → {viajeSeleccionado.destino_nombre}</p>
            <p className="text-sm text-slate-500">{viajeSeleccionado.codigo}</p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs uppercase text-slate-500">Salida</p>
            <p className="mt-1 font-semibold text-navy">{formatDateTime(viajeSeleccionado.salida_programada)}</p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs uppercase text-slate-500">Asientos libres</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">{cargandoMapa ? '—' : disponibles}</p>
          </div>
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p className="text-xs uppercase text-slate-500">Asientos ocupados</p>
            <p className="mt-1 text-2xl font-bold text-slate-700">{cargandoMapa ? '—' : ocupados}</p>
          </div>
        </section>
      )}

      <ErrorBox message={errorMapa} />

      {cargandoMapa && <p className="rounded-xl bg-white p-8 text-center text-slate-500 shadow-sm">Cargando mapa de asientos...</p>}
      {!cargandoMapa && !errorViajes && viajes.length === 0 && (
        <p className="rounded-xl bg-white p-8 text-center text-slate-500 shadow-sm">No hay viajes futuros programados o confirmados.</p>
      )}
      {!cargandoMapa && mapa && (
        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200" aria-label="Disponibilidad de asientos">
          <SeatMap seats={mapa.seats} selectedSeats={[]} readOnly />
        </section>
      )}
    </div>
  )
}
