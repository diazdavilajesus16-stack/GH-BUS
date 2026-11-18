import { Link, Outlet } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { useAuth } from '@/hooks/useAuth'

const CURRENT_YEAR = new Date().getFullYear()

export function PublicLayout() {
  const { user, status } = useAuth()

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-navy text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="text-2xl">
            <Logo />
          </Link>
          <nav className="flex items-center gap-4 text-sm font-medium">
            {status !== 'loading' && user ? (
              <Link to="/panel" className="rounded-lg bg-gold px-4 py-2 font-semibold text-navy hover:brightness-95">
                Ir al panel
              </Link>
            ) : (
              <Link to="/login" className="rounded-lg bg-gold px-4 py-2 font-semibold text-navy hover:brightness-95">
                Ingresar
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="bg-navy py-6 text-center text-xs text-white/70">
        © {CURRENT_YEAR} GH BUS · Transporte interprovincial
      </footer>
    </div>
  )
}
