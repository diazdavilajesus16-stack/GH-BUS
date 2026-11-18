import { useAuth } from '@/hooks/useAuth'

// Indicadores definidos en la especificación. Los valores se conectarán a la API
// cuando existan los módulos que los generan; por ahora NO se muestran cifras inventadas.
const INDICADORES = [
  'Viajes programados',
  'Viajes en curso',
  'Vehículos disponibles',
  'Conductores activos',
  'Boletos vendidos hoy',
  'Ingresos del día',
  'Reservas pendientes',
  'Ocupación',
]

export function DashboardPage() {
  const { user } = useAuth()
  const sinRol = !!user && user.roles.length === 0

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-navy">Panel principal</h1>
        <p className="text-sm text-slate-500">Resumen operativo de GH BUS.</p>
      </div>

      {sinRol && (
        <p role="status" className="rounded-xl border border-gold/60 bg-gold/15 px-4 py-3 text-sm text-navy">
          Tu cuenta todavía no tiene un rol asignado, por eso el menú está vacío. La gestión de roles y permisos se
          habilita en el paso 9 del desarrollo.
        </p>
      )}

      <section aria-label="Indicadores" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {INDICADORES.map((nombre) => (
          <article key={nombre} className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm font-medium text-slate-500">{nombre}</p>
            <p className="mt-2 text-3xl font-bold text-navy">—</p>
            <p className="mt-1 text-xs text-slate-400">Pendiente de conectar</p>
          </article>
        ))}
      </section>
    </div>
  )
}
