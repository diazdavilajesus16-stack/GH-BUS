import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { SeatMap } from '@/components/SeatMap'
import { Logo } from '@/components/Logo'
import { useAuth } from '@/hooks/useAuth'
import { useTripRealtime } from '@/hooks/useTripRealtime'
import { reservationsApi, type PaidTicket, type PaymentMethod, type Seat } from '@/services/reservations'
import { mensajeDeError } from '@/services/http'

type ReservaIconName = 'seat' | 'user' | 'document' | 'group' | 'check' | 'arrow' | 'logout'

function ReservaIcon({ name }: { name: ReservaIconName }) {
  const iconos = {
    seat: <><path d="M7 4h10a2 2 0 0 1 2 2v5H5V6a2 2 0 0 1 2-2Z" /><path d="M5 11v5m14-5v5M5 16h14M7 16v4m10-4v4" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></>,
    document: <><path d="M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M14 3v5h5M9 13h6m-6 4h6" /></>,
    group: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20a6 6 0 0 1 12 0m1-5a5 5 0 0 1 5 5" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    logout: <><path d="m10 17 5-5-5-5m5 5H3" /><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" /></>,
  }[name]

  return (
    <svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      {iconos}
    </svg>
  )
}

const moneda = (valor: string) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(valor))

const fechaHora = (valor: string) =>
  new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(valor))

export const ReservaPage = () => {
  const { tripId } = useParams<{ tripId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { logout } = useAuth()
  const desdeVentas = searchParams.get('origen') === 'comercial'
  const tripNumber = Number(tripId)
  const tripIsValid = Boolean(tripId && Number.isSafeInteger(tripNumber) && tripNumber > 0)

  const [seats, setSeats] = useState<Seat[]>([])
  const [selectedSeats, setSelectedSeats] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reservationId, setReservationId] = useState<string | null>(null)
  const [tickets, setTickets] = useState<PaidTicket[]>([])
  const [paying, setPaying] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('YAPE')
  const [cashPaymentPending, setCashPaymentPending] = useState(false)
  const [totalAmount, setTotalAmount] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    document_number: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
  })

  useTripRealtime(
    tripIsValid && reservationId === null ? tripNumber : null,
    (update) => {
      const ocupado = update.status !== 'available'
      setSeats((current) =>
        current.map((seat) =>
          seat.seat_number === update.seat_number
            ? { ...seat, status: ocupado ? 'OCCUPIED' : 'AVAILABLE' }
            : seat,
        ),
      )
      if (ocupado && !submitting && selectedSeats.includes(update.seat_number)) {
        setSelectedSeats((current) => current.filter((seat) => seat !== update.seat_number))
        setError(`El asiento ${update.seat_number} acaba de ser reservado. Elige otro asiento.`)
      }
    },
  )

  useEffect(() => {
    let cancelado = false
    if (!tripIsValid) return

    reservationsApi.getSeatMap(tripNumber)
      .then((response) => {
        if (!cancelado) setSeats(response.seats)
      })
      .catch((requestError: unknown) => {
        if (!cancelado) setError(mensajeDeError(requestError, 'No se pudo cargar el mapa de asientos.'))
      })
      .finally(() => {
        if (!cancelado) setLoading(false)
      })
    return () => { cancelado = true }
  }, [tripId, tripIsValid, tripNumber])

  const handleSeatClick = (seatNumber: number) => {
    setError('')
    setSelectedSeats((current) =>
      current.includes(seatNumber)
        ? current.filter((seat) => seat !== seatNumber)
        : [...current, seatNumber],
    )
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (selectedSeats.length === 0) {
      setError('Selecciona al menos un asiento.')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const response = await reservationsApi.createReservation({
        trip_id: Number(tripId),
        seats: selectedSeats,
        passenger: formData,
      })
      setReservationId(response.reservation_id)
      setTotalAmount(response.total_amount)
      setExpiresAt(response.expires_at)
    } catch (requestError: unknown) {
      setError(mensajeDeError(requestError, 'No se pudo crear la reserva. Inténtalo nuevamente.'))
    } finally {
      setSubmitting(false)
    }
  }

  const handlePayment = async () => {
    if (!reservationId) return
    setPaying(true)
    setError('')
    try {
      const response = await reservationsApi.payReservation(reservationId, paymentMethod)
      if (response.status === 'PENDING' && response.payment_method === 'CASH') {
        setCashPaymentPending(true)
        if (response.expires_at) setExpiresAt(response.expires_at)
        return
      }

      setCashPaymentPending(false)
      setTickets(response.tickets)
      setSeats((current) =>
        current.map((seat) => ({
          ...seat,
          status: selectedSeats.includes(seat.seat_number) ? 'OCCUPIED' : seat.status,
        })),
      )
      setSelectedSeats([])
    } catch (requestError: unknown) {
      setError(mensajeDeError(requestError, 'No se pudo procesar el pago simulado.'))
    } finally {
      setPaying(false)
    }
  }

  const cerrarSesion = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="reservation-page">
      <div className="reservation-page__backdrop" aria-hidden="true" />
      <header className="reservation-topbar">
        <div className="reservation-topbar__inner">
          <Link to="/" className="reservation-topbar__brand" aria-label="GH BUS, inicio">
            <Logo />
          </Link>
          <button type="button" className="reservation-topbar__logout" onClick={() => void cerrarSesion()}>
            <ReservaIcon name="logout" />
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="reservation-page__main">
        <h1 className="sr-only">Selecciona tus asientos y completa tu reserva</h1>
        {tripIsValid && loading ? (
          <p className="reservation-loading" role="status">Cargando mapa de asientos...</p>
        ) : (
          <div className="reservation-layout">
            <section className="reservation-panel reservation-panel--seats" aria-labelledby="seat-panel-title">
              <header className="reservation-panel__heading">
                <span className="reservation-panel__icon"><ReservaIcon name="seat" /></span>
                <div>
                  <h2 id="seat-panel-title">Selecciona tus asientos</h2>
                  <p>Elige el asiento de tu preferencia</p>
                </div>
              </header>
              <SeatMap
                seats={seats}
                selectedSeats={selectedSeats}
                onSeatClick={handleSeatClick}
                readOnly={Boolean(reservationId)}
                variant="booking"
              />
            </section>

            <section className="reservation-panel reservation-panel--passenger" aria-labelledby="passenger-panel-title">
              <header className="reservation-panel__heading">
                <span className="reservation-panel__icon reservation-panel__icon--person"><ReservaIcon name="user" /></span>
                <div>
                  <h2 id="passenger-panel-title">{reservationId ? 'Confirma tu reserva' : 'Datos del pasajero'}</h2>
                  <p>{reservationId ? 'Elige cómo completar tu reserva' : 'Completa tus datos para continuar'}</p>
                </div>
              </header>

              {!tripIsValid && <p className="reservation-error" role="alert">El viaje seleccionado no es válido.</p>}
              {error && <p className="reservation-error" role="alert">{error}</p>}

              {!reservationId ? (
                <form onSubmit={(event) => void handleSubmit(event)} className="reservation-form">
                  <label className="reservation-field reservation-field--full">
                    <span>DNI / Documento</span>
                    <span className="reservation-input-wrap">
                      <ReservaIcon name="document" />
                      <input
                        type="text"
                        autoComplete="off"
                        inputMode="numeric"
                        placeholder="Ingresa tu DNI"
                        value={formData.document_number}
                        onChange={(event) => setFormData({ ...formData, document_number: event.target.value })}
                        required
                      />
                    </span>
                  </label>
                  <label className="reservation-field">
                    <span>Nombres</span>
                    <span className="reservation-input-wrap">
                      <ReservaIcon name="user" />
                      <input
                        type="text"
                        autoComplete="given-name"
                        placeholder="Tus nombres"
                        value={formData.first_name}
                        onChange={(event) => setFormData({ ...formData, first_name: event.target.value })}
                        required
                      />
                    </span>
                  </label>
                  <label className="reservation-field">
                    <span>Apellidos</span>
                    <span className="reservation-input-wrap">
                      <ReservaIcon name="user" />
                      <input
                        type="text"
                        autoComplete="family-name"
                        placeholder="Tus apellidos"
                        value={formData.last_name}
                        onChange={(event) => setFormData({ ...formData, last_name: event.target.value })}
                        required
                      />
                    </span>
                  </label>
                  <div className="reservation-selection">
                    <span className="reservation-selection__label">
                      <ReservaIcon name="group" />
                      Asientos seleccionados
                      {selectedSeats.length > 0 && <strong>{selectedSeats.join(', ')}</strong>}
                    </span>
                    <span className="reservation-selection__count" aria-label={`${selectedSeats.length} asientos seleccionados`}>
                      {selectedSeats.length}
                    </span>
                  </div>
                  <button type="submit" className="reservation-submit" disabled={selectedSeats.length === 0 || submitting}>
                    <ReservaIcon name="check" />
                    <span>{submitting ? 'Creando reserva...' : 'Continuar al pago'}</span>
                    {!submitting && <ReservaIcon name="arrow" />}
                  </button>
                </form>
              ) : (
                <div className="reservation-confirmation">
                  {tickets.length === 0 ? (
                    <>
                      <div className="reservation-payment-total">
                        <span>Total a pagar</span>
                        <strong>{totalAmount ? moneda(totalAmount) : '—'}</strong>
                      </div>
                      <div className="reservation-payment-options" aria-label="Método de pago">
                        <button
                          type="button"
                          aria-pressed={paymentMethod === 'YAPE'}
                          className={`reservation-payment-option${paymentMethod === 'YAPE' ? ' is-selected' : ''}`}
                          onClick={() => setPaymentMethod('YAPE')}
                        >
                          <span className="reservation-payment-option__brand reservation-payment-option__brand--yape">Yape</span>
                          <span><strong>Yape</strong><small>Pago de demostración</small></span>
                        </button>
                        <button
                          type="button"
                          aria-pressed={paymentMethod === 'VISA'}
                          className={`reservation-payment-option${paymentMethod === 'VISA' ? ' is-selected' : ''}`}
                          onClick={() => setPaymentMethod('VISA')}
                        >
                          <span className="reservation-payment-option__brand reservation-payment-option__brand--visa">VISA</span>
                          <span><strong>Visa</strong><small>Pago de demostración</small></span>
                        </button>
                        <button
                          type="button"
                          aria-pressed={paymentMethod === 'CASH'}
                          className={`reservation-payment-option${paymentMethod === 'CASH' ? ' is-selected' : ''}`}
                          onClick={() => setPaymentMethod('CASH')}
                        >
                          <span className="reservation-payment-option__brand reservation-payment-option__brand--cash">$</span>
                          <span><strong>Efectivo</strong><small>Pago en caja del terminal</small></span>
                        </button>
                      </div>
                      <p className="reservation-demo-note">
                        Yape y Visa se simulan: no se procesan cobros reales. Para efectivo, presenta tu referencia en caja antes del vencimiento.
                      </p>
                      {cashPaymentPending && (
                        <div className="reservation-cash-status" role="status">
                          <h3>Reserva pendiente de pago en caja</h3>
                          <p>Presenta esta referencia al cajero:</p>
                          <code>{reservationId}</code>
                          <p>Total: <strong>{totalAmount ? moneda(totalAmount) : '—'}</strong></p>
                          {expiresAt && <p>La reserva vence: {fechaHora(expiresAt)}</p>}
                          <p>El cajero registrará el pago y confirmará tus boletos.</p>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => void handlePayment()}
                        disabled={paying || (paymentMethod === 'CASH' && cashPaymentPending)}
                        className="reservation-submit"
                      >
                        {paymentMethod !== 'CASH' && <ReservaIcon name="check" />}
                        <span>
                          {paying
                            ? 'Procesando...'
                            : paymentMethod === 'CASH'
                              ? cashPaymentPending ? 'Pago pendiente en caja' : 'Generar reserva para pagar en caja'
                              : `Simular pago con ${paymentMethod === 'YAPE' ? 'Yape' : 'Visa'}`}
                        </span>
                        {!paying && paymentMethod !== 'CASH' && <ReservaIcon name="arrow" />}
                      </button>
                    </>
                  ) : (
                    <div className="reservation-tickets">
                      <div className="reservation-confirmation__success">
                        <ReservaIcon name="check" />
                        <div>
                          <h3>{paymentMethod === 'CASH' ? '¡Pago en caja registrado!' : '¡Pago simulado exitoso!'}</h3>
                          <p>Tus boletos están confirmados.</p>
                        </div>
                      </div>
                      {tickets.map((ticket) => (
                        <article key={ticket.seat_number} className="reservation-ticket">
                          <span>Asiento {ticket.seat_number}</span>
                          <QRCodeSVG value={ticket.qr_code} size={144} level="M" aria-label={`Código QR del asiento ${ticket.seat_number}`} />
                          <code>{ticket.qr_code}</code>
                        </article>
                      ))}
                      <button
                        type="button"
                        onClick={() => navigate(desdeVentas ? '/panel/comercial/venta' : '/mi-cuenta')}
                        className="reservation-submit"
                      >
                        <span>{desdeVentas ? 'Volver a Venta de boletos' : 'Ir a mis boletos'}</span>
                        <ReservaIcon name="arrow" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
