import { http } from './http'

export interface AssistantTrip {
  id: number
  codigo: string
  origen: string
  destino: string
  salida: string
  servicio: string
  precio: string
  capacidad: number
  asientos_disponibles: number
}

export interface AssistantDestination {
  id: number
  nombre: string
  departamento: string
}

export interface AssistantChatRequest {
  message: string
  origin?: string
  destination?: string
  departure_date?: string
  history?: { role: 'user' | 'assistant'; content: string }[]
}

export interface AssistantChatResponse {
  answer: string
  trips: AssistantTrip[]
  results_truncated: boolean
  trips_are_alternatives: boolean
}

export const assistantApi = {
  destinations: async (): Promise<AssistantDestination[]> => {
    const response = await http.get<AssistantDestination[]>('/assistant/destinations/')
    return response.data
  },
  chat: async (request: AssistantChatRequest): Promise<AssistantChatResponse> => {
    const response = await http.post<AssistantChatResponse>('/assistant/chat/', request, { timeout: 30000 })
    return response.data
  },
}
