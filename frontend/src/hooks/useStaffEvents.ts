import { useEffect, useRef } from 'react'
import { getSocket } from '@/services/socket'

export interface Aviso {
  title: string
  message: string
}

/**
 * Avisos en tiempo real para el personal (cambios de estado de viajes, incidencias graves).
 * Son solo señales para refrescar la pantalla: los datos reales siempre se piden a Django.
 */
export function useStaffEvents(handlers: { onTrip?: () => void; onNotification?: (a: Aviso) => void }): void {
  const ref = useRef(handlers)
  useEffect(() => {
    ref.current = handlers
  })

  useEffect(() => {
    const socket = getSocket()
    const join = () => socket.emit('staff:join')
    const onTrip = () => ref.current.onTrip?.()
    const onNotification = (a: Aviso) => ref.current.onNotification?.(a)
    socket.on('connect', join)
    socket.on('trip.status_changed', onTrip)
    socket.on('notification.created', onNotification)
    if (socket.connected) join()
    else socket.connect()
    return () => {
      socket.off('connect', join)
      socket.off('trip.status_changed', onTrip)
      socket.off('notification.created', onNotification)
    }
  }, [])
}
