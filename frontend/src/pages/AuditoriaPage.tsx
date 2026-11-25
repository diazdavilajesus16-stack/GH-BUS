import { useEffect, useState, type FormEvent } from 'react'
import { ErrorBox, inputClass, primaryButton } from '@/components/Field'
import { listarAuditoria, type FiltrosAuditoria, type PaginaAuditoria, type RegistroAuditoria } from '@/services/auditApi'
import { mensajeDeError } from '@/services/http'

const opcionesAccion = [
  ['', 'Todas las acciones'],
  ['LOGIN_FALLIDO', 'Inicio fallido'],
  ['LOGIN', 'Inicio de sesión'],
  ['LOGOUT', 'Cierre de sesión'],
  ['PERMISO_DENEGADO', 'Permiso denegado'],
  ['CREAR', 'Creación'],
  ['MODIFICAR', 'Modificación'],
  ['ELIMINAR', 'Eliminación'],
  ['CANCELAR', 'Cancelación'],
  ['ANULAR', 'Anulación'],
  ['CIERRE_CAJA', 'Cierre de caja'],
  ['OTRO', 'Otro'],
] as const

const fechaHora = (valor: string) =>
  new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(valor))

function DetalleCambios({ registro }: { registro: RegistroAuditoria }) {
  const detalle = JSON.stringify(registro.cambios, null, 2)
  return (
    <details className="max-w-sm">
      <summary className="cursor-pointer text-xs font-medium text-brand">Ver detalle</summary>
      <div className="mt-2 space-y-1 text-xs text-slate-600">
        <p>Entidad: {registro.entidad}{registro.entidad_id ? ` #${registro.entidad_id}` : ''}</p>
        {registro.user_agent && <p className="break-all">Dispositivo: {registro.user_agent}</p>}
        {detalle !== 'null' && <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2">{detalle}</pre>}
      </div>
    </details>
  )
}

export function AuditoriaPage() {
  const [formulario, setFormulario] = useState<FiltrosAuditoria>({ desde: '', hasta: '', accion: '', entidad: '', search: '' })
  const [filtros, setFiltros] = useState<FiltrosAuditoria>({ page: 1 })
  const [pagina, setPagina] = useState<PaginaAuditoria | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    listarAuditoria(filtros)
      .then((resultado) => {
        if (!cancelado) {
          setPagina(resultado)
          setError(null)
        }
      })
      .catch((requestError: unknown) => {
        if (!cancelado) {
          setPagina(null)
          setError(mensajeDeError(requestError))
        }
      })
      .finally(() => {
        if (!cancelado) setCargando(false)
      })
    return () => { cancelado = true }
  }, [filtros])

  const aplicarFiltros = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (formulario.desde && formulario.hasta && formulario.desde > formulario.hasta) {
      setError('La fecha inicial debe ser igual o anterior a la fecha final.')
      return
    }
    setError(null)
    setCargando(true)
    setFiltros({ ...formulario, page: 1 })
  }

  const cambiarPagina = (page: number) => {
    setCargando(true)
    setFiltros((actual) => ({ ...actual, page }))
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-light">Seguridad y control</p>
        <h1 className="text-2xl font-bold text-navy">Bitácora de auditoría</h1>
        <p className="mt-1 text-sm text-slate-500">Consulta los accesos, intentos fallidos, permisos denegados y cambios registrados. Solo lectura.</p>
      </div>

      <form onSubmit={aplicarFiltros} className="grid gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:grid-cols-2 lg:grid-cols-6">
        <label className="text-xs font-medium text-slate-600">
          Desde
          <input aria-label="Desde" type="date" className={inputClass} value={formulario.desde ?? ''}
            onChange={(event) => setFormulario((actual) => ({ ...actual, desde: event.target.value }))} />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Hasta
          <input aria-label="Hasta" type="date" className={inputClass} value={formulario.hasta ?? ''}
            onChange={(event) => setFormulario((actual) => ({ ...actual, hasta: event.target.value }))} />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Acción
          <select aria-label="Acción" className={inputClass} value={formulario.accion ?? ''}
            onChange={(event) => setFormulario((actual) => ({ ...actual, accion: event.target.value }))}>
            {opcionesAccion.map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Entidad
          <input aria-label="Entidad" className={inputClass} placeholder="Ej. usuario, viaje"
            value={formulario.entidad ?? ''} onChange={(event) => setFormulario((actual) => ({ ...actual, entidad: event.target.value }))} />
        </label>
        <label className="text-xs font-medium text-slate-600 lg:col-span-2">
          Usuario, entidad o IP
          <input aria-label="Buscar usuario, entidad o IP" className={inputClass} placeholder="Texto de búsqueda"
            value={formulario.search ?? ''} onChange={(event) => setFormulario((actual) => ({ ...actual, search: event.target.value }))} />
        </label>
        <button type="submit" className={`${primaryButton} sm:w-auto lg:col-span-6 lg:justify-self-end`}>Aplicar filtros</button>
      </form>

      <ErrorBox message={error} />

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Acción</th>
              <th className="px-3 py-2">Usuario</th>
              <th className="px-3 py-2">IP</th>
              <th className="px-3 py-2">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {cargando && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Cargando bitácora...</td></tr>}
            {!cargando && pagina?.results.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">No hay registros con esos filtros.</td></tr>}
            {!cargando && pagina?.results.map((registro) => (
              <tr key={registro.id} className="border-t border-slate-200 align-top">
                <td className="whitespace-nowrap px-3 py-3">{fechaHora(registro.creado_en)}</td>
                <td className="px-3 py-3 font-medium">{opcionesAccion.find(([valor]) => valor === registro.accion)?.[1] ?? registro.accion}</td>
                <td className="px-3 py-3">{registro.usuario_nombre || 'Sistema'}</td>
                <td className="px-3 py-3">{registro.ip || '—'}</td>
                <td className="px-3 py-3"><DetalleCambios registro={registro} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>{pagina?.count ?? 0} registro(s)</span>
        <div className="flex items-center gap-2">
          <button type="button" disabled={!pagina?.previous} className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
            onClick={() => cambiarPagina(Math.max(1, (filtros.page ?? 1) - 1))}>Anterior</button>
          <span>Página {filtros.page ?? 1}</span>
          <button type="button" disabled={!pagina?.next} className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
            onClick={() => cambiarPagina((filtros.page ?? 1) + 1)}>Siguiente</button>
        </div>
      </div>
    </div>
  )
}
