import { zodResolver } from '@hookform/resolvers/zod'
import axios from 'axios'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { useAuth } from '@/hooks/useAuth'

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Ingresa tu usuario'),
  password: z.string().min(1, 'Ingresa tu contraseña'),
})
type LoginForm = z.infer<typeof loginSchema>

function describeLoginError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'No se pudo conectar con el servidor. Inténtalo nuevamente.'
    if (error.response.status === 401) return 'Usuario o contraseña incorrectos.'
  }
  return 'Ocurrió un error inesperado. Inténtalo nuevamente.'
}

export function LoginPage() {
  const { login, user, status } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/panel'

  if (status === 'authenticated' && user) return <Navigate to="/panel" replace />

  const onSubmit = async (values: LoginForm) => {
    setServerError(null)
    try {
      await login(values.username, values.password)
      navigate(from, { replace: true })
    } catch (error) {
      setServerError(describeLoginError(error))
    }
  }

  const inputClass =
    'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-light focus:ring-2 focus:ring-brand-light/30'

  return (
    <>
      <h1 className="text-2xl font-bold text-navy">Iniciar sesión</h1>
      <p className="mt-1 text-sm text-slate-500">Accede al panel de GH BUS.</p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-4">
        <div>
          <label htmlFor="username" className="text-sm font-medium text-slate-700">
            Usuario
          </label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            className={inputClass}
            aria-invalid={errors.username ? 'true' : 'false'}
            {...register('username')}
          />
          {errors.username && <p className="mt-1 text-xs text-danger">{errors.username.message}</p>}
        </div>

        <div>
          <label htmlFor="password" className="text-sm font-medium text-slate-700">
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className={inputClass}
            aria-invalid={errors.password ? 'true' : 'false'}
            {...register('password')}
          />
          {errors.password && <p className="mt-1 text-xs text-danger">{errors.password.message}</p>}
        </div>

        {serverError && (
          <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {serverError}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-light disabled:opacity-60"
        >
          {isSubmitting ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </>
  )
}
