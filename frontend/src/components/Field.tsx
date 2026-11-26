import type { InputHTMLAttributes } from 'react'
import type { FieldError, UseFormRegisterReturn } from 'react-hook-form'

export const inputClass =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-light focus:ring-2 focus:ring-brand-light/30'

export const primaryButton =
  'w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-light disabled:opacity-60'

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'name'> {
  id: string
  label: string
  registration: UseFormRegisterReturn
  error?: FieldError
}

export function Field({ id, label, registration, error, ...rest }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <input id={id} className={inputClass} aria-invalid={error ? 'true' : 'false'} {...rest} {...registration} />
      {error && <p className="mt-1 text-xs text-danger">{error.message}</p>}
    </div>
  )
}

export function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
      {message}
    </p>
  )
}

export function OkBox({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
      {message}
    </p>
  )
}
