import { http } from './http'

export type TripSettlementStatus = 'PENDING' | 'DRAFT' | 'CLOSED'
export type TripExpenseCategory = 'FUEL' | 'TOLL' | 'PER_DIEM' | 'OTHER'

export interface TripExpense {
  id: number
  category: TripExpenseCategory
  category_label: string
  amount: string
  description: string
  created_at: string
  created_by_name: string
}

export interface TripSettlement {
  trip_id: number
  trip_code: string
  origin: string
  destination: string
  departure_at: string
  settlement_id: number | null
  settlement_status: TripSettlementStatus
  settlement_closed_at: string | null
  income_total: string
  expense_total: string
  net_total: string
  expenses: TripExpense[]
}

export interface TripSettlementsPage {
  count: number
  next: string | null
  previous: string | null
  results: TripSettlement[]
}

export interface TripSettlementFilters {
  search?: string
  status?: TripSettlementStatus | ''
  page?: number
}

export async function listarLiquidaciones(filters: TripSettlementFilters): Promise<TripSettlementsPage> {
  const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== '' && value !== undefined))
  return (await http.get<TripSettlementsPage>('/trip-settlements/', { params })).data
}

export async function registrarGastoViaje(
  tripId: number,
  data: { category: TripExpenseCategory; amount: string; description: string },
): Promise<TripExpense> {
  return (await http.post<TripExpense>(`/trip-settlements/${tripId}/expenses/`, data)).data
}

export async function cerrarLiquidacion(tripId: number): Promise<{
  trip_id: number
  status: 'CLOSED'
  income_total: string
  expense_total: string
  net_total: string
  closed_at: string
}> {
  return (await http.post(`/trip-settlements/${tripId}/close/`)).data
}
