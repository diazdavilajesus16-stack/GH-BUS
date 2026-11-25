import { http } from './http'

export interface ReportesEstadisticas {
  desde: string
  hasta: string
  ventas: {
    cantidad: number
    total: string
  }
  viajes: {
    cantidad: number
    por_estado: Array<{ estado: string; nombre: string; cantidad: number }>
    capacidad_total: number
    boletos_ocupados: number
    ocupacion_porcentaje: number
  }
  finanzas: {
    ingresos_manuales: string
    egresos_manuales: string
    liquidaciones_cerradas: number
    ingresos_liquidados: string
    egresos_liquidados: string
    neto_liquidado: string
    liquidaciones_pendientes: number
  }
  embarque: {
    abordados: number
    pendientes: number
  }
}

export interface ReporteFiltros {
  desde: string
  hasta: string
}

export async function obtenerReportes(filtros: ReporteFiltros): Promise<ReportesEstadisticas> {
  return (await http.get<ReportesEstadisticas>('/reportes/estadisticas/', { params: filtros })).data
}
