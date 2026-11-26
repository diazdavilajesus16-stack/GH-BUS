import { useEffect, useState, type FormEvent } from 'react'
import { ErrorBox, inputClass, primaryButton } from '@/components/Field'
import { mensajeDeError } from '@/services/http'
import { obtenerReportes, type ReporteFiltros, type ReportesEstadisticas } from '@/services/reportsApi'

const moneda = (valor: string | number) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(valor))

function fechaLocal(fecha: Date): string {
  const desplazamiento = fecha.getTimezoneOffset() * 60_000
  return new Date(fecha.getTime() - desplazamiento).toISOString().slice(0, 10)
}

function rangoInicial(): ReporteFiltros {
  const hoy = new Date()
  return {
    desde: fechaLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1)),
    hasta: fechaLocal(hoy),
  }
}

function exportarCsv(datos: ReportesEstadisticas) {
  const filas: Array<Array<string | number>> = [
    ['Periodo', `${datos.desde} a ${datos.hasta}`],
    [],
    ['Área', 'Indicador', 'Valor'],
    ['Ventas', 'Operaciones', datos.ventas.cantidad],
    ['Ventas', 'Total de ventas simuladas', datos.ventas.total],
    ['Viajes', 'Total', datos.viajes.cantidad],
    ...datos.viajes.por_estado.map(({ nombre, cantidad }) => ['Viajes', nombre, cantidad]),
    ['Viajes', 'Capacidad total de asientos', datos.viajes.capacidad_total],
    ['Viajes', 'Boletos pagados o embarcados', datos.viajes.boletos_ocupados],
    ['Viajes', 'Ocupación porcentual', `${datos.viajes.ocupacion_porcentaje}%`],
    ['Finanzas', 'Ingresos manuales', datos.finanzas.ingresos_manuales],
    ['Finanzas', 'Egresos manuales', datos.finanzas.egresos_manuales],
    ['Finanzas', 'Liquidaciones cerradas', datos.finanzas.liquidaciones_cerradas],
    ['Finanzas', 'Ingresos liquidados', datos.finanzas.ingresos_liquidados],
    ['Finanzas', 'Egresos liquidados', datos.finanzas.egresos_liquidados],
    ['Finanzas', 'Neto liquidado', datos.finanzas.neto_liquidado],
    ['Finanzas', 'Liquidaciones pendientes', datos.finanzas.liquidaciones_pendientes],
    ['Embarque', 'Pasajeros abordados en el periodo', datos.embarque.abordados],
    ['Embarque', 'Boletos pagados pendientes de abordar', datos.embarque.pendientes],
  ]
  const csv = filas
    .map((fila) => fila.map((celda) => `"${String(celda).replaceAll('"', '""')}"`).join(';'))
    .join('\r\n')
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = `reportes-ghbus-${datos.desde}-${datos.hasta}.csv`
  enlace.click()
  URL.revokeObjectURL(url)
}

function Indicador({ etiqueta, valor, detalle }: { etiqueta: string; valor: string; detalle?: string }) {
  return (
    <article className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm font-medium text-slate-500">{etiqueta}</p>
      <p className="mt-2 text-2xl font-bold text-navy">{valor}</p>
      {detalle && <p className="mt-1 text-xs text-slate-500">{detalle}</p>}
    </article>
  )
}

export function ReportesPage() {
  const [rango, setRango] = useState(rangoInicial)
  const [aplicado, setAplicado] = useState(rangoInicial)
  const [datos, setDatos] = useState<ReportesEstadisticas | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    obtenerReportes(aplicado)
      .then((resultado) => {
        if (!cancelado) {
          setDatos(resultado)
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
  }, [aplicado])

  const aplicarFiltros = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (rango.desde > rango.hasta) {
      setError('La fecha inicial debe ser igual o anterior a la fecha final.')
      return
    }
    setError(null)
    setCargando(true)
    setAplicado({ ...rango })
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-light">Seguridad y control</p>
          <h1 className="text-2xl font-bold text-navy">Reportes y estadísticas</h1>
          <p className="mt-1 text-sm text-slate-500">Resumen de ventas simuladas, operación, finanzas y embarque.</p>
        </div>
        <form onSubmit={aplicarFiltros} className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium text-slate-600">
            Desde
            <input aria-label="Desde" type="date" className={inputClass} value={rango.desde}
              onChange={(event) => setRango((actual) => ({ ...actual, desde: event.target.value }))} />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Hasta
            <input aria-label="Hasta" type="date" className={inputClass} value={rango.hasta}
              onChange={(event) => setRango((actual) => ({ ...actual, hasta: event.target.value }))} />
          </label>
          <button type="submit" className={`${primaryButton} sm:w-auto`}>Aplicar</button>
        </form>
      </div>

      <ErrorBox message={error} />

      {cargando && <p className="rounded-xl bg-white p-6 text-center text-sm text-slate-500">Cargando estadísticas...</p>}
      {!cargando && !error && !datos && <p className="rounded-xl bg-white p-6 text-center text-sm text-slate-500">No hay datos para mostrar.</p>}

      {!cargando && datos && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500">Periodo consultado: {datos.desde} al {datos.hasta}</p>
            <button type="button" className={`${primaryButton} sm:w-auto`} onClick={() => exportarCsv(datos)}>
              Descargar CSV
            </button>
          </div>

          <section aria-label="Ventas y viajes" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Indicador etiqueta="Ventas simuladas" valor={moneda(datos.ventas.total)} detalle={`${datos.ventas.cantidad} operación(es)`} />
            <Indicador etiqueta="Viajes" valor={String(datos.viajes.cantidad)} />
            <Indicador etiqueta="Ocupación de asientos" valor={`${datos.viajes.ocupacion_porcentaje}%`}
              detalle={`${datos.viajes.boletos_ocupados} de ${datos.viajes.capacidad_total} asientos`} />
            <Indicador etiqueta="Pasajeros abordados" valor={String(datos.embarque.abordados)} />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <h2 className="font-semibold text-navy">Viajes por estado</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500">
                    <tr><th className="py-2">Estado</th><th className="py-2 text-right">Cantidad</th></tr>
                  </thead>
                  <tbody>
                    {datos.viajes.por_estado.map((estado) => (
                      <tr key={estado.estado} className="border-t border-slate-200">
                        <td className="py-2">{estado.nombre}</td>
                        <td className="py-2 text-right font-medium">{estado.cantidad}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <h2 className="font-semibold text-navy">Caja y liquidaciones</h2>
              <dl className="mt-3 divide-y divide-slate-200 text-sm">
                <div className="flex justify-between gap-3 py-2"><dt>Ingresos manuales</dt><dd className="font-medium">{moneda(datos.finanzas.ingresos_manuales)}</dd></div>
                <div className="flex justify-between gap-3 py-2"><dt>Egresos manuales</dt><dd className="font-medium">{moneda(datos.finanzas.egresos_manuales)}</dd></div>
                <div className="flex justify-between gap-3 py-2"><dt>Liquidaciones cerradas</dt><dd className="font-medium">{datos.finanzas.liquidaciones_cerradas}</dd></div>
                <div className="flex justify-between gap-3 py-2"><dt>Ingresos liquidados</dt><dd className="font-medium">{moneda(datos.finanzas.ingresos_liquidados)}</dd></div>
                <div className="flex justify-between gap-3 py-2"><dt>Egresos liquidados</dt><dd className="font-medium">{moneda(datos.finanzas.egresos_liquidados)}</dd></div>
                <div className="flex justify-between gap-3 py-2"><dt>Neto liquidado</dt><dd className="font-semibold text-navy">{moneda(datos.finanzas.neto_liquidado)}</dd></div>
                <div className="flex justify-between gap-3 py-2"><dt>Liquidaciones pendientes</dt><dd className="font-medium">{datos.finanzas.liquidaciones_pendientes}</dd></div>
              </dl>
            </article>
          </section>

          <section aria-label="Estado de embarque" className="grid gap-3 sm:grid-cols-2">
            <Indicador etiqueta="Boletos pagados pendientes de abordar" valor={String(datos.embarque.pendientes)}
              detalle="Viajes cuya salida programada cae dentro del periodo" />
            <Indicador etiqueta="Capacidad total de asientos" valor={String(datos.viajes.capacidad_total)}
              detalle="Suma de la capacidad de los vehículos asignados" />
          </section>
        </>
      )}
    </div>
  )
}
