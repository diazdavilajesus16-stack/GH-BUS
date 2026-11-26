import { http } from './http';

export interface Seat {
  seat_number: number;
  status: 'AVAILABLE' | 'OCCUPIED';
}

export interface SeatMapResponse {
  trip_id: number;
  seats: Seat[];
}

export type PaymentMethod = 'YAPE' | 'VISA' | 'CASH'

export interface PassengerData {
  document_number: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
}

export interface ReservationPayload {
  trip_id: number;
  seats: number[];
  passenger: PassengerData;
}

export interface CreateReservationResponse {
  message: string
  reservation_id: string
  total_amount: string
  expires_at: string
}

export interface PaidTicket {
  seat_number: number;
  qr_code: string;
}

export interface PayReservationResponse {
  message: string;
  tickets: PaidTicket[];
  status?: 'PENDING' | 'CONFIRMED'
  payment_method?: PaymentMethod
  expires_at?: string
}

export const reservationsApi = {
  getSeatMap: async (tripId: number): Promise<SeatMapResponse> => {
    const response = await http.get<SeatMapResponse>(`/trips/${tripId}/seats/`);
    return response.data;
  },

  createReservation: async (payload: ReservationPayload): Promise<CreateReservationResponse> => {
    const response = await http.post<CreateReservationResponse>('/reservations/', payload);
    return response.data;
  },

  payReservation: async (reservationId: string, paymentMethod?: PaymentMethod): Promise<PayReservationResponse> => {
    const body = paymentMethod ? { payment_method: paymentMethod } : {}
    const response = await http.post<PayReservationResponse>(`/reservations/${reservationId}/pay/`, body);
    return response.data;
  },
};