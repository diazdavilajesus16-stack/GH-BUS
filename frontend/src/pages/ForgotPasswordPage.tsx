import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { ErrorBox, Field, OkBox, primaryButton } from '@/components/Field'
import { solicitarRecuperacion } from '@/services/authService'
import { mensajeDeError } from '@/services/http'

const schema = z.object({ email: z.email('Ingresa un correo válido') })
type Form = z.infer<typeof schema>

export function ForgotPasswordPage() {
  const [enviado, setEnviado] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) })

  const onSubmit = async ({ email }: Form) => {
    setServerError(null)
    try {
      await solicitarRecuperacion(email)
      setEnviado(true)
    } catch (error) {
      setServerError(mensajeDeError(error))
    }
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-navy">Recuperar contraseña</h1>
      <p className="mt-1 text-sm text-slate-500">Te enviaremos un enlace para crear una nueva.</p>

      {enviado ? (
        <div className="mt-6">
          <OkBox message="Si el correo está registrado, recibirás un mensaje con las instrucciones. Revisa también la carpeta de spam." />
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-4">
          <Field id="email" label="Correo" type="email" autoComplete="email" registration={register('email')} error={errors.email} />
          <ErrorBox message={serverError} />
          <button type="submit" disabled={isSubmitting} className={primaryButton}>
            {isSubmitting ? 'Enviando...' : 'Enviar enlace'}
          </button>
        </form>
      )}
      <p className="mt-5 text-center text-sm">
        <Link to="/login" className="text-brand-light hover:underline">
          Volver a iniciar sesión
        </Link>
      </p>
    </>
  )
}
