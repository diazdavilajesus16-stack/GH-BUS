import { http } from './http'

export interface RegistroAuditoria {
  id: number
  creado_en: string
  accion: string
  entidad: string
  entidad_id: string | null
  usuario: number | null
  usuario_nombre: string
  cambios: Record<string, unknown> | null
  ip: string | null
  user_agent: string | null
}

export interface PaginaAuditoria {
  count: number
  next: string | null
  previous: string | null
  results: RegistroAuditoria[]
}

export interface FiltrosAuditoria {
  desde?: string
  hasta?: string
  accion?: string
  entidad?: string
  search?: string
  page?: number
}

export async function listarAuditoria(filtros: FiltrosAuditoria): Promise<PaginaAuditoria> {
  const params = {
    ...filtros,
    desde: filtros.desde ? `${filtros.desde}T00:00:00` : undefined,
    hasta: filtros.hasta ? `${filtros.hasta}T23:59:59.999999` : undefined,
  }
  return (await http.get<PaginaAuditoria>('/auditoria/', { params })).data
}
