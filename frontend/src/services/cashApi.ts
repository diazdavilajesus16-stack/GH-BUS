import { http } from './http'

export type CashMovementType = 'INCOME' | 'EXPENSE'
export type CashMovementSource = 'SALE' | 'MANUAL'

export interface CashRegister {
  id: number
  owner_name: string
  opening_amount: string
  opened_at: string
  closed_at: string | null
  closing_amount: string | null
  income_total: string
  expense_total: string
  expected_amount: string
}

export interface CashSummary {
  current_register: CashRegister | null
  open_registers: CashRegister[]
  unassigned_sales: {
    count: number
    total: string
  }
}

export interface CashMovement {
  id: number
  cash_register: number | null
  cashier_name: string | null
  reservation: string | null
  movement_type: CashMovementType
  source: CashMovementSource
  amount: string
  description: string
  created_at: string
}

export interface CashMovementsPage {
  count: number
  next: string | null
  previous: string | null
  results: CashMovement[]
}

export interface CashMovementFilters {
  search?: string
  movement_type?: CashMovementType | ''
  page?: number
}

export interface CloseCashRegisterResponse {
  register: CashRegister
  difference: string
}

export async function obtenerResumenCaja(): Promise<CashSummary> {
  return (await http.get<CashSummary>('/cash/summary/')).data
}

export async function listarMovimientosCaja(filters: CashMovementFilters): Promise<CashMovementsPage> {
  const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== '' && value !== undefined))
  return (await http.get<CashMovementsPage>('/cash/movements/', { params })).data
}

export async function abrirCaja(opening_amount: string): Promise<CashRegister> {
  return (await http.post<CashRegister>('/cash/register/open/', { opening_amount })).data
}

export async function registrarMovimientoCaja(data: {
  movement_type: CashMovementType
  amount: string
  description: string
}): Promise<CashMovement> {
  return (await http.post<CashMovement>('/cash/movements/', data)).data
}

export async function cerrarCaja(closing_amount: string): Promise<CloseCashRegisterResponse> {
  return (await http.post<CloseCashRegisterResponse>('/cash/register/close/', { closing_amount })).data
}
