import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { ErrorBox, Field, OkBox, primaryButton } from '@/components/Field'
import { Logo } from '@/components/Logo'
import { useAuth } from '@/hooks/useAuth'
import { mensajeDeError } from '@/services/http'
import { actualizarPerfil, cambiarClave } from '@/services/usersApi'
import { toRoles } from '@/utils/roles'
import { claveSchema, telefonoSchema } from '@/utils/validation'
import { STAFF_ROLES } from '@/types/auth'

const perfilSchema = z.object({
  first_name: z.string().trim().min(1, 'Ingresa tus nombres').max(150),
  last_name: z.string().trim().min(1, 'Ingresa tus apellidos').max(150),
  email: z.email('Ingresa un correo válido'),
  telefono: telefonoSchema,
})
type PerfilForm = z.infer<typeof perfilSchema>

const claveFormSchema = z
  .object({ current_password: z.string().min(1, 'Ingresa tu contraseña actual'), new_password: claveSchema, confirm: z.string() })
  .refine((v) => v.new_password === v.confirm, { path: ['confirm'], message: 'Las contraseñas no coinciden' })
type ClaveForm = z.infer<typeof claveFormSchema>

function PerfilSection() {
  const { user, setUser } = useAuth()
  const [ok, setOk] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PerfilForm>({
    resolver: zodResolver(perfilSchema),
    defaultValues: {
      first_name: user?.first_name ?? '',
      last_name: user?.last_name ?? '',
      email: user?.email ?? '',
      telefono: user?.telefono ?? '',
    },
  })

  const onSubmit = async (values: PerfilForm) => {
    setOk(null)
    setErr(null)
    try {
      const nuevo = await actualizarPerfil(values)
      setUser({ ...nuevo, roles: toRoles(nuevo.roles) })
      setOk('Datos actualizados.')
    } catch (error) {
      setErr(mensajeDeError(error))
    }
  }

  return (
    <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-lg font-semibold text-navy">Mis datos</h2>
      <p className="text-sm text-slate-500">
        Usuario: <strong>{user?.username}</strong> · Rol: {user?.roles.join(', ') || 'sin rol'}
      </p>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="first_name" label="Nombres" registration={register('first_name')} error={errors.first_name} />
          <Field id="last_name" label="Apellidos" registration={register('last_name')} error={errors.last_name} />
          <Field id="email" label="Correo" type="email" registration={register('email')} error={errors.email} />
          <Field id="telefono" label="Teléfono" type="tel" registration={register('telefono')} error={errors.telefono} />
        </div>
        <OkBox message={ok} />
        <ErrorBox message={err} />
        <button type="submit" disabled={isSubmitting} className={`${primaryButton} sm:w-auto`}>
          Guardar cambios
        </button>
      </form>
    </section>
  )
}

function ClaveSection() {
  const { endSession } = useAuth()
  const navigate = useNavigate()
  const [err, setErr] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ClaveForm>({ resolver: zodResolver(claveFormSchema) })

  const onSubmit = async (v: ClaveForm) => {
    setErr(null)
    try {
      await cambiarClave(v.current_password, v.new_password)
      // El servidor cerró todas las sesiones: se vuelve a iniciar con la nueva clave.
      endSession()
      navigate('/login', { replace: true })
    } catch (error) {
      setErr(mensajeDeError(error))
    }
  }

  return (
    <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-lg font-semibold text-navy">Cambiar contraseña</h2>
      <p className="text-sm text-slate-500">Al cambiarla se cerrarán tus sesiones en todos los dispositivos.</p>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-4 max-w-md space-y-4">
        <Field id="current_password" label="Contraseña actual" type="password" autoComplete="current-password" registration={register('current_password')} error={errors.current_password} />
        <Field id="new_password" label="Nueva contraseña" type="password" autoComplete="new-password" registration={register('new_password')} error={errors.new_password} />
        <Field id="confirm" label="Repite la nueva contraseña" type="password" autoComplete="new-password" registration={register('confirm')} error={errors.confirm} />
        <ErrorBox message={err} />
        <button type="submit" disabled={isSubmitting} className={`${primaryButton} sm:w-auto`}>
          Cambiar contraseña
        </button>
      </form>
    </section>
  )
}

/** «Mi cuenta»: la ven todos los roles. Para clientes es su pantalla de inicio. */
export function MiCuentaContent() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-navy">Mi cuenta</h1>
      <PerfilSection />
      <ClaveSection />
    </div>
  )
}

/** Versión para clientes: sin menú del panel, con cabecera sencilla. */
export function MiCuentaClientePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const esPersonal = !!user?.roles.some((r) => STAFF_ROLES.includes(r))
  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-navy text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link to="/" className="text-2xl">
            <Logo />
          </Link>
          <div className="flex items-center gap-3 text-sm">
            {esPersonal && (
              <Link to="/panel" className="underline">
                Ir al panel
              </Link>
            )}
            <button
              type="button"
              className="rounded-lg border border-white/40 px-3 py-1.5 hover:bg-white/10"
              onClick={async () => {
                await logout()
                navigate('/login', { replace: true })
              }}
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>
      <main className="p-4 sm:p-6">
        <MiCuentaContent />
      </main>
    </div>
  )
}
