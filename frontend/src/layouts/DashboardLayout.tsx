import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { DashboardIcon, type DashboardIconName } from '@/components/DashboardIcon'
import { Logo } from '@/components/Logo'
import { visibleModules } from '@/config/navigation'
import { useAuth } from '@/hooks/useAuth'

const ICON_BY_PATH: Record<string, DashboardIconName> = {
  '/panel/operacion/rutas': 'route',
  '/panel/operacion/horarios': 'clock',
  '/panel/operacion/vehiculos': 'bus',
  '/panel/operacion/conductores': 'steering',
  '/panel/operacion/programacion': 'calendar',
  '/panel/operacion/despacho': 'send',
  '/panel/operacion/seguimiento': 'pin',
  '/panel/comercial/reservas': 'ticket',
  '/panel/comercial/venta': 'cart',
  '/panel/comercial/mapa-asientos': 'seat',
  '/panel/comercial/pasajeros': 'users',
  '/panel/comercial/embarque': 'check',
  '/panel/financiero/caja': 'cash',
  '/panel/financiero/liquidacion': 'receipt',
  '/panel/seguridad/reportes': 'chart',
  '/panel/seguridad/auditoria': 'shield',
  '/panel/seguridad/usuarios': 'users',
  '/panel/seguridad/roles': 'shield',
  '/panel/seguridad/configuracion': 'settings',
}

export function DashboardLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [openedAt, setOpenedAt] = useState<string | null>(null)
  const menuOpen = openedAt === pathname
  const setMenuOpen = (open: boolean) => setOpenedAt(open ? pathname : null)
  const modules = visibleModules(user)

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="dashboard-shell min-h-screen lg:flex">
      {menuOpen && (
        <button
          type="button"
          className="dashboard-scrim fixed inset-0 z-30 lg:hidden"
          onClick={() => setMenuOpen(false)}
          aria-label="Cerrar menú"
        />
      )}

      <aside
        className={`dashboard-sidebar fixed inset-y-0 left-0 z-40 flex w-[13rem] flex-col transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Link to="/panel" className="dashboard-sidebar__brand" onClick={() => setMenuOpen(false)}>
          <Logo />
        </Link>
        <nav className="dashboard-sidebar__nav flex-1 space-y-5 overflow-y-auto px-2.5 pb-6" aria-label="Navegación principal">
          <NavLink
            to="/panel"
            end
            className={({ isActive }) => `dashboard-sidebar__link${isActive ? ' is-active' : ''}`}
            onClick={() => setMenuOpen(false)}
          >
            <DashboardIcon name="home" />
            <span>Panel principal</span>
          </NavLink>

          {modules.map((module) => (
            <div className="dashboard-sidebar__group" key={module.id}>
              <p className="dashboard-sidebar__label">{module.label}</p>
              <ul className="space-y-1">
                {module.items.map((item) => (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      className={({ isActive }) => `dashboard-sidebar__link${isActive ? ' is-active' : ''}`}
                      onClick={() => setMenuOpen(false)}
                    >
                      <DashboardIcon name={ICON_BY_PATH[item.path] ?? 'settings'} />
                      <span>{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="dashboard-topbar sticky top-0 z-20 flex items-center justify-between px-4 py-3">
          <button
            type="button"
            className="dashboard-menu-toggle rounded-lg p-2 lg:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menú"
          >
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
            </svg>
          </button>

          <div className="dashboard-user ml-auto flex items-center gap-3">
            <span className="dashboard-user__avatar">
              <DashboardIcon name="user" />
            </span>
            <div className="text-right text-sm leading-tight">
              <Link to="/mi-cuenta" className="dashboard-user__name">
                {user?.first_name || user?.username}
              </Link>
              <p className="dashboard-user__role">{user?.roles.join(', ')}</p>
            </div>
            <span className="dashboard-topbar__divider" aria-hidden="true" />
            <button type="button" onClick={handleLogout} className="dashboard-logout">
              <DashboardIcon name="logout" />
              <span>Cerrar sesión</span>
            </button>
          </div>
        </header>

        <main className="dashboard-main flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
