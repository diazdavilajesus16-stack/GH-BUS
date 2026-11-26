import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ErrorBox, inputClass } from '@/components/Field'
import { mensajeDeError } from '@/services/http'
import {
  listarPasajeros,
  type PassengerFilters,
  type PassengerListItem,
  type PassengersPage,
} from '@/services/passengersApi'

const tipoDocumento: Record<PassengerListItem['document_type'], string> = {
  DNI: 'DNI',
  CE: 'Carné de extranjería',
  PASSPORT: 'Pasaporte',
}

const fecha = (value: string) =>
  new Intl.DateTimeFormat('es-PE', { dateStyle: 'short' }).format(new Date(value))

export function PasajerosPage() {
  const [filtros, setFiltros] = useState<PassengerFilters>({ search: '', page: 1 })
  const [busqueda, setBusqueda] = useState('')
  const [datos, setDatos] = useState<PassengersPage | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    let cancelado = false
    listarPasajeros(filtros)
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
    setCargando(true)
    setFiltros({ search: busqueda.trim(), page: 1 })
  }
  const cambiarPagina = (page: number) => {
    setCargando(true)
    setFiltros((current) => ({ ...current, page }))
  }

  const totalPaginas = Math.max(1, Math.ceil((datos?.count ?? 0) / 20))
  const paginaActual = filtros.page ?? 1

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-light">Comercial</p>
          <h1 className="text-2xl font-bold text-navy">Pasajeros</h1>
          <p className="mt-1 text-sm text-slate-600">Consulta los pasajeros registrados en ventas y reservas.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/panel/comercial/venta"
            className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-light"
          >
            Vender boleto
          </Link>
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-navy hover:bg-white disabled:opacity-60"
            disabled={cargando}
            onClick={() => { setCargando(true); setRecarga((value) => value + 1) }}
          >
            Actualizar
          </button>
        </div>
      </div>

      <form onSubmit={buscar} className="flex flex-wrap gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <input
          aria-label="Buscar pasajeros"
          placeholder="Buscar por nombre, documento, correo o teléfono"
          className={`${inputClass} mt-0 min-w-[240px] flex-1`}
          value={busqueda}
          onChange={(event) => setBusqueda(event.target.value)}
        />
        <button type="submit" className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-light">
          Buscar
        </button>
      </form>

      <ErrorBox message={error} />

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full min-w-[850px] text-left text-sm">
          <thead className="bg-surface text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Pasajero</th>
              <th className="px-3 py-2">Documento</th>
              <th className="px-3 py-2">Contacto</th>
              <th className="px-3 py-2">Boletos</th>
              <th className="px-3 py-2">Registrado</th>
            </tr>
          </thead>
          <tbody>
            {cargando && <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">Cargando pasajeros...</td></tr>}
            {!cargando && !error && datos?.results.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                  No hay pasajeros que coincidan con la búsqueda. Los pasajeros se registran al vender o reservar un boleto.
                </td>
              </tr>
            )}
            {!cargando && datos?.results.map((pasajero) => (
              <tr key={pasajero.id} className="border-t border-slate-200 align-top">
                <td className="px-3 py-3 font-medium text-navy">{pasajero.first_name} {pasajero.last_name}</td>
                <td className="px-3 py-3">
                  <p>{tipoDocumento[pasajero.document_type]}</p>
                  <p className="mt-1 text-xs text-slate-500">{pasajero.document_number}</p>
                </td>
                <td className="px-3 py-3">
                  <p>{pasajero.phone || 'Sin teléfono'}</p>
                  <p className="mt-1 text-xs text-slate-500">{pasajero.email || 'Sin correo'}</p>
                </td>
                <td className="px-3 py-3">{pasajero.ticket_count}</td>
                <td className="px-3 py-3 whitespace-nowrap">{fecha(pasajero.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
        <span>{datos?.count ?? 0} pasajero(s)</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={paginaActual <= 1 || cargando}
            className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
            onClick={() => cambiarPagina(paginaActual - 1)}
          >
            Anterior
          </button>
          <span>Página {paginaActual} de {totalPaginas}</span>
          <button
            type="button"
            disabled={paginaActual >= totalPaginas || cargando}
            className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
            onClick={() => cambiarPagina(paginaActual + 1)}
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  )
}
