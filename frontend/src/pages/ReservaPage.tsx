import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SeatMap } from '../components/SeatMap';
import { reservationsApi } from '../services/reservations';
import type { Seat } from '../services/reservations';

export const ReservaPage = () => {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  
  const [seats, setSeats] = useState<Seat[]>([]);
  const [selectedSeats, setSelectedSeats] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Estados para el flujo de pago
  const [reservationId, setReservationId] = useState<string | null>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [paying, setPaying] = useState(false);

  const [formData, setFormData] = useState({
    document_number: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: ''
  });

  useEffect(() => {
    if (tripId) {
      reservationsApi.getSeatMap(Number(tripId))
        .then(res => setSeats(res.seats))
        .catch(() => setError('Error al cargar los asientos'))
        .finally(() => setLoading(false));
    }
  }, [tripId]);

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
      const res = await reservationsApi.createReservation({
        trip_id: Number(tripId),
        seats: selectedSeats,
        passenger: formData
      });
      setReservationId(res.reservation_id);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al crear la reserva');
    }
  };

  const handlePayment = async () => {
    if (!reservationId) return;
    setPaying(true);
    try {
      const res = await reservationsApi.payReservation(reservationId);
      setTickets(res.tickets);
      // Actualizar el mapa para marcar los asientos como ocupados
      const updatedSeats = seats.map(s => 
        selectedSeats.includes(s.seat_number) ? { ...s, status: 'OCCUPIED' } : s
      );
      setSeats(updatedSeats as Seat[]);
      setSelectedSeats([]);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al procesar el pago');
    } finally {
      setPaying(false);
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

      {/* Columna Derecha: Formulario o Pago */}
      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
        {!reservationId ? (
          <>
            <h2 className="text-xl font-semibold mb-4">Datos del Pasajero</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">DNI / Documento</label>
                <input type="text" required className="mt-1 block w-full border border-gray-300 rounded-md p-2"
                  value={formData.document_number} onChange={e => setFormData({...formData, document_number: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Nombres</label>
                  <input type="text" required className="mt-1 block w-full border border-gray-300 rounded-md p-2"
                    value={formData.first_name} onChange={e => setFormData({...formData, first_name: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Apellidos</label>
                  <input type="text" required className="mt-1 block w-full border border-gray-300 rounded-md p-2"
                    value={formData.last_name} onChange={e => setFormData({...formData, last_name: e.target.value})} />
                </div>
              </div>
              
              <div className="mt-6 border-t pt-4">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-gray-600">Asientos seleccionados:</span>
                  <span className="font-bold text-lg text-blue-800">{selectedSeats.join(', ') || 'Ninguno'}</span>
                </div>
                <button type="submit" className="w-full bg-[#174A72] text-white py-3 rounded-md font-bold hover:bg-[#10243A] transition-colors" disabled={selectedSeats.length === 0}>
                  Reservar Asientos
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="text-center">
            <h2 className="text-2xl font-bold text-green-600 mb-2">¡Reserva Creada!</h2>
            <p className="text-gray-600 mb-6">Tienes 10 minutos para completar el pago o los asientos se liberarán.</p>
            
            {tickets.length === 0 ? (
              <button onClick={handlePayment} disabled={paying} className="w-full bg-green-600 text-white py-3 rounded-md font-bold hover:bg-green-700 transition-colors">
                {paying ? 'Procesando pago...' : 'Pagar Ahora'}
              </button>
            ) : (
              <div className="mt-6 bg-blue-50 p-4 rounded border border-blue-200">
                <h3 className="font-bold text-blue-800 mb-4">¡Pago Exitoso! Tus Boletos:</h3>
                <div className="space-y-2">
                  {tickets.map(t => (
                    <div key={t.seat_number} className="flex justify-between bg-white p-2 rounded shadow-sm">
                      <span className="font-semibold">Asiento {t.seat_number}</span>
                      <span className="text-sm font-mono text-gray-600">{t.qr_code}</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => navigate('/')} className="mt-6 w-full bg-gray-200 text-gray-800 py-2 rounded font-semibold hover:bg-gray-300">
                  Volver al Inicio
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};