import { zodResolver } from '@hookform/resolvers/zod'
import axios from 'axios'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { useForm, type FieldError, type UseFormRegisterReturn } from 'react-hook-form'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Logo } from '@/components/Logo'
import { ErrorBox } from '@/components/Field'
import { useAuth } from '@/hooks/useAuth'
import { homePathFor } from '@/utils/roles'

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Ingresa tu usuario o correo'),
  password: z.string().min(1, 'Ingresa tu contraseña'),
})
type LoginForm = z.infer<typeof loginSchema>

type LoginIconName = 'user' | 'lock' | 'eye' | 'eyeOff' | 'enter'

function LoginIcon({ name, className = '' }: { name: LoginIconName; className?: string }) {
  const icons: Record<LoginIconName, ReactNode> = {
    user: <><circle cx="12" cy="8" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></>,
    lock: <><rect x="4" y="10" width="16" height="12" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></>,
    eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>,
    eyeOff: <><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 5.2A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a14.8 14.8 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7a10.7 10.7 0 0 0 4.1-.8" /></>,
    enter: <><path d="M10 17l5-5-5-5m5 5H3" /><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" /></>,
  }

  return (
    <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      {icons[name]}
    </svg>
  )
}

function LoginField({
  id,
  label,
  icon,
  registration,
  error,
  type = 'text',
  autoComplete,
  trailing,
}: {
  id: string
  label: string
  icon: LoginIconName
  registration: UseFormRegisterReturn
  error?: FieldError
  type?: string
  autoComplete?: string
  trailing?: ReactNode
}) {
  return (
    <div className={`register-field${error ? ' register-field--invalid' : ''}${trailing ? ' register-field--password' : ''}`}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <LoginIcon name={icon} className="register-field__icon" />
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        placeholder={label}
        aria-invalid={error ? 'true' : 'false'}
        className="register-field__input"
        {...registration}
      />
      {trailing}
      {error && <p className="register-field__error">{error.message}</p>}
    </div>
  )
}

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
  const [showPassword, setShowPassword] = useState(false)
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
    <section className="login-page">
      <img src="/images/ghbus-hero.png" alt="" aria-hidden="true" className="register-page__image" />
      <div aria-hidden="true" className="login-page__shade" />

      <div className="login-page__content">
        <section className="register-card login-card" aria-labelledby="login-title">
          <div className="login-card__avatar"><LoginIcon name="lock" /></div>
          <div className="login-card__brand"><Logo /></div>
          <header className="register-card__heading login-card__heading">
            <h1 id="login-title">Iniciar sesión</h1>
            <p>Accede a tu cuenta de GH BUS.</p>
            <span className="login-card__accent" />
          </header>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="register-form login-form">
            <LoginField id="username" label="Usuario o correo" icon="user" autoComplete="username" registration={register('username')} error={errors.username} />
            <LoginField
              id="password"
              label="Contraseña"
              icon="lock"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              registration={register('password')}
              error={errors.password}
              trailing={
                <button
                  type="button"
                  className="register-field__password-toggle"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  <LoginIcon name={showPassword ? 'eyeOff' : 'eye'} />
                </button>
              }
            />
            <ErrorBox message={serverError} />
            <button type="submit" disabled={isSubmitting} className="register-form__submit login-form__submit">
              <LoginIcon name="enter" />
              {isSubmitting ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>

          <div className="login-card__divider"><span>o</span></div>
          <div className="login-card__links">
            <p><LoginIcon name="lock" /><Link to="/recuperar-contrasena">¿Olvidaste tu contraseña?</Link></p>
            <p><LoginIcon name="user" /><span>¿Eres cliente nuevo?</span><Link to="/registro">Crea tu cuenta</Link></p>
          </div>
        </section>
      </div>
    </section>
  )
}
