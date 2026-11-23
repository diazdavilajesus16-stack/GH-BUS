import React from 'react'; // <-- ESTA LÍNEA ES LA QUE FALTA

interface Seat {
  seat_number: number;
  status: 'AVAILABLE' | 'OCCUPIED';
}

interface SeatMapProps {
  seats: Seat[];
  selectedSeats: number[];
  onSeatClick: (seatNumber: number) => void;
}

export const SeatMap: React.FC<SeatMapProps> = ({ seats, selectedSeats, onSeatClick }) => {
  return (
    <div className="bg-gray-100 p-6 rounded-lg shadow-inner max-w-md mx-auto">
      {/* Cabecera del bus */}
      <div className="text-center text-sm font-bold text-gray-500 mb-4 border-b pb-2">
        🚌 Frente del Bus
      </div>
      
      {/* Cuadrícula de asientos (ej. 4 por fila) */}
      <div className="grid grid-cols-4 gap-3">
        {seats.map((seat) => {
          const isSelected = selectedSeats.includes(seat.seat_number);
          const isOccupied = seat.status === 'OCCUPIED';

          let seatClass = "w-12 h-12 flex items-center justify-center rounded-md cursor-pointer text-sm font-semibold transition-all ";
          
          if (isOccupied) {
            seatClass += "bg-gray-300 text-gray-500 cursor-not-allowed"; // Ocupado
          } else if (isSelected) {
            seatClass += "bg-green-500 text-white shadow-md transform scale-105"; // Seleccionado
          } else {
            seatClass += "bg-white border-2 border-blue-200 text-blue-800 hover:border-blue-500"; // Disponible
          }

          return (
            <div
              key={seat.seat_number}
              className={seatClass}
              onClick={() => !isOccupied && onSeatClick(seat.seat_number)}
            >
              {seat.seat_number}
            </div>
          );
        })}
      </div>

      {/* Referencias */}
      <div className="flex justify-center gap-4 mt-6 text-xs text-gray-600">
        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-white border-2 border-blue-200 rounded"></div> Libre</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-green-500 rounded"></div> Seleccionado</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-gray-300 rounded"></div> Ocupado</div>
      </div>
    </div>
  );
};