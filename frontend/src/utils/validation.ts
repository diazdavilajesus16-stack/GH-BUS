import { z } from 'zod'

/** Reglas de contraseña del backend (mínimo 8, no solo números). El servidor aplica además
 * «no demasiado común» y «no parecida a tus datos»; aquí solo se adelantan las simples. */
export const claveSchema = z
  .string()
  .min(8, 'Mínimo 8 caracteres')
  .max(128, 'Máximo 128 caracteres')
  .refine((v) => !/^\d+$/.test(v), 'No puede ser solo números')

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Mínimo 3 caracteres')
  .max(150)
  .regex(/^[a-z0-9._-]+$/, 'Solo letras, números, punto, guion y guion bajo')

export const telefonoSchema = z
  .string()
  .trim()
  .refine((v) => v === '' || /^\+?[0-9 ]{6,20}$/.test(v), 'Ingresa un teléfono válido')
