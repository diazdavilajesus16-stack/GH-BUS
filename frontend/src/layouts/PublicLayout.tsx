import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { TripAssistant } from '@/components/TripAssistant'
import { useAuth } from '@/hooks/useAuth'
import { homePathFor } from '@/utils/roles'

const CURRENT_YEAR = new Date().getFullYear()

const PUBLIC_LINKS = [
  { label: 'Inicio', path: '/', icon: 'home' },
  { label: 'Nosotros', path: '/nosotros', icon: 'about' },
  { label: 'Contacto', path: '/contacto', icon: 'contact' },
] as const

type PublicIconName = (typeof PUBLIC_LINKS)[number]['icon'] | 'account' | 'login'

function PublicIcon({ name }: { name: PublicIconName }) {
  const icon = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
    about: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></>,
    contact: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
    account: <><circle cx="12" cy="8" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></>,
    login: <><path d="M10 17l5-5-5-5m5 5H3" /><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" /></>,
  }[name]

  return (
    <svg aria-hidden="true" className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      {icon}
    </svg>
  )
}

export function PublicLayout() {
  const { user, status } = useAuth()
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)

  return (
    <div className="relative flex min-h-screen flex-col">
      <header className="public-header absolute inset-x-3 top-3 z-30 mx-auto max-w-[1320px] text-white">
        <div className="public-header__inner flex min-h-[62px] items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" aria-label="GH BUS, inicio" className="public-brand shrink-0" onClick={closeMenu}>
            <Logo />
          </Link>

          <button
            type="button"
            className="public-menu-toggle inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/25 text-white lg:hidden"
            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menuOpen}
            aria-controls="public-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24">
              {menuOpen ? <path d="m6 6 12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>

          <nav id="public-navigation" className={`public-menu${menuOpen ? ' is-open' : ''}`} aria-label="Navegación principal">
            {PUBLIC_LINKS.map(({ label, path, icon }) => (
              <NavLink
                key={path}
                to={path}
                end={path === '/'}
                className={({ isActive }) => `public-nav-link${isActive || pathname === path ? ' is-active' : ''}`}
                onClick={closeMenu}
              >
                <PublicIcon name={icon} />
                {label}
              </NavLink>
            ))}

            {status !== 'loading' && (
              <div className="public-auth-actions">
                {user ? (
                  <Link to={homePathFor(user)} className="public-nav-link" onClick={closeMenu}>
                    <PublicIcon name="account" />
                    {homePathFor(user) === '/panel' ? 'Ir al panel' : 'Mi cuenta'}
                  </Link>
                ) : (
                  <>
                    <Link
                      to="/registro"
                      aria-current={pathname === '/registro' ? 'page' : undefined}
                      className={`public-nav-link${pathname === '/registro' ? ' is-active' : ''}`}
                      onClick={closeMenu}
                    >
                      <PublicIcon name="account" />
                      Crear cuenta
                    </Link>
                    <Link
                      to="/login"
                      aria-current={pathname === '/login' ? 'page' : undefined}
                      className={`public-login-link${pathname === '/login' ? ' is-active' : ''}`}
                      onClick={closeMenu}
                    >
                      <PublicIcon name="login" />
                      Ingresar
                    </Link>
                  </>
                )}
              </div>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="public-footer px-5 py-5 text-white">
        <div className="public-footer__inner mx-auto flex max-w-[1320px] flex-wrap items-center justify-center gap-x-7 gap-y-3 sm:justify-between">
          <Link to="/" aria-label="GH BUS, inicio" className="public-brand">
            <Logo />
          </Link>
          <span className="public-footer__motto">Moviendo tus sueños</span>
          <span className="text-center text-xs text-white/80">© {CURRENT_YEAR} GH BUS · Sistema de Transporte Interprovincial</span>
          <span className="public-footer__safety">
            <svg aria-hidden="true" className="h-7 w-7 shrink-0 text-gold" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3 20 6v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="m9 12 2 2 4-4" />
            </svg>
            <span>Viaje seguro,<br /><strong>siempre.</strong></span>
          </span>
        </div>
      </footer>
      <TripAssistant />
    </div>
  )
}
