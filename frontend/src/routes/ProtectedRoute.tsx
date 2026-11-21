import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Spinner } from '@/components/Spinner'
import { useAuth } from '@/hooks/useAuth'
import type { Role } from '@/types/auth'
import { hasAnyRole } from '@/utils/roles'

interface ProtectedRouteProps {
  /** Si se omite, basta con haber iniciado sesión. */
  roles?: readonly Role[]
}

/** Protege rutas en la interfaz. Es solo comodidad de navegación: el backend aplica los permisos reales. */
export function ProtectedRoute({ roles }: ProtectedRouteProps) {
  const { user, status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <Spinner />
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  if (!hasAnyRole(user, roles)) return <Navigate to="/403" replace />
  return <Outlet />
}
