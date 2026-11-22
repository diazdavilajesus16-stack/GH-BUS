import { Link } from 'react-router-dom'

export function ForbiddenPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-6xl font-extrabold text-brand">403</p>
      <h1 className="text-xl font-bold text-navy">No tienes permiso para ver esta pantalla</h1>
      <Link to="/panel" className="mt-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-light">
        Volver al panel
      </Link>
    </main>
  )
}
