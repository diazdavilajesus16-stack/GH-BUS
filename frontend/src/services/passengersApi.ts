import { http } from './http'

export interface PassengerListItem {
  id: number
  document_type: 'DNI' | 'CE' | 'PASSPORT'
  document_number: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  created_at: string
  ticket_count: number
}

export interface PassengersPage {
  count: number
  next: string | null
  previous: string | null
  results: PassengerListItem[]
}

export interface PassengerFilters {
  search?: string
  page?: number
}

export async function listarPasajeros(filters: PassengerFilters): Promise<PassengersPage> {
  const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== '' && value !== undefined))
  return (await http.get<PassengersPage>('/passengers/management/', { params })).data
}
