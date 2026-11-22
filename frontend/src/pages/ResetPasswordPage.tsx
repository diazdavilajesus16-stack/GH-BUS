import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { ErrorBox, Field, OkBox, primaryButton } from '@/components/Field'
import { restablecerClave } from '@/services/authService'
import { mensajeDeError } from '@/services/http'
import { claveSchema } from '@/utils/validation'

const schema = z
  .object({ password: claveSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Las contraseñas no coinciden' })
type Form = z.infer<typeof schema>

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const uid = params.get('uid') ?? ''
  const token = params.get('token') ?? ''
  const [listo, setListo] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) })

  const onSubmit = async ({ password }: Form) => {
    setServerError(null)
    try {
      await restablecerClave(uid, token, password)
      setListo(true)
    } catch (error) {
      setServerError(mensajeDeError(error))
    }
  }

  if (!uid || !token) {
    return (
      <>
        <h1 className="text-2xl font-bold text-navy">Enlace no válido</h1>
        <p className="mt-2 text-sm text-slate-600">Abre el enlace completo que te enviamos o solicita uno nuevo.</p>
        <p className="mt-5 text-center text-sm">
          <Link to="/recuperar-contrasena" className="text-brand-light hover:underline">
            Solicitar otro enlace
          </Link>
        </p>
      </>
    )
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-navy">Nueva contraseña</h1>
      {listo ? (
        <div className="mt-6 space-y-4">
          <OkBox message="Contraseña actualizada. Ya puedes iniciar sesión." />
          <Link to="/login" className={`${primaryButton} block text-center`}>
            Ir a iniciar sesión
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-4">
          <Field id="password" label="Nueva contraseña" type="password" autoComplete="new-password" registration={register('password')} error={errors.password} />
          <Field id="confirm" label="Repite la contraseña" type="password" autoComplete="new-password" registration={register('confirm')} error={errors.confirm} />
          <ErrorBox message={serverError} />
          <button type="submit" disabled={isSubmitting} className={primaryButton}>
            {isSubmitting ? 'Guardando...' : 'Guardar contraseña'}
          </button>
        </form>
      )}
    </>
  )
}
