import { ReservaPage } from '@/pages/ReservaPage';
import { lazy, Suspense, type ReactElement } from 'react'
import { createBrowserRouter, type RouteObject } from 'react-router-dom'
import { NAV_MODULES } from '@/config/navigation'
import { AuthLayout } from '@/layouts/AuthLayout'
import { DashboardLayout } from '@/layouts/DashboardLayout'
import { PublicLayout } from '@/layouts/PublicLayout'
import { DashboardPage } from '@/pages/DashboardPage'
import { CajaPage } from '@/pages/CajaPage'
import { AuditoriaPage } from '@/pages/AuditoriaPage'
import { LiquidacionViajesPage } from '@/pages/LiquidacionViajesPage'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { ForbiddenPage } from '@/pages/ForbiddenPage'
import { HomePage } from '@/pages/HomePage'
import { ConductoresPage, ConfiguracionPage, HorariosPage, RutasPage, VehiculosPage } from '@/pages/OperacionPages'
import { DespachoPage, ProgramacionPage, SeguimientoPage } from '@/pages/ViajesPages'
import { LoginPage } from '@/pages/LoginPage'
import { MapaAsientosPage } from '@/pages/MapaAsientosPage'
import { ModulePlaceholderPage } from '@/pages/ModulePlaceholderPage'
import { MiCuentaClientePage } from '@/pages/MiCuentaPage'
import { NosotrosPage } from '@/pages/NosotrosPage'
import { ContactoPage } from '@/pages/ContactoPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { PasajerosPage } from '@/pages/PasajerosPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { RolesPage } from '@/pages/RolesPage'
import { ReportesPage } from '@/pages/ReportesPage'
import { ReservasPage } from '@/pages/ReservasPage'
import { UsersPage } from '@/pages/UsersPage'
import { VentaBoletosPage } from '@/pages/VentaBoletosPage'
import { STAFF_ROLES } from '@/types/auth'
import { ProtectedRoute } from './ProtectedRoute'

const ControlEmbarquePage = lazy(() =>
  import('@/pages/ControlEmbarquePage').then(({ ControlEmbarquePage }) => ({ default: ControlEmbarquePage })),
)

// Pantallas ya construidas; el resto muestra un marcador hasta su módulo.
const PAGES: Record<string, ReactElement> = {
  '/panel/seguridad/auditoria': <AuditoriaPage />,
  '/panel/seguridad/reportes': <ReportesPage />,
  '/panel/seguridad/usuarios': <UsersPage />,
  '/panel/seguridad/roles': <RolesPage />,
  '/panel/seguridad/configuracion': <ConfiguracionPage />,
  '/panel/financiero/caja': <CajaPage />,
  '/panel/financiero/liquidacion': <LiquidacionViajesPage />,
  '/panel/comercial/reservas': <ReservasPage />,
  '/panel/comercial/venta': <VentaBoletosPage />,
  '/panel/comercial/mapa-asientos': <MapaAsientosPage />,
  '/panel/comercial/pasajeros': <PasajerosPage />,
  '/panel/operacion/rutas': <RutasPage />,
  '/panel/operacion/horarios': <HorariosPage />,
  '/panel/operacion/vehiculos': <VehiculosPage />,
  '/panel/operacion/conductores': <ConductoresPage />,
  '/panel/operacion/programacion': <ProgramacionPage />,
  '/panel/operacion/despacho': <DespachoPage />,
  '/panel/operacion/seguimiento': <SeguimientoPage />,
  '/panel/comercial/embarque': (
    <Suspense fallback={<div className="p-8 text-center">Cargando control de embarque...</div>}>
      <ControlEmbarquePage />
    </Suspense>
  ),
}

// Una ruta por pantalla del menú, cada una protegida con sus roles.
const moduleRoutes: RouteObject[] = NAV_MODULES.flatMap((module) =>
  module.items.map((item) => ({
    element: <ProtectedRoute roles={item.roles} />,
    children: [{ path: item.path, element: PAGES[item.path] ?? <ModulePlaceholderPage title={item.label} moduleLabel={module.label} /> }],
  })),
)

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/nosotros', element: <NosotrosPage /> },
      { path: '/contacto', element: <ContactoPage /> },
      { path: '/registro', element: <RegisterPage /> },
      { path: '/login', element: <LoginPage /> },
    ],
  },
  {
    element: <AuthLayout />,
    children: [
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
  
  // 👇 RUTA AGREGADA PARA EL MAPA DE ASIENTOS 👇
  {
    element: <ProtectedRoute roles={['administrador', 'cajero', 'cliente']} />,
    children: [{ path: '/reservar/:tripId', element: <ReservaPage /> }],
  },
  
  { path: '/403', element: <ForbiddenPage /> },
  { path: '*', element: <NotFoundPage /> },
])