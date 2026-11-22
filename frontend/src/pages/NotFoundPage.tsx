import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-6xl font-extrabold text-brand">404</p>
      <h1 className="text-xl font-bold text-navy">Página no encontrada</h1>
      <Link to="/" className="mt-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-light">
        Ir al inicio
      </Link>
    </main>
  )
}
