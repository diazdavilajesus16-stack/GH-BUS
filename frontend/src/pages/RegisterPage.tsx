import { zodResolver } from '@hookform/resolvers/zod'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { useForm, type FieldError, type UseFormRegisterReturn } from 'react-hook-form'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Logo } from '@/components/Logo'
import { ErrorBox } from '@/components/Field'
import { useAuth } from '@/hooks/useAuth'
import { mensajeDeError } from '@/services/http'
import { homePathFor } from '@/utils/roles'
import { claveSchema, telefonoSchema, usernameSchema } from '@/utils/validation'

const schema = z
  .object({
    first_name: z.string().trim().min(1, 'Ingresa tus nombres').max(150),
    last_name: z.string().trim().min(1, 'Ingresa tus apellidos').max(150),
    username: usernameSchema,
    email: z.email('Ingresa un correo válido'),
    telefono: telefonoSchema,
    password: claveSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Las contraseñas no coinciden' })
type Form = z.input<typeof schema>

type RegisterIconName = 'user' | 'users' | 'email' | 'phone' | 'lock' | 'eye' | 'eyeOff' | 'shield' | 'bus' | 'support'

function RegisterIcon({ name, className = '' }: { name: RegisterIconName; className?: string }) {
  const icons: Record<RegisterIconName, ReactNode> = {
    user: <><circle cx="12" cy="8" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    email: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
    phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.72c.12.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.1L8.08 9.9a16 16 0 0 0 6 6l1.28-1.28a2 2 0 0 1 2.1-.45c.9.34 1.84.58 2.8.7A2 2 0 0 1 22 16.92Z" />,
    lock: <><rect x="4" y="10" width="16" height="12" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></>,
    eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>,
    eyeOff: <><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 5.2A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a14.8 14.8 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7a10.7 10.7 0 0 0 4.1-.8" /></>,
    shield: <><path d="M12 3 20 6v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3Z" /><path d="m9 12 2 2 4-4" /></>,
    bus: <><path d="M5 11 6.5 5h11l1.5 6v8H5v-8Zm0 0h14M8 15h.01M16 15h.01M8 19v2m8-2v2" /><path d="M8 5V3h8v2" /></>,
    support: <><path d="M3 13v-2a9 9 0 0 1 18 0v2" /><path d="M5 13h2v6H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2Zm12 0h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2v-6Zm0 6c0 2-2 3-5 3" /></>,
  }

  return (
    <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      {icons[name]}
    </svg>
  )
}

function RegisterField({
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
  icon: RegisterIconName
  registration: UseFormRegisterReturn
  error?: FieldError
  type?: string
  autoComplete?: string
  trailing?: ReactNode
}) {
  return (
    <div className={`register-field${error ? ' register-field--invalid' : ''}${trailing ? ' register-field--password' : ''}`}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <RegisterIcon name={icon} className="register-field__icon" />
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

export function RegisterPage() {
  const { register: crearCuenta, user, status } = useAuth()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form, unknown, z.output<typeof schema>>({ resolver: zodResolver(schema) })

  if (status === 'authenticated' && user) return <Navigate to={homePathFor(user)} replace />

  const onSubmit = async ({ confirm: _confirm, ...datos }: z.output<typeof schema>) => {
    setServerError(null)
    try {
      const nuevo = await crearCuenta(datos)
      navigate(homePathFor(nuevo), { replace: true })
    } catch (error) {
      setServerError(mensajeDeError(error))
    }
  }

  return (
    <section className="register-page">
      <img src="/images/ghbus-hero.png" alt="" aria-hidden="true" className="register-page__image" />
      <div aria-hidden="true" className="register-page__shade" />

      <div className="register-page__content">
        <div className="register-promo">
          <Link to="/" className="register-promo__brand" aria-label="GH BUS, inicio">
            <Logo />
          </Link>
          <h1 className="register-promo__title">
            Crear tu cuenta
            <br />
            es muy <span>fácil</span>
          </h1>
          <p className="register-promo__description">
            Únete a nuestra comunidad y disfruta de un viaje más cómodo y seguro.
          </p>
          <ul className="register-benefits">
            <li><RegisterIcon name="shield" /><span>Viajes<br />seguros</span></li>
            <li><RegisterIcon name="bus" /><span>Compra rápida</span></li>
            <li><RegisterIcon name="support" /><span>Soporte 24/7</span></li>
          </ul>
        </div>

        <section className="register-card" aria-labelledby="register-title">
          <div className="register-card__avatar"><RegisterIcon name="user" /></div>
          <header className="register-card__heading">
            <h2 id="register-title">Crear cuenta</h2>
            <p>Completa tus datos para registrarte</p>
          </header>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="register-form">
            <div className="register-form__name-row">
              <RegisterField id="first_name" label="Nombres" icon="user" autoComplete="given-name" registration={register('first_name')} error={errors.first_name} />
              <RegisterField id="last_name" label="Apellidos" icon="users" autoComplete="family-name" registration={register('last_name')} error={errors.last_name} />
            </div>
            <RegisterField id="username" label="Usuario" icon="user" autoComplete="username" registration={register('username')} error={errors.username} />
            <RegisterField id="email" label="Correo" icon="email" type="email" autoComplete="email" registration={register('email')} error={errors.email} />
            <RegisterField id="telefono" label="Teléfono (opcional)" icon="phone" type="tel" autoComplete="tel" registration={register('telefono')} error={errors.telefono} />
            <RegisterField
              id="password"
              label="Contraseña"
              icon="lock"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
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
                  <RegisterIcon name={showPassword ? 'eyeOff' : 'eye'} />
                </button>
              }
            />
            <RegisterField
              id="confirm"
              label="Repite la contraseña"
              icon="lock"
              type={showConfirm ? 'text' : 'password'}
              autoComplete="new-password"
              registration={register('confirm')}
              error={errors.confirm}
              trailing={
                <button
                  type="button"
                  className="register-field__password-toggle"
                  aria-label={showConfirm ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  aria-pressed={showConfirm}
                  onClick={() => setShowConfirm((visible) => !visible)}
                >
                  <RegisterIcon name={showConfirm ? 'eyeOff' : 'eye'} />
                </button>
              }
            />
            <ErrorBox message={serverError} />
            <button type="submit" disabled={isSubmitting} className="register-form__submit">
              <RegisterIcon name="user" />
              {isSubmitting ? 'Creando...' : 'Crear cuenta'}
            </button>
          </form>

          <p className="register-card__login">
            ¿Ya tienes cuenta?{' '}
            <Link to="/login">Inicia sesión</Link>
          </p>
        </section>
      </div>
    </section>
  )
}
