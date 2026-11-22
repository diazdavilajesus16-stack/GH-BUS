import { zodResolver } from '@hookform/resolvers/zod'
import axios from 'axios'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { ErrorBox, Field, primaryButton } from '@/components/Field'
import { useAuth } from '@/hooks/useAuth'
import { homePathFor } from '@/utils/roles'

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Ingresa tu usuario o correo'),
  password: z.string().min(1, 'Ingresa tu contraseña'),
})
type LoginForm = z.infer<typeof loginSchema>

function describeLoginError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'No se pudo conectar con el servidor. Inténtalo nuevamente.'
    if (error.response.status === 401) return 'Usuario o contraseña incorrectos.'
    if (error.response.status === 429)
      return 'Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.'
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

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname

  if (status === 'authenticated' && user) return <Navigate to={homePathFor(user)} replace />

  const onSubmit = async (values: LoginForm) => {
    setServerError(null)
    try {
      const logged = await login(values.username, values.password)
      navigate(from ?? homePathFor(logged), { replace: true })
    } catch (error) {
      setServerError(describeLoginError(error))
    }
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-navy">Iniciar sesión</h1>
      <p className="mt-1 text-sm text-slate-500">Accede a tu cuenta de GH BUS.</p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-4">
        <Field id="username" label="Usuario o correo" type="text" autoComplete="username" registration={register('username')} error={errors.username} />
        <Field id="password" label="Contraseña" type="password" autoComplete="current-password" registration={register('password')} error={errors.password} />
        <ErrorBox message={serverError} />
        <button type="submit" disabled={isSubmitting} className={primaryButton}>
          {isSubmitting ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>

      <div className="mt-5 space-y-1 text-center text-sm">
        <p>
          <Link to="/recuperar-contrasena" className="text-brand-light hover:underline">
            ¿Olvidaste tu contraseña?
          </Link>
        </p>
        <p className="text-slate-500">
          ¿Eres cliente nuevo?{' '}
          <Link to="/registro" className="font-medium text-brand-light hover:underline">
            Crea tu cuenta
          </Link>
        </p>
      </div>
    </>
  )
}
