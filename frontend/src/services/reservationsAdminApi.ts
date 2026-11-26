import { http } from './http'

export type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED'

export interface ReservationListItem {
  id: string
  status: ReservationStatus
  payment_method: 'YAPE' | 'VISA' | 'CASH' | ''
  total_amount: string
  created_at: string
  expires_at: string
  trip_code: string
  origin: string
  destination: string
  departure_at: string
  passenger_name: string
  seat_numbers: number[]
}

export interface ReservationsPage {
  count: number
  next: string | null
  previous: string | null
  results: ReservationListItem[]
}

export interface ReservationFilters {
  search?: string
  status?: ReservationStatus | ''
  page?: number
}

export async function listarReservas(filters: ReservationFilters): Promise<ReservationsPage> {
  const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== '' && value !== undefined))
  return (await http.get<ReservationsPage>('/reservations/management/', { params })).data
}

export async function confirmarPagoEfectivo(reservationId: string): Promise<void> {
  await http.post(`/reservations/${reservationId}/pay/`, { payment_method: 'CASH' })
}
