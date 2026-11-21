import type { ReactElement } from 'react'
import { createBrowserRouter, type RouteObject } from 'react-router-dom'
import { NAV_MODULES } from '@/config/navigation'
import { AuthLayout } from '@/layouts/AuthLayout'
import { DashboardLayout } from '@/layouts/DashboardLayout'
import { PublicLayout } from '@/layouts/PublicLayout'
import { DashboardPage } from '@/pages/DashboardPage'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { ForbiddenPage } from '@/pages/ForbiddenPage'
import { HomePage } from '@/pages/HomePage'
import { ConductoresPage, ConfiguracionPage, HorariosPage, RutasPage, VehiculosPage } from '@/pages/OperacionPages'
import { LoginPage } from '@/pages/LoginPage'
import { ModulePlaceholderPage } from '@/pages/ModulePlaceholderPage'
import { MiCuentaClientePage } from '@/pages/MiCuentaPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { RolesPage } from '@/pages/RolesPage'
import { UsersPage } from '@/pages/UsersPage'
import { STAFF_ROLES } from '@/types/auth'
import { ProtectedRoute } from './ProtectedRoute'

// Pantallas ya construidas; el resto muestra un marcador hasta su módulo.
const PAGES: Record<string, ReactElement> = {
  '/panel/seguridad/usuarios': <UsersPage />,
  '/panel/seguridad/roles': <RolesPage />,
  '/panel/seguridad/configuracion': <ConfiguracionPage />,
  '/panel/operacion/rutas': <RutasPage />,
  '/panel/operacion/horarios': <HorariosPage />,
  '/panel/operacion/vehiculos': <VehiculosPage />,
  '/panel/operacion/conductores': <ConductoresPage />,
}

// Una ruta por pantalla del menú, cada una protegida con sus roles.
const moduleRoutes: RouteObject[] = NAV_MODULES.flatMap((module) =>
  module.items.map((item) => ({
    element: <ProtectedRoute roles={item.roles} />,
    children: [{ path: item.path, element: PAGES[item.path] ?? <ModulePlaceholderPage title={item.label} moduleLabel={module.label} /> }],
  })),
)

export const router = createBrowserRouter([
  { element: <PublicLayout />, children: [{ path: '/', element: <HomePage /> }] },
  {
    element: <AuthLayout />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/registro', element: <RegisterPage /> },
      { path: '/recuperar-contrasena', element: <ForgotPasswordPage /> },
      { path: '/restablecer-contrasena', element: <ResetPasswordPage /> },
    ],
  },
  // «Mi cuenta»: cualquier usuario con sesión (los clientes no tienen panel).
  { element: <ProtectedRoute />, children: [{ path: '/mi-cuenta', element: <MiCuentaClientePage /> }] },
  {
    path: '/panel',
    element: <ProtectedRoute roles={STAFF_ROLES} />,
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
