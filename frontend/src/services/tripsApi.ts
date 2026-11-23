import axios from 'axios'
import { http, mensajeDeError } from './http'
import type { Pagina } from './usersApi'

export type EstadoViaje = 'PROGRAMADO' | 'CONFIRMADO' | 'EN_EMBARQUE' | 'EN_RUTA' | 'RETRASADO' | 'FINALIZADO' | 'CANCELADO'
export type RolConductor = 'PRINCIPAL' | 'COPILOTO'

export interface ViajeApi {
  id: number
  codigo: string
  ruta: number
  ruta_codigo: string
  origen_nombre: string
  destino_nombre: string
  tipo_servicio: number
  tipo_servicio_nombre: string
  salida_programada: string
  llegada_programada: string
  vehiculo: number | null
  vehiculo_placa: string | null
  capacidad: number | null
  conductores: { conductor: number; conductor_nombre: string; rol: RolConductor }[]
  estado: EstadoViaje
  precio_base: string
  salida_real: string | null
  llegada_real: string | null
  observaciones: string
}

export interface HistorialApi {
  id: number
  estado_anterior: string | null
  estado_nuevo: string
  cambiado_por_nombre: string | null
  cambiado_en: string
  observacion: string
}

export interface ResumenGeneracion {
  creados: number
  ya_existian: number
  en_el_pasado: number
  sin_tarifa: string[]
}

export interface IncidenciaApi {
  id: number
  viaje: number
  viaje_codigo: string
  tipo: string
  severidad: 'BAJA' | 'MEDIA' | 'ALTA'
  descripcion: string
  ocurrida_en: string
  resuelta: boolean
  resolucion: string
  registrada_por_nombre: string
}

export interface AlertaApi {
  categoria: 'VEHICULO' | 'CONDUCTOR'
  referencia: string
  detalle: string
  situacion: 'VENCIDO' | 'POR_VENCER' | 'SIN_REGISTRO'
  vence: string | null
  dias: number | null
  bloquea_asignacion: boolean
}

export const ETIQUETA_ESTADO_VIAJE: Record<EstadoViaje, string> = {
  PROGRAMADO: 'Programado', CONFIRMADO: 'Confirmado', EN_EMBARQUE: 'En embarque', EN_RUTA: 'En ruta',
  RETRASADO: 'Retrasado', FINALIZADO: 'Finalizado', CANCELADO: 'Cancelado',
}

export const CLASE_ESTADO_VIAJE: Record<EstadoViaje, string> = {
  PROGRAMADO: 'bg-slate-200 text-slate-700', CONFIRMADO: 'bg-sky-100 text-sky-800', EN_EMBARQUE: 'bg-amber-100 text-amber-800',
  EN_RUTA: 'bg-emerald-100 text-emerald-800', RETRASADO: 'bg-orange-100 text-orange-800', FINALIZADO: 'bg-slate-100 text-slate-500',
  CANCELADO: 'bg-red-100 text-red-800',
}

/** Estados editables (se puede cambiar vehículo y conductores). Refleja la regla del backend. */
export const ESTADOS_EDITABLES: EstadoViaje[] = ['PROGRAMADO', 'CONFIRMADO']
export const ESTADOS_EN_CURSO: EstadoViaje[] = ['EN_EMBARQUE', 'EN_RUTA', 'RETRASADO']
export const ESTADOS_ACTIVOS: EstadoViaje[] = ['PROGRAMADO', 'CONFIRMADO', ...ESTADOS_EN_CURSO]

/** Acciones de despacho por estado (solo la presentación: el backend valida cada cambio). */
export interface AccionDespacho {
  etiqueta: string
  destino: EstadoViaje
  pideMotivo?: boolean
  peligrosa?: boolean
}
export const ACCIONES_DESPACHO: Record<EstadoViaje, AccionDespacho[]> = {
  PROGRAMADO: [{ etiqueta: 'Confirmar', destino: 'CONFIRMADO' }, { etiqueta: 'Cancelar viaje', destino: 'CANCELADO', pideMotivo: true, peligrosa: true }],
  CONFIRMADO: [{ etiqueta: 'Iniciar embarque', destino: 'EN_EMBARQUE' }, { etiqueta: 'Cancelar viaje', destino: 'CANCELADO', pideMotivo: true, peligrosa: true }],
  EN_EMBARQUE: [{ etiqueta: 'Marcar salida', destino: 'EN_RUTA' }, { etiqueta: 'Cancelar viaje', destino: 'CANCELADO', pideMotivo: true, peligrosa: true }],
  EN_RUTA: [{ etiqueta: 'Reportar retraso', destino: 'RETRASADO', pideMotivo: true }, { etiqueta: 'Finalizar viaje', destino: 'FINALIZADO' }],
  RETRASADO: [{ etiqueta: 'Retomar ruta', destino: 'EN_RUTA' }, { etiqueta: 'Finalizar viaje', destino: 'FINALIZADO' }],
  FINALIZADO: [],
  CANCELADO: [],
}

/** Lista de motivos que devuelve el backend cuando una regla no se cumple (o un único mensaje). */
export function motivosDeError(error: unknown): string[] {
  if (axios.isAxiosError(error)) {
    const data: unknown = error.response?.data
    if (data && typeof data === 'object' && Array.isArray((data as { motivos?: unknown }).motivos)) {
      return ((data as { motivos: unknown[] }).motivos).map(String)
    }
  }
  return [mensajeDeError(error)]
}

export type FiltrosViajes = Record<string, string | number | undefined>

export const listarViajes = async (params: FiltrosViajes) => (await http.get<Pagina<ViajeApi>>('/viajes/', { params })).data
export const obtenerViaje = async (id: number) => (await http.get<ViajeApi>(`/viajes/${id}/`)).data
export const historialViaje = async (id: number) => (await http.get<HistorialApi[]>(`/viajes/${id}/historial/`)).data
export const generarViajes = async (desde: string, hasta: string) => (await http.post<ResumenGeneracion>('/viajes/generar/', { desde, hasta })).data
export const asignarVehiculo = async (id: number, vehiculo: number | null) => (await http.post<ViajeApi>(`/viajes/${id}/vehiculo/`, { vehiculo })).data
export const asignarConductor = async (id: number, conductor: number, rol: RolConductor) => (await http.post<ViajeApi>(`/viajes/${id}/conductor/`, { conductor, rol })).data
export const quitarConductor = async (id: number, conductor: number) => (await http.post<ViajeApi>(`/viajes/${id}/quitar-conductor/`, { conductor })).data
export const cambiarEstadoViaje = async (id: number, estado: EstadoViaje, observacion = '') => (await http.post<ViajeApi>(`/viajes/${id}/estado/`, { estado, observacion })).data
export const editarPrecio = async (id: number, precio_base: number) => (await http.patch<ViajeApi>(`/viajes/${id}/`, { precio_base })).data

export const listarIncidencias = async (params: FiltrosViajes = {}) => (await http.get<Pagina<IncidenciaApi>>('/incidencias/', { params })).data
export const crearIncidencia = async (d: { viaje: number; tipo: string; severidad: string; descripcion: string }) => (await http.post<IncidenciaApi>('/incidencias/', d)).data
export const resolverIncidencia = async (id: number, resolucion: string) => (await http.patch<IncidenciaApi>(`/incidencias/${id}/`, { resuelta: true, resolucion })).data
export const listarAlertas = async () => (await http.get<AlertaApi[]>('/alertas/')).data
