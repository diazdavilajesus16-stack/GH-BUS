import { Link, Outlet } from 'react-router-dom'
import { Logo } from '@/components/Logo'

export function AuthLayout() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-navy via-brand to-brand-light px-4 py-10">
      <Link to="/" className="mb-8 text-4xl text-white">
        <Logo />
      </Link>
      <main className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <Outlet />
      </main>
      <p className="mt-6 text-xs text-white/70">Transporte interprovincial · Justo a tiempo</p>
    </div>
  )
}
