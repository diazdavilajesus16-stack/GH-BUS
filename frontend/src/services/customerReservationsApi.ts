import { http } from './http'

export interface BoletoCliente {
  seat_number: number
  status: 'RESERVED' | 'PAID' | 'BOARDED' | 'CANCELLED' | 'EXPIRED'
  qr_code: string | null
}

export interface ReservaCliente {
  id: string
  status: 'PENDING' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED'
  payment_method: 'YAPE' | 'VISA' | 'CASH' | ''
  total_amount: string
  created_at: string
  expires_at: string
  confirmed_at: string | null
  trip_code: string
  origin: string
  destination: string
  departure_at: string
  passenger_name: string
  tickets: BoletoCliente[]
}

export interface PaginaReservasCliente {
  count: number
  next: string | null
  previous: string | null
  results: ReservaCliente[]
}

export async function listarMisReservas(page = 1): Promise<PaginaReservasCliente> {
  return (await http.get<PaginaReservasCliente>('/reservations/my/', { params: { page } })).data
}

export async function pagarMiReserva(reservationId: string): Promise<void> {
  await http.post(`/reservations/${reservationId}/pay/`)
}
