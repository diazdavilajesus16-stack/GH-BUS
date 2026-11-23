import { api } from './api'; // Asegúrate de importar tu instancia de Axios

export interface Seat {
  seat_number: number;
  status: 'AVAILABLE' | 'OCCUPIED';
}

export interface SeatMapResponse {
  trip_id: number;
  seats: Seat[];
}

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

export const reservationsApi = {
  getSeatMap: async (tripId: number): Promise<SeatMapResponse> => {
    const response = await api.get(`/trips/${tripId}/seats/`);
    return response.data;
  },

  createReservation: async (payload: ReservationPayload) => {
    const response = await api.post('/reservations/', payload);
    return response.data;
  },
};