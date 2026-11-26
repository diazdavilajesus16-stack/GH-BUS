import { http } from './http'

export interface TicketValidationResponse {
  message: string
  ticket: {
    id: string
    trip_code: string
    seat_number: number
    passenger: string
    status: 'BOARDED'
    boarded_at: string
  }
}

export const ticketsApi = {
  validate: async (qrCode: string): Promise<TicketValidationResponse> => {
    const response = await http.post('/tickets/validate/', { qr_code: qrCode })
    return response.data
  },
}
