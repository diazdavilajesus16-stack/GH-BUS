import type { FC } from 'react'
import type { Seat } from '@/services/reservations'

interface SeatMapProps {
  seats: Seat[];
  selectedSeats: number[];
  onSeatClick?: (seatNumber: number) => void;
  readOnly?: boolean;
  variant?: 'default' | 'booking';
}

export const SeatMap: FC<SeatMapProps> = ({
  seats,
  selectedSeats,
  onSeatClick,
  readOnly = false,
  variant = 'default',
}) => {
  const isBooking = variant === 'booking'

  return (
    <div className={isBooking ? 'seat-map seat-map--booking' : 'bg-gray-100 p-6 rounded-lg shadow-inner max-w-md mx-auto'}>
      <div className={isBooking ? 'seat-map__front' : 'text-center text-sm font-bold text-gray-500 mb-4 border-b pb-2'}>
        {isBooking && <span className="seat-map__front-line" aria-hidden="true" />}
        <span>🚌 Frente del Bus</span>
        {isBooking && <span className="seat-map__front-line" aria-hidden="true" />}
      </div>

      <div className={isBooking ? 'seat-map__grid' : 'grid grid-cols-4 gap-3'}>
        {seats.map((seat, index) => {
          const isSelected = selectedSeats.includes(seat.seat_number);
          const isOccupied = seat.status === 'OCCUPIED';

          const seatClass = isBooking
            ? `seat-map__seat seat-map__seat--${isOccupied ? 'occupied' : isSelected ? 'selected' : 'available'}${(index + 1) % 4 === 0 ? ' seat-map__seat--aisle' : ''}`
            : `flex h-12 w-12 items-center justify-center rounded-md text-sm font-semibold transition-all ${
                isOccupied
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : isSelected
                    ? 'bg-green-500 text-white shadow-md transform scale-105'
                    : `bg-white border-2 border-blue-200 text-blue-800 ${readOnly ? 'cursor-default' : 'cursor-pointer hover:border-blue-500'}`
              }`;

          return (
            <button
              key={seat.seat_number}
              type="button"
              className={seatClass}
              disabled={readOnly || isOccupied}
              aria-label={`Asiento ${seat.seat_number}: ${isOccupied ? 'Ocupado' : isSelected ? 'Seleccionado' : 'Libre'}`}
              aria-pressed={isSelected}
              onClick={() => !isOccupied && onSeatClick?.(seat.seat_number)}
            >
              <span className={isBooking ? 'seat-map__number' : undefined}>{seat.seat_number}</span>
            </button>
          );
        })}
      </div>

      <div className={isBooking ? 'seat-map__legend' : 'flex justify-center gap-4 mt-6 text-xs text-gray-600'}>
        <div className={isBooking ? undefined : 'flex items-center gap-1'}>
          <span className={isBooking ? 'seat-map__legend-swatch seat-map__legend-swatch--available' : 'w-3 h-3 bg-white border-2 border-blue-200 rounded'} />
          Libre
        </div>
        <div className={isBooking ? undefined : 'flex items-center gap-1'}>
          <span className={isBooking ? 'seat-map__legend-swatch seat-map__legend-swatch--selected' : 'w-3 h-3 bg-green-500 rounded'} />
          Seleccionado
        </div>
        <div className={isBooking ? undefined : 'flex items-center gap-1'}>
          <span className={isBooking ? 'seat-map__legend-swatch seat-map__legend-swatch--occupied' : 'w-3 h-3 bg-gray-300 rounded'} />
          Ocupado
        </div>
      </div>
    </div>
  );
};