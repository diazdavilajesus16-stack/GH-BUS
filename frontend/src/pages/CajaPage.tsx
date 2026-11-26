import { useEffect, useState, type FormEvent } from 'react'
import { ErrorBox, OkBox, inputClass, primaryButton } from '@/components/Field'
import { mensajeDeError } from '@/services/http'
import {
  abrirCaja,
  cerrarCaja,
  listarMovimientosCaja,
  obtenerResumenCaja,
  registrarMovimientoCaja,
  type CashMovement,
  type CashMovementFilters,
  type CashMovementType,
  type CashMovementsPage,
  type CashSummary,
} from '@/services/cashApi'

const moneda = (value: string | number) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(value))

const fechaHora = (value: string) =>
  new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))

function FilaMovimiento({ movimiento }: { movimiento: CashMovement }) {
  const ingreso = movimiento.movement_type === 'INCOME'
  return (
    <tr className="border-t border-slate-200 align-top">
      <td className="px-3 py-3 whitespace-nowrap">{fechaHora(movimiento.created_at)}</td>
      <td className="px-3 py-3">
        <p className={`font-semibold ${ingreso ? 'text-emerald-700' : 'text-red-700'}`}>
          {ingreso ? 'Ingreso' : 'Egreso'}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {movimiento.source === 'SALE' ? 'Venta simulada' : 'Manual'}
        </p>
      </td>
      <td className="px-3 py-3">{movimiento.cashier_name || 'Venta sin caja asignada'}</td>
      <td className="px-3 py-3">
        <p>{movimiento.description}</p>
        {movimiento.reservation && (
          <p className="mt-1 text-xs text-slate-500">Reserva #{movimiento.reservation.slice(0, 8).toUpperCase()}</p>
        )}
      </td>
      <td className={`px-3 py-3 whitespace-nowrap font-semibold ${ingreso ? 'text-emerald-700' : 'text-red-700'}`}>
        {ingreso ? '+' : '−'}{moneda(movimiento.amount)}
      </td>
    </tr>
  )
}

export function CajaPage() {
  const [filtros, setFiltros] = useState<CashMovementFilters>({ search: '', movement_type: '', page: 1 })
  const [busqueda, setBusqueda] = useState('')
  const [resumen, setResumen] = useState<CashSummary | null>(null)
  const [movimientos, setMovimientos] = useState<CashMovementsPage | null>(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)
  const [montoApertura, setMontoApertura] = useState('0.00')
  const [tipoMovimiento, setTipoMovimiento] = useState<CashMovementType>('INCOME')
  const [montoMovimiento, setMontoMovimiento] = useState('')
  const [descripcionMovimiento, setDescripcionMovimiento] = useState('')
  const [montoCierre, setMontoCierre] = useState('')

  useEffect(() => {
    let cancelado = false
    Promise.all([obtenerResumenCaja(), listarMovimientosCaja(filtros)])
      .then(([cashSummary, movementPage]) => {
        if (!cancelado) {
          setResumen(cashSummary)
          setMovimientos(movementPage)
          setError(null)
        }
      })
      .catch((requestError: unknown) => {
        if (!cancelado) {
          setResumen(null)
          setMovimientos(null)
          setError(mensajeDeError(requestError))
        }
      })
      .finally(() => {
        if (!cancelado) setCargando(false)
      })
    return () => { cancelado = true }
  }, [filtros, recarga])

  const recargar = (confirmacion: string) => {
    setMensaje(confirmacion)
    setError(null)
    setCargando(true)
    setRecarga((value) => value + 1)
  }

  const cambiarFiltros = (cambio: Partial<CashMovementFilters>) => {
    setCargando(true)
    setFiltros((actuales) => ({ ...actuales, ...cambio, page: cambio.page ?? 1 }))
  }

  const buscar = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    cambiarFiltros({ search: busqueda.trim() })
  }

  const ejecutar = async (accion: () => Promise<void>) => {
    setGuardando(true)
    setError(null)
    setMensaje(null)
    try {
      await accion()
    } catch (requestError) {
      setError(mensajeDeError(requestError))
    } finally {
      setGuardando(false)
    }
  }

  const abrir = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void ejecutar(async () => {
      await abrirCaja(montoApertura)
      recargar('Caja abierta correctamente.')
    })
  }

  const registrar = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void ejecutar(async () => {
      await registrarMovimientoCaja({
        movement_type: tipoMovimiento,
        amount: montoMovimiento,
        description: descripcionMovimiento.trim(),
      })
      setMontoMovimiento('')
      setDescripcionMovimiento('')
      recargar('Movimiento registrado correctamente.')
    })
  }

  const cerrar = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void ejecutar(async () => {
      const resultado = await cerrarCaja(montoCierre)
      setMontoCierre('')
      recargar(`Caja cerrada. Diferencia: ${moneda(resultado.difference)}.`)
    })
  }

  const cajaActual = resumen?.current_register ?? null
  const paginaActual = filtros.page ?? 1
  const totalPaginas = Math.max(1, Math.ceil((movimientos?.count ?? 0) / 20))
  const diferenciaCierre = montoCierre && cajaActual
    ? Number(montoCierre) - Number(cajaActual.expected_amount)
    : null

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-light">Financiero</p>
          <h1 className="text-2xl font-bold text-navy">Caja y movimientos</h1>
          <p className="mt-1 text-sm text-slate-600">Controla aperturas, ingresos, egresos y cierres de caja.</p>
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

      <ErrorBox message={error} />
      <OkBox message={mensaje} />

      {cargando && !resumen && <p className="rounded-lg bg-white p-6 text-center text-slate-500">Cargando caja...</p>}

      {!cargando && resumen && !cajaActual && (
        <form onSubmit={abrir} className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-navy">Abrir caja</h2>
          <p className="mt-1 text-sm text-slate-600">Ingresa el efectivo inicial disponible.</p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="min-w-[220px] flex-1 text-sm font-medium text-slate-700">
              Monto de apertura (S/)
              <input
                type="number"
                min="0"
                step="0.01"
                required
                className={inputClass}
                value={montoApertura}
                onChange={(event) => setMontoApertura(event.target.value)}
              />
            </label>
            <button type="submit" disabled={guardando} className={`${primaryButton} sm:w-auto`}>
              {guardando ? 'Abriendo...' : 'Abrir caja'}
            </button>
          </div>
        </form>
      )}

      {cajaActual && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Monto de apertura', cajaActual.opening_amount],
              ['Ingresos', cajaActual.income_total],
              ['Egresos', cajaActual.expense_total],
              ['Saldo esperado', cajaActual.expected_amount],
            ].map(([label, amount]) => (
              <article key={label} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <p className="text-sm text-slate-500">{label}</p>
                <p className="mt-1 text-xl font-bold text-navy">{moneda(amount)}</p>
              </article>
            ))}
          </section>

          <p className="text-sm text-slate-500">Caja abierta {fechaHora(cajaActual.opened_at)}</p>

          <section className="grid gap-4 lg:grid-cols-2">
            <form onSubmit={registrar} className="space-y-3 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <h2 className="text-lg font-semibold text-navy">Registrar movimiento manual</h2>
              <label className="block text-sm font-medium text-slate-700">
                Tipo
                <select
                  className={inputClass}
                  value={tipoMovimiento}
                  onChange={(event) => setTipoMovimiento(event.target.value as CashMovementType)}
                >
                  <option value="INCOME">Ingreso</option>
                  <option value="EXPENSE">Egreso</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Monto (S/)
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  className={inputClass}
                  value={montoMovimiento}
                  onChange={(event) => setMontoMovimiento(event.target.value)}
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Descripción
                <input
                  required
                  maxLength={255}
                  className={inputClass}
                  value={descripcionMovimiento}
                  onChange={(event) => setDescripcionMovimiento(event.target.value)}
                />
              </label>
              <button type="submit" disabled={guardando} className={primaryButton}>
                {guardando ? 'Guardando...' : 'Registrar movimiento'}
              </button>
            </form>

            <form onSubmit={cerrar} className="space-y-3 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <h2 className="text-lg font-semibold text-navy">Cerrar caja</h2>
              <p className="text-sm text-slate-600">Cuenta el efectivo y compáralo con el saldo esperado.</p>
              <label className="block text-sm font-medium text-slate-700">
                Efectivo contado (S/)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  className={inputClass}
                  value={montoCierre}
                  onChange={(event) => setMontoCierre(event.target.value)}
                />
              </label>
              {diferenciaCierre !== null && Number.isFinite(diferenciaCierre) && (
                <p className="text-sm text-slate-600">
                  Diferencia estimada: <strong>{moneda(diferenciaCierre)}</strong>
                </p>
              )}
              <button type="submit" disabled={guardando} className="w-full rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60">
                {guardando ? 'Cerrando...' : 'Cerrar caja'}
              </button>
            </form>
          </section>
        </>
      )}

      {resumen && resumen.open_registers.length > 0 && (
        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-navy">Cajas abiertas</h2>
          <ul className="mt-3 divide-y divide-slate-200">
            {resumen.open_registers.map((caja) => (
              <li key={caja.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                <span>{caja.owner_name} · abierta {fechaHora(caja.opened_at)}</span>
                <span className="font-semibold">{moneda(caja.expected_amount)} esperado</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {resumen && resumen.unassigned_sales.count > 0 && (
        <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
          Hay {resumen.unassigned_sales.count} venta(s) simulada(s) sin caja asignada por un total de {moneda(resumen.unassigned_sales.total)}.
        </p>
      )}

      <form onSubmit={buscar} className="grid gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:grid-cols-[1fr_220px_auto]">
        <input
          aria-label="Buscar movimientos"
          placeholder="Buscar descripción o cajero"
          className={inputClass}
          value={busqueda}
          onChange={(event) => setBusqueda(event.target.value)}
        />
        <select
          aria-label="Filtrar por tipo de movimiento"
          className={inputClass}
          value={filtros.movement_type ?? ''}
          onChange={(event) => cambiarFiltros({ movement_type: event.target.value as CashMovementType | '' })}
        >
          <option value="">Todos los movimientos</option>
          <option value="INCOME">Ingresos</option>
          <option value="EXPENSE">Egresos</option>
        </select>
        <button type="submit" className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-light">
          Buscar
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full min-w-[850px] text-left text-sm">
          <thead className="bg-surface text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Caja / Cajero</th>
              <th className="px-3 py-2">Descripción</th>
              <th className="px-3 py-2">Importe</th>
            </tr>
          </thead>
          <tbody>
            {cargando && <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">Cargando movimientos...</td></tr>}
            {!cargando && !error && movimientos?.results.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">Todavía no hay movimientos de caja.</td></tr>
            )}
            {!cargando && movimientos?.results.map((movimiento) => (
              <FilaMovimiento key={movimiento.id} movimiento={movimiento} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
        <span>{movimientos?.count ?? 0} movimiento(s)</span>
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
    </div>
  )
}
