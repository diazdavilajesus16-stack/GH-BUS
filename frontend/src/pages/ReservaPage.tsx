import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SeatMap } from '../components/SeatMap';
import { reservationsApi } from '../services/reservations';
import type { Seat } from '../services/reservations';
// Si tienes el hook de Socket.IO del Paso 6, importalo aquí para actualizaciones en vivo
// import { useTripRealtime } from '../hooks/useTripRealtime'; 

export const ReservaPage = () => {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  
  const [seats, setSeats] = useState<Seat[]>([]);
  const [selectedSeats, setSelectedSeats] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Datos del pasajero
  const [formData, setFormData] = useState({
    document_number: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: ''
  });

  // 1. Cargar los asientos al montar la página
  useEffect(() => {
    if (tripId) {
      reservationsApi.getSeatMap(Number(tripId))
        .then(res => setSeats(res.seats))
        .catch(() => setError('Error al cargar los asientos'))
        .finally(() => setLoading(false));
    }
  }, [tripId]);

  // (Opcional) 2. Escuchar actualizaciones en tiempo real con Socket.IO
  // useTripRealtime(Number(tripId), (data) => {
  //   // Aquí actualizarías el estado de los asientos si otro usuario reserva
  // });

  const handleSeatClick = (seatNumber: number) => {
    setSelectedSeats(prev => 
      prev.includes(seatNumber) 
        ? prev.filter(s => s !== seatNumber) 
        : [...prev, seatNumber]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedSeats.length === 0) return setError('Selecciona al menos un asiento');
    
    try {
      await reservationsApi.createReservation({
        trip_id: Number(tripId),
        seats: selectedSeats,
        passenger: formData
      });
      alert('¡Reserva creada con éxito! Tienes 10 minutos para pagar.');
      navigate('/panel'); // Redirigir al panel o a una pantalla de pago
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al crear la reserva');
    }
  };

  if (loading) return <div className="p-8 text-center">Cargando mapa de asientos...</div>;

  return (
    <div className="p-8 max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* Columna Izquierda: Mapa */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Selecciona tus asientos</h1>
        {error && <div className="bg-red-100 text-red-700 p-2 rounded mb-4">{error}</div>}
        <SeatMap 
          seats={seats} 
          selectedSeats={selectedSeats} 
          onSeatClick={handleSeatClick} 
        />
      </div>

      {/* Columna Derecha: Formulario de Pasajero */}
      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <h2 className="text-xl font-semibold mb-4">Datos del Pasajero</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">DNI / Documento</label>
            <input 
              type="text" required
              className="mt-1 block w-full border border-gray-300 rounded-md p-2"
              value={formData.document_number}
              onChange={e => setFormData({...formData, document_number: e.target.value})}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Nombres</label>
              <input 
                type="text" required
                className="mt-1 block w-full border border-gray-300 rounded-md p-2"
                value={formData.first_name}
                onChange={e => setFormData({...formData, first_name: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Apellidos</label>
              <input 
                type="text" required
                className="mt-1 block w-full border border-gray-300 rounded-md p-2"
                value={formData.last_name}
                onChange={e => setFormData({...formData, last_name: e.target.value})}
              />
            </div>
          </div>
          
          <div className="mt-6 border-t pt-4">
            <div className="flex justify-between items-center mb-4">
              <span className="text-gray-600">Asientos seleccionados:</span>
              <span className="font-bold text-lg text-blue-800">
                {selectedSeats.length > 0 ? selectedSeats.join(', ') : 'Ninguno'}
              </span>
            </div>
            <button 
              type="submit"
              className="w-full bg-[#174A72] text-white py-3 rounded-md font-bold hover:bg-[#10243A] transition-colors"
              disabled={selectedSeats.length === 0}
            >
              Confirmar Reserva
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};