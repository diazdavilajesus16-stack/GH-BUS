import type { Role } from '@/types/auth'
import { http } from './http'

export interface UsuarioApi {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  telefono: string
  roles: Role[]
  is_active: boolean
  last_login: string | null
  date_joined: string
}

export interface Pagina<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface FiltrosUsuarios {
  search?: string
  rol?: Role | ''
  is_active?: 'true' | 'false' | ''
  page?: number
}

export interface RolApi {
  nombre: Role
  descripcion: string
  usuarios_activos: number
}

export async function listarUsuarios(f: FiltrosUsuarios): Promise<Pagina<UsuarioApi>> {
  const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '' && v !== undefined))
  return (await http.get<Pagina<UsuarioApi>>('/usuarios/', { params })).data
}

export interface UsuarioNuevo {
  username: string
  email: string
  password: string
  first_name: string
  last_name: string
  telefono?: string
  roles: Role[]
}

export const crearUsuario = async (d: UsuarioNuevo) => (await http.post<UsuarioApi>('/usuarios/', d)).data

export const editarUsuario = async (id: number, d: Partial<Pick<UsuarioApi, 'email' | 'first_name' | 'last_name' | 'telefono' | 'roles'>>) =>
  (await http.patch<UsuarioApi>(`/usuarios/${id}/`, d)).data

export const cambiarEstado = async (id: number, activo: boolean) =>
  (await http.post<UsuarioApi>(`/usuarios/${id}/${activo ? 'activar' : 'desactivar'}/`)).data

export const cerrarSesiones = async (id: number) =>
  (await http.post<{ detail: string; sesiones: number }>(`/usuarios/${id}/cerrar-sesiones/`)).data

export const listarRoles = async () => (await http.get<RolApi[]>('/roles/')).data

export const actualizarPerfil = async (d: { first_name: string; last_name: string; telefono: string; email: string }) =>
  (await http.patch<UsuarioApi>('/auth/me/', d)).data

export const cambiarClave = async (current_password: string, new_password: string) =>
  (await http.post('/auth/password/change/', { current_password, new_password })).data
