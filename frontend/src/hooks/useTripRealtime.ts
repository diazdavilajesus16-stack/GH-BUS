import { useEffect, useRef } from 'react'
import { getSocket } from '@/services/socket'

export interface SeatUpdate {
  trip_id: number
  seat_number: number
  status: 'available' | 'held' | 'sold'
}

/**
 * Escucha en tiempo real los cambios de asientos de un viaje.
 * Es solo un aviso para refrescar la vista: la disponibilidad real siempre la
 * decide el backend de Django al reservar o vender.
 */
export function useTripRealtime(tripId: number | null, onSeatUpdated: (update: SeatUpdate) => void): void {
  const handlerRef = useRef(onSeatUpdated)
  useEffect(() => {
    handlerRef.current = onSeatUpdated
  })

  useEffect(() => {
    if (tripId === null) return
    const socket = getSocket()

    const join = () => socket.emit('trip:join', { trip_id: tripId })
    const onSeat = (update: SeatUpdate) => {
      if (update.trip_id === tripId) handlerRef.current(update)
    }

    socket.on('connect', join) // al reconectar se vuelve a entrar a la sala
    socket.on('seat.updated', onSeat)
    if (socket.connected) join()
    else socket.connect()

    return () => {
      socket.off('connect', join)
      socket.off('seat.updated', onSeat)
      if (socket.connected) socket.emit('trip:leave', { trip_id: tripId })
    }
  }, [tripId])
}
