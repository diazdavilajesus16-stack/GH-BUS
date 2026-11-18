import { createBrowserRouter, type RouteObject } from 'react-router-dom'
import { NAV_MODULES } from '@/config/navigation'
import { AuthLayout } from '@/layouts/AuthLayout'
import { DashboardLayout } from '@/layouts/DashboardLayout'
import { PublicLayout } from '@/layouts/PublicLayout'
import { DashboardPage } from '@/pages/DashboardPage'
import { ForbiddenPage } from '@/pages/ForbiddenPage'
import { HomePage } from '@/pages/HomePage'
import { LoginPage } from '@/pages/LoginPage'
import { ModulePlaceholderPage } from '@/pages/ModulePlaceholderPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { ProtectedRoute } from './ProtectedRoute'

// Una ruta por pantalla del menú, cada una protegida con sus roles.
const moduleRoutes: RouteObject[] = NAV_MODULES.flatMap((module) =>
  module.items.map((item) => ({
    element: <ProtectedRoute roles={item.roles} />,
    children: [{ path: item.path, element: <ModulePlaceholderPage title={item.label} moduleLabel={module.label} /> }],
  })),
)

export const router = createBrowserRouter([
  { element: <PublicLayout />, children: [{ path: '/', element: <HomePage /> }] },
  { element: <AuthLayout />, children: [{ path: '/login', element: <LoginPage /> }] },
  {
    path: '/panel',
    element: <ProtectedRoute />,
    children: [
      {
        element: <DashboardLayout />,
        children: [{ index: true, element: <DashboardPage /> }, ...moduleRoutes],
      },
    ],
  },
  { path: '/403', element: <ForbiddenPage /> },
  { path: '*', element: <NotFoundPage /> },
])
