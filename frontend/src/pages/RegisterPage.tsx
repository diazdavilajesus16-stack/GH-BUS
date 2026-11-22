import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { ErrorBox, Field, primaryButton } from '@/components/Field'
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

export function RegisterPage() {
  const { register: crearCuenta, user, status } = useAuth()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)
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
    <>
      <h1 className="text-2xl font-bold text-navy">Crear cuenta</h1>
      <p className="mt-1 text-sm text-slate-500">Para comprar y consultar tus pasajes.</p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="first_name" label="Nombres" autoComplete="given-name" registration={register('first_name')} error={errors.first_name} />
          <Field id="last_name" label="Apellidos" autoComplete="family-name" registration={register('last_name')} error={errors.last_name} />
        </div>
        <Field id="username" label="Usuario" autoComplete="username" registration={register('username')} error={errors.username} />
        <Field id="email" label="Correo" type="email" autoComplete="email" registration={register('email')} error={errors.email} />
        <Field id="telefono" label="Teléfono (opcional)" type="tel" autoComplete="tel" registration={register('telefono')} error={errors.telefono} />
        <Field id="password" label="Contraseña" type="password" autoComplete="new-password" registration={register('password')} error={errors.password} />
        <Field id="confirm" label="Repite la contraseña" type="password" autoComplete="new-password" registration={register('confirm')} error={errors.confirm} />
        <ErrorBox message={serverError} />
        <button type="submit" disabled={isSubmitting} className={primaryButton}>
          {isSubmitting ? 'Creando...' : 'Crear cuenta'}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-slate-500">
        ¿Ya tienes cuenta?{' '}
        <Link to="/login" className="font-medium text-brand-light hover:underline">
          Inicia sesión
        </Link>
      </p>
    </>
  )
}
