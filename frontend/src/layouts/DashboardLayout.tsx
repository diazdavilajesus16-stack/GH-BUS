import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { visibleModules } from '@/config/navigation'
import { useAuth } from '@/hooks/useAuth'

export function DashboardLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  // El menú (móvil) recuerda en qué ruta se abrió: al navegar a otra, queda cerrado solo.
  const [openedAt, setOpenedAt] = useState<string | null>(null)
  const menuOpen = openedAt === pathname
  const setMenuOpen = (open: boolean) => setOpenedAt(open ? pathname : null)
  const modules = visibleModules(user)

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `block rounded-lg px-3 py-2 text-sm transition-colors ${
      isActive ? 'bg-brand text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'
    }`

  return (
    <div className="min-h-screen lg:flex">
      {menuOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setMenuOpen(false)} aria-hidden="true" />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-navy text-white transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Link to="/panel" className="px-6 py-5 text-2xl">
          <Logo />
        </Link>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6" aria-label="Navegación principal">
          <NavLink to="/panel" end className={linkClass}>
            Panel principal
          </NavLink>
          {modules.map((module) => (
            <div key={module.id}>
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gold">{module.label}</p>
              <ul className="space-y-0.5">
                {module.items.map((item) => (
                  <li key={item.path}>
                    <NavLink to={item.path} className={linkClass}>
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <button
            type="button"
            className="rounded-lg p-2 text-navy hover:bg-surface lg:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menú"
          >
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
            </svg>
          </button>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right text-sm leading-tight">
              <Link to="/mi-cuenta" className="font-semibold text-navy hover:underline">
                {user?.first_name || user?.username}
              </Link>
              <p className="text-xs text-slate-500">{user?.roles.join(', ')}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-navy hover:bg-surface"
            >
              Cerrar sesión
            </button>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
