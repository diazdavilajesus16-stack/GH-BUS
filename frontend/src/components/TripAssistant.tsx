import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { assistantApi, type AssistantTrip } from '@/services/assistantApi'
import { mensajeDeError } from '@/services/http'

interface AssistantMessage {
  id: number
  role: 'assistant' | 'user'
  text: string
  trips?: AssistantTrip[]
  resultsTruncated?: boolean
  tripsAreAlternatives?: boolean
}

const fechaHora = (value: string) =>
  new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))

const moneda = (value: string) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(value))

export function TripAssistant() {
  const [open, setOpen] = useState(false)
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [departureDate, setDepartureDate] = useState('')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      id: 0,
      role: 'assistant',
      text: '¡Hola! Puedo orientarte sobre reservas y consultar viajes disponibles. Para buscar, completa origen, destino y, si quieres, la fecha.',
    },
  ])
  const nextId = useRef(1)
  const endOfMessages = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) endOfMessages.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  const agregarMensaje = (message: Omit<AssistantMessage, 'id'>) => {
    setMessages((current) => [...current, { id: nextId.current++, ...message }])
  }

  const enviar = async (question: string, searchRequired = false) => {
    const origen = origin.trim()
    const destino = destination.trim()
    const tieneRuta = Boolean(origen && destino)
    if (searchRequired && !tieneRuta) {
      agregarMensaje({ role: 'assistant', text: 'Para buscar un viaje, indica tanto el origen como el destino.' })
      return
    }

    const pregunta = question.trim()
    const textoUsuario = pregunta || `Buscar viajes: ${origen} → ${destino}${departureDate ? ` · ${departureDate}` : ''}`
    const history = messages.slice(1).slice(-8).map(({ role, text }) => ({ role, content: text }))
    agregarMensaje({ role: 'user', text: textoUsuario })
    setDraft('')
    setSending(true)

    try {
      const resultado = await assistantApi.chat({
        message: pregunta,
        ...(tieneRuta
          ? {
              origin: origen,
              destination: destino,
              ...(departureDate ? { departure_date: departureDate } : {}),
            }
          : {}),
        ...(history.length > 0 ? { history } : {}),
      })
      agregarMensaje({
        role: 'assistant',
        text: resultado.answer,
        trips: searchRequired ? resultado.trips : undefined,
        resultsTruncated: searchRequired ? resultado.results_truncated : undefined,
        tripsAreAlternatives: searchRequired ? resultado.trips_are_alternatives : undefined,
      })
    } catch (error) {
      agregarMensaje({
        role: 'assistant',
        text: mensajeDeError(error, 'No se pudo responder ahora. Inténtalo más tarde.'),
      })
    } finally {
      setSending(false)
    }
  }

  const enviarPregunta = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (draft.trim()) void enviar(draft)
  }

  const buscarViajes = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void enviar('', true)
  }

  return (
    <div className="trip-assistant">
      {open && (
        <section id="trip-assistant-panel" className="trip-assistant__panel" aria-label="Asistente de viajes">
          <header className="trip-assistant__header">
            <span className="trip-assistant__spark" aria-hidden="true">✦</span>
            <div>
              <h2>Asistente de viajes</h2>
              <p>GH BUS · Respuestas con información del sistema</p>
            </div>
            <button type="button" className="trip-assistant__close" aria-label="Cerrar asistente" onClick={() => setOpen(false)}>
              ×
            </button>
          </header>

          <form className="trip-assistant__search" onSubmit={buscarViajes}>
            <p className="trip-assistant__section-title">Consultar viajes</p>
            <div className="trip-assistant__route-fields">
              <label>
                Origen
                <input value={origin} onChange={(event) => setOrigin(event.target.value)} maxLength={80} autoComplete="off" />
              </label>
              <label>
                Destino
                <input value={destination} onChange={(event) => setDestination(event.target.value)} maxLength={80} autoComplete="off" />
              </label>
              <label className="trip-assistant__date">
                Fecha (opcional)
                <input type="date" value={departureDate} onChange={(event) => setDepartureDate(event.target.value)} />
              </label>
            </div>
            <button type="submit" className="trip-assistant__search-button" disabled={sending}>
              Buscar disponibilidad
            </button>
          </form>

          <div className="trip-assistant__messages" aria-live="polite">
            {messages.map((message) => (
              <div key={message.id} className={`trip-assistant__message trip-assistant__message--${message.role}`}>
                <p>{message.text}</p>
                {message.tripsAreAlternatives && (
                  <p className="trip-assistant__alternative-notice">
                    No encontramos viajes en la fecha elegida. Estas son otras fechas disponibles:
                  </p>
                )}
                {message.trips?.map((trip) => (
                  <article className="trip-assistant__trip" key={trip.id}>
                    <strong>{trip.origen} → {trip.destino}</strong>
                    <span>{fechaHora(trip.salida)} · {trip.servicio}</span>
                    <span>{moneda(trip.precio)} · {trip.asientos_disponibles} de {trip.capacidad} asientos disponibles</span>
                    {trip.asientos_disponibles > 0 ? (
                      <Link to={`/reservar/${trip.id}`} onClick={() => setOpen(false)}>
                        Elegir asientos
                      </Link>
                    ) : (
                      <span className="trip-assistant__sold-out">Sin asientos disponibles</span>
                    )}
                  </article>
                ))}
                {message.resultsTruncated && (
                  <p className="trip-assistant__more-results">Hay más opciones. Prueba con una fecha para acotar la búsqueda.</p>
                )}
              </div>
            ))}
            {sending && <p className="trip-assistant__typing" role="status">Consultando...</p>}
            <div ref={endOfMessages} />
          </div>

          <form className="trip-assistant__composer" onSubmit={enviarPregunta}>
            <label className="sr-only" htmlFor="trip-assistant-message">Escribe tu pregunta</label>
            <textarea
              id="trip-assistant-message"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={1000}
              placeholder="¿Cómo puedo reservar?"
              rows={2}
              disabled={sending}
            />
            <button type="submit" disabled={sending || !draft.trim()} aria-label="Enviar pregunta">
              Enviar
            </button>
          </form>
          <p className="trip-assistant__privacy">
            No compartas documentos, teléfonos, datos de pago ni códigos QR. La IA no realiza reservas ni cobros.
            {' '}<Link to="/contacto">Contacto</Link>
          </p>
        </section>
      )}

      <button
        type="button"
        className="trip-assistant__toggle"
        aria-expanded={open}
        aria-controls="trip-assistant-panel"
        aria-label={open ? 'Cerrar asistente de viajes' : 'Abrir asistente de viajes'}
        onClick={() => setOpen((current) => !current)}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 9h10M7 13h6m-8 7 2.2-3.3A8 8 0 1 1 19 17H9a8 8 0 0 1-4-.9L3 20Z" />
        </svg>
        <span>{open ? 'Cerrar' : 'Ayuda con tu viaje'}</span>
      </button>
    </div>
  )
}
