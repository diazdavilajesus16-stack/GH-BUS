import { Link } from 'react-router-dom'
import { DashboardIcon, type DashboardIconName } from '@/components/DashboardIcon'
import { useAuth } from '@/hooks/useAuth'
import { visibleModules } from '@/config/navigation'

const INDICADORES: {
  nombre: string
  detalle: string
  ruta: string
  icono: DashboardIconName
  color: 'blue' | 'purple' | 'cyan' | 'gold'
}[] = [
  {
    nombre: 'Viajes programados',
    detalle: 'Pendientes de procesar',
    ruta: '/panel/operacion/programacion',
    icono: 'calendar',
    color: 'blue',
  },
  {
    nombre: 'Viajes en curso',
    detalle: 'Seguimiento de viajes',
    ruta: '/panel/operacion/seguimiento',
    icono: 'pin',
    color: 'purple',
  },
  {
    nombre: 'Vehículos disponibles',
    detalle: 'Estado de la flota',
    ruta: '/panel/operacion/vehiculos',
    icono: 'bus',
    color: 'cyan',
  },
  {
    nombre: 'Conductores activos',
    detalle: 'Personal de conducción',
    ruta: '/panel/operacion/conductores',
    icono: 'steering',
    color: 'purple',
  },
  {
    nombre: 'Boletos vendidos hoy',
    detalle: 'Ventas y operaciones',
    ruta: '/panel/comercial/venta',
    icono: 'ticket',
    color: 'gold',
  },
  {
    nombre: 'Ingresos del día',
    detalle: 'Movimientos de caja',
    ruta: '/panel/financiero/caja',
    icono: 'cash',
    color: 'cyan',
  },
  {
    nombre: 'Reservas pendientes',
    detalle: 'Por confirmar',
    ruta: '/panel/comercial/reservas',
    icono: 'calendar',
    color: 'purple',
  },
  {
    nombre: 'Ocupación',
    detalle: 'Asientos y capacidad',
    ruta: '/panel/seguridad/reportes',
    icono: 'seat',
    color: 'gold',
  },
]

export function DashboardPage() {
  const { user } = useAuth()
  const accessiblePaths = new Set(visibleModules(user).flatMap((module) => module.items.map((item) => item.path)))
  const nombre = user?.first_name || user?.username || 'usuario'

  return (
    <div className="dashboard-overview">
      <header className="dashboard-overview__header">
        <DashboardIcon name="chart" />
        <div>
          <h1>Panel principal</h1>
          <p>Bienvenido, <strong>{nombre}</strong> de GH BUS.</p>
        </div>
      </header>

      <section aria-label="Indicadores" className="dashboard-stat-grid">
        {INDICADORES.map((indicador) => {
          const content = (
            <>
              <span className={`dashboard-stat-card__icon dashboard-stat-card__icon--${indicador.color}`}>
                <DashboardIcon name={indicador.icono} />
              </span>
              <span className="dashboard-stat-card__content">
                <span className="dashboard-stat-card__name">{indicador.nombre}</span>
                <strong className="dashboard-stat-card__value">—</strong>
                <span className="dashboard-stat-card__detail">{indicador.detalle}</span>
              </span>
              {accessiblePaths.has(indicador.ruta) && (
                <span className="dashboard-stat-card__arrow" aria-hidden="true">
                  <DashboardIcon name="arrow" />
                </span>
              )}
            </>
          )
          const className = `dashboard-stat-card dashboard-stat-card--${indicador.color}`

          return accessiblePaths.has(indicador.ruta) ? (
            <Link key={indicador.nombre} to={indicador.ruta} className={className}>
              {content}
            </Link>
          ) : (
            <article key={indicador.nombre} className={className}>
              {content}
            </article>
          )
        })}
      </section>
    </div>
  )
}
