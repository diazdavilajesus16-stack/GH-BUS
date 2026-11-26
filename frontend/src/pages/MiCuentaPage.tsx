import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { z } from 'zod'
import { ErrorBox, Field, OkBox, primaryButton } from '@/components/Field'
import { Logo } from '@/components/Logo'
import { TripAssistant } from '@/components/TripAssistant'
import { useAuth } from '@/hooks/useAuth'
import { assistantApi, type AssistantDestination, type AssistantTrip } from '@/services/assistantApi'
import { listarMisReservas, pagarMiReserva, type PaginaReservasCliente, type ReservaCliente } from '@/services/customerReservationsApi'
import { mensajeDeError } from '@/services/http'
import { actualizarPerfil, cambiarClave } from '@/services/usersApi'
import { toRoles } from '@/utils/roles'
import { claveSchema, telefonoSchema } from '@/utils/validation'
import { STAFF_ROLES } from '@/types/auth'

const perfilSchema = z.object({
  first_name: z.string().trim().min(1, 'Ingresa tus nombres').max(150),
  last_name: z.string().trim().min(1, 'Ingresa tus apellidos').max(150),
  email: z.email('Ingresa un correo válido'),
  telefono: telefonoSchema,
})
type PerfilForm = z.infer<typeof perfilSchema>

const claveFormSchema = z
  .object({ current_password: z.string().min(1, 'Ingresa tu contraseña actual'), new_password: claveSchema, confirm: z.string() })
  .refine((v) => v.new_password === v.confirm, { path: ['confirm'], message: 'Las contraseñas no coinciden' })
type ClaveForm = z.infer<typeof claveFormSchema>

type CuentaIconName = 'user' | 'ticket' | 'data' | 'shield' | 'print' | 'logout' | 'pin' | 'search'

function CuentaIcon({ name }: { name: CuentaIconName }) {
  const icons = {
    user: <><circle cx="12" cy="8" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></>,
    ticket: <><path d="M4 7a2 2 0 0 0 0 4v2a2 2 0 0 0 0 4h16a2 2 0 0 0 0-4v-2a2 2 0 0 0 0-4H4Z" /><path d="M13 7v2m0 3v2m0 3v1" /></>,
    data: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5m-16 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></>,
    shield: <><path d="M12 3 20 6v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3Z" /><path d="m9 12 2 2 4-4" /></>,
    print: <><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v7H6zM18 12h.01" /></>,
    logout: <><path d="M10 17l5-5-5-5m5 5H3" /><path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" /></>,
    pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></>,
  }[name]

  return (
    <svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      {icons}
    </svg>
  )
}

function PerfilSection() {
  const { user, setUser } = useAuth()
  const [ok, setOk] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PerfilForm>({
    resolver: zodResolver(perfilSchema),
    defaultValues: {
      first_name: user?.first_name ?? '',
      last_name: user?.last_name ?? '',
      email: user?.email ?? '',
      telefono: user?.telefono ?? '',
    },
  })

  const onSubmit = async (values: PerfilForm) => {
    setOk(null)
    setErr(null)
    try {
      const nuevo = await actualizarPerfil(values)
      setUser({ ...nuevo, roles: toRoles(nuevo.roles) })
      setOk('Datos actualizados.')
    } catch (error) {
      setErr(mensajeDeError(error))
    }
  }

  return (
    <section className="customer-card customer-card--profile">
      <header className="customer-card__heading">
        <span className="customer-card__icon"><CuentaIcon name="data" /></span>
        <div>
          <h2>Mis datos</h2>
          <p>Usuario a cargo: <strong>{user?.username}</strong> · Rol: {user?.roles.join(', ') || 'sin rol'}</p>
        </div>
      </header>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="customer-form">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="first_name" label="Nombres" registration={register('first_name')} error={errors.first_name} />
          <Field id="last_name" label="Apellidos" registration={register('last_name')} error={errors.last_name} />
          <Field id="email" label="Correo" type="email" registration={register('email')} error={errors.email} />
          <Field id="telefono" label="Teléfono" type="tel" registration={register('telefono')} error={errors.telefono} />
        </div>
        <OkBox message={ok} />
        <ErrorBox message={err} />
        <button type="submit" disabled={isSubmitting} className={`${primaryButton} customer-button sm:w-auto`}>
          Guardar cambios
        </button>
      </form>
    </section>
  )
}

function ClaveSection() {
  const { endSession } = useAuth()
  const navigate = useNavigate()
  const [err, setErr] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ClaveForm>({ resolver: zodResolver(claveFormSchema) })

  const onSubmit = async (v: ClaveForm) => {
    setErr(null)
    try {
      await cambiarClave(v.current_password, v.new_password)
      // El servidor cerró todas las sesiones: se vuelve a iniciar con la nueva clave.
      endSession()
      navigate('/login', { replace: true })
    } catch (error) {
      setErr(mensajeDeError(error))
    }
  }

  return (
    <section className="customer-card customer-card--security">
      <header className="customer-card__heading">
        <span className="customer-card__icon"><CuentaIcon name="shield" /></span>
        <div>
          <h2>Cambiar contraseña</h2>
          <p>Al cambiarla se cerrarán tus sesiones en todos los dispositivos.</p>
        </div>
      </header>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="customer-form customer-form--password">
        <Field id="current_password" label="Contraseña actual" type="password" autoComplete="current-password" registration={register('current_password')} error={errors.current_password} />
        <Field id="new_password" label="Nueva contraseña" type="password" autoComplete="new-password" registration={register('new_password')} error={errors.new_password} />
        <Field id="confirm" label="Repite la nueva contraseña" type="password" autoComplete="new-password" registration={register('confirm')} error={errors.confirm} />
        <ErrorBox message={err} />
        <button type="submit" disabled={isSubmitting} className={`${primaryButton} customer-button sm:w-auto`}>
          {isSubmitting ? 'Actualizando...' : 'Cambiar contraseña'}
        </button>
      </form>
    </section>
  )
}

const moneda = (valor: string) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(valor))

const fechaHora = (valor: string) =>
  new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(valor))

function estadoReserva(estado: ReservaCliente['status']) {
  return {
    PENDING: 'Pendiente de pago',
    CONFIRMED: 'Confirmada',
    EXPIRED: 'Expirada',
    CANCELLED: 'Cancelada',
  }[estado]
}

function estadoBoleto(estado: ReservaCliente['tickets'][number]['status']) {
  return {
    RESERVED: 'Reservado',
    PAID: 'Pagado',
    BOARDED: 'Abordado',
    CANCELLED: 'Anulado',
    EXPIRED: 'Expirado',
  }[estado]
}

function MisReservasSection() {
  const [pagina, setPagina] = useState<PaginaReservasCliente | null>(null)
  const [paginaActual, setPaginaActual] = useState(1)
  const [recarga, setRecarga] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [pagando, setPagando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  const recargar = useCallback(() => setRecarga((valor) => valor + 1), [])

  useEffect(() => {
    let cancelado = false
    listarMisReservas(paginaActual)
      .then((resultado) => {
        if (!cancelado) {
          setPagina(resultado)
          setError(null)
        }
      })
      .catch((requestError: unknown) => {
        if (!cancelado) {
          setPagina(null)
          setError(mensajeDeError(requestError))
        }
      })
      .finally(() => {
        if (!cancelado) setCargando(false)
      })
    return () => { cancelado = true }
  }, [paginaActual, recarga])

  const pagar = async (reserva: ReservaCliente) => {
    setPagando(reserva.id)
    setError(null)
    setMensaje(null)
    try {
      await pagarMiReserva(reserva.id)
      setMensaje('Pago simulado correcto. Tus boletos y códigos QR ya están disponibles.')
      setCargando(true)
      recargar()
    } catch (requestError) {
      setError(mensajeDeError(requestError))
      setCargando(true)
      recargar()
    } finally {
      setPagando(null)
    }
  }

  const cambiarPagina = (numero: number) => {
    setCargando(true)
    setPaginaActual(numero)
  }

  return (
    <section id="mis-reservas" className="customer-card customer-card--reservations">
      <div className="customer-print-brand" aria-hidden="true">
        <strong>GH BUS</strong>
        <span>Boleto digital</span>
      </div>
      <header className="customer-card__heading customer-card__heading--actions">
        <span className="customer-card__icon"><CuentaIcon name="ticket" /></span>
        <div className="customer-card__heading-copy">
          <h2>Mis reservas y boletos</h2>
          <p>Consulta tus rutas, pagos y boletos asociados a tu cuenta.</p>
        </div>
        <button
          type="button"
          disabled={cargando || !pagina?.count}
          className="customer-button customer-button--secondary customer-print-button"
          onClick={() => window.print()}
        >
          <CuentaIcon name="print" />
          Imprimir
        </button>
      </header>
      <OkBox message={mensaje} />
      <ErrorBox message={error} />
      {cargando && <p className="customer-empty-state">Cargando tus reservas...</p>}
      {!cargando && pagina?.results.length === 0 && (
        <div className="customer-empty-state">
          <CuentaIcon name="ticket" />
          <p>Aún no tienes reservas asociadas a esta cuenta.</p>
          <span>Cuando reserves, aquí verás la ciudad de origen, tu destino elegido y tus boletos.</span>
        </div>
      )}
      {!cargando && pagina?.results.map((reserva) => (
        <article key={reserva.id} className="customer-reservation">
          <div className="customer-reservation__top">
            <div>
              <span className="customer-reservation__eyebrow">Viaje {reserva.trip_code}</span>
              <p className={`customer-status customer-status--${reserva.status.toLowerCase()}`}>
                {estadoReserva(reserva.status)}
              </p>
            </div>
            <div className="customer-reservation__total">
              <span>Total</span>
              <strong>{moneda(reserva.total_amount)}</strong>
            </div>
          </div>

          <div className="customer-route" aria-label={`Ruta de ${reserva.origin} a ${reserva.destination}`}>
            <div className="customer-route__city">
              <span>ORIGEN</span>
              <strong>{reserva.origin}</strong>
            </div>
            <div className="customer-route__connector" aria-hidden="true"><span /></div>
            <div className="customer-route__city customer-route__city--destination">
              <span>DESTINO ELEGIDO</span>
              <strong>{reserva.destination}</strong>
            </div>
          </div>

          <div className="customer-reservation__details">
            <p><span>Salida</span><strong>{fechaHora(reserva.departure_at)}</strong></p>
            <p><span>Pasajero</span><strong>{reserva.passenger_name || '—'}</strong></p>
            {reserva.tickets.length > 0 && (
              <p><span>Asientos</span><strong>{reserva.tickets.map((boleto) => boleto.seat_number).join(', ')}</strong></p>
            )}
          </div>

          {reserva.status === 'PENDING' && (
            <div className="customer-reservation__payment">
              <p>Vence: {fechaHora(reserva.expires_at)}</p>
              {reserva.payment_method === 'CASH' ? (
                <p className="customer-cash-pending">
                  Pago en efectivo pendiente en caja. Presenta la referencia <strong>{reserva.id}</strong> al cajero.
                </p>
              ) : (
                <>
                  <p>El pago digital disponible en esta cuenta es de demostración y no realiza cobros reales.</p>
                  <button type="button" disabled={pagando !== null} onClick={() => void pagar(reserva)}
                    className="customer-button">
                    {pagando === reserva.id ? 'Procesando...' : 'Simular pago'}
                  </button>
                </>
              )}
            </div>
          )}
          {reserva.tickets.length > 0 && (
            <div className="customer-tickets">
              {reserva.tickets.map((boleto) => (
                <div key={boleto.seat_number} className="customer-ticket">
                  {boleto.qr_code && boleto.status !== 'CANCELLED' && boleto.status !== 'EXPIRED' && (
                    <QRCodeSVG value={boleto.qr_code} size={88} aria-label={`QR del asiento ${boleto.seat_number}`} />
                  )}
                  <div>
                    <p className="customer-ticket__seat">Asiento {boleto.seat_number}</p>
                    <p className="customer-ticket__status">{estadoBoleto(boleto.status)}</p>
                    {boleto.qr_code && boleto.status !== 'CANCELLED' && boleto.status !== 'EXPIRED' && (
                      <p className="customer-ticket__code">{boleto.qr_code}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>
      ))}
      <div className="customer-pagination">
        <span>{pagina?.count ?? 0} reserva(s)</span>
        <div>
          <button type="button" disabled={!pagina?.previous} onClick={() => cambiarPagina(Math.max(1, paginaActual - 1))}>
            Anterior
          </button>
          <span>Página {paginaActual}</span>
          <button type="button" disabled={!pagina?.next} onClick={() => cambiarPagina(paginaActual + 1)}>
            Siguiente
          </button>
        </div>
      </div>
    </section>
  )
}

function DestinosSection() {
  const [ciudades, setCiudades] = useState<AssistantDestination[]>([])
  const [origen, setOrigen] = useState('')
  const [destino, setDestino] = useState('')
  const [fecha, setFecha] = useState('')
  const [viajes, setViajes] = useState<AssistantTrip[]>([])
  const [respuesta, setRespuesta] = useState<string | null>(null)
  const [errorCiudades, setErrorCiudades] = useState<string | null>(null)
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null)
  const [cargandoCiudades, setCargandoCiudades] = useState(true)
  const [buscando, setBuscando] = useState(false)
  const [mostrarTodas, setMostrarTodas] = useState(false)

  useEffect(() => {
    let cancelado = false
    assistantApi.destinations()
      .then((resultado) => {
        if (!cancelado) {
          setCiudades(resultado)
          setErrorCiudades(null)
        }
      })
      .catch((requestError: unknown) => {
        if (!cancelado) setErrorCiudades(mensajeDeError(requestError))
      })
      .finally(() => {
        if (!cancelado) setCargandoCiudades(false)
      })
    return () => { cancelado = true }
  }, [])

  const limpiarResultados = () => {
    setViajes([])
    setRespuesta(null)
    setErrorBusqueda(null)
  }

  const buscarViajes = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!origen || !destino) {
      setErrorBusqueda('Elige una ciudad de origen y un destino.')
      return
    }
    if (origen === destino) {
      setErrorBusqueda('El origen y el destino deben ser ciudades diferentes.')
      return
    }

    setBuscando(true)
    setErrorBusqueda(null)
    setRespuesta(null)
    setViajes([])
    try {
      const resultado = await assistantApi.chat({
        message: '',
        origin: origen,
        destination: destino,
        ...(fecha ? { departure_date: fecha } : {}),
      })
      setViajes(resultado.trips)
      setRespuesta(resultado.answer)
    } catch (requestError) {
      setErrorBusqueda(mensajeDeError(requestError))
    } finally {
      setBuscando(false)
    }
  }

  const ciudadesVisibles = mostrarTodas ? ciudades : ciudades.slice(0, 6)

  return (
    <section id="explorar-destinos" className="customer-card customer-card--destinations">
      <header className="customer-card__heading">
        <span className="customer-card__icon"><CuentaIcon name="pin" /></span>
        <div>
          <h2>Explora tu próximo destino</h2>
          <p>Elige una ciudad y consulta los viajes programados para tu ruta.</p>
        </div>
      </header>

      <form className="customer-destination-search" onSubmit={(event) => void buscarViajes(event)}>
        <label>
          <span>Ciudad de origen</span>
          <select
            value={origen}
            onChange={(event) => {
              const nuevoOrigen = event.target.value
              setOrigen(nuevoOrigen)
              if (nuevoOrigen === destino) setDestino('')
              limpiarResultados()
            }}
            disabled={cargandoCiudades || ciudades.length === 0 || buscando}
            required
          >
            <option value="">Selecciona el origen</option>
            {ciudades.map((ciudad) => (
              <option key={ciudad.id} value={ciudad.nombre}>{ciudad.nombre} · {ciudad.departamento}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Fecha de salida <small>(opcional)</small></span>
          <input type="date" value={fecha} disabled={buscando} onChange={(event) => {
            setFecha(event.target.value)
            limpiarResultados()
          }} />
        </label>
        <button type="submit" className="customer-button customer-destination-search__button"
          disabled={cargandoCiudades || ciudades.length === 0 || !origen || !destino || buscando}>
          <CuentaIcon name="search" />
          {buscando ? 'Buscando viajes...' : 'Buscar viajes'}
        </button>
      </form>

      {cargandoCiudades && <p className="customer-destination-note" role="status">Cargando ciudades disponibles...</p>}
      <ErrorBox message={errorCiudades} />
      {!cargandoCiudades && !errorCiudades && ciudades.length === 0 && (
        <div className="customer-empty-state">
          <CuentaIcon name="pin" />
          <p>Aún no hay ciudades disponibles.</p>
          <span>Cuando se configuren rutas activas, podrás elegir tu destino aquí.</span>
        </div>
      )}
      {!cargandoCiudades && ciudades.length > 0 && (
        <>
          <div className="customer-destination-grid" aria-label="Ciudades disponibles para elegir como destino">
            {ciudadesVisibles.map((ciudad) => {
              const seleccionada = destino === ciudad.nombre
              const esOrigen = origen === ciudad.nombre
              return (
                <button
                  type="button"
                  key={ciudad.id}
                  className={`customer-destination-tile${seleccionada ? ' is-selected' : ''}`}
                  aria-pressed={seleccionada}
                  disabled={esOrigen || buscando}
                  onClick={() => {
                    setDestino(ciudad.nombre)
                    limpiarResultados()
                  }}
                >
                  <span className="customer-destination-tile__pin"><CuentaIcon name="pin" /></span>
                  <span className="customer-destination-tile__name">{ciudad.nombre}</span>
                  <span className="customer-destination-tile__department">{ciudad.departamento}</span>
                  <span className="customer-destination-tile__action">
                    {esOrigen ? 'Es tu origen' : seleccionada ? 'Destino elegido' : 'Elegir destino'}
                  </span>
                </button>
              )
            })}
          </div>
          {ciudades.length > 6 && (
            <button type="button" className="customer-destination-more" onClick={() => setMostrarTodas((value) => !value)}>
              {mostrarTodas ? 'Mostrar menos' : `Ver todas las ciudades (${ciudades.length})`}
            </button>
          )}
        </>
      )}

      <ErrorBox message={errorBusqueda} />
      {respuesta && (
        <div className="customer-destination-results" aria-live="polite">
          <p className="customer-destination-results__summary">{respuesta}</p>
          {viajes.length > 0 && (
            <div className="customer-trip-grid">
              {viajes.map((viaje) => (
                <article key={viaje.id} className="customer-trip-card">
                  <div className="customer-trip-card__route">
                    <span>{viaje.origen}</span>
                    <span aria-hidden="true">→</span>
                    <strong>{viaje.destino}</strong>
                  </div>
                  <p className="customer-trip-card__date">{fechaHora(viaje.salida)}</p>
                  <div className="customer-trip-card__details">
                    <span>{viaje.servicio}</span>
                    <strong>{moneda(viaje.precio)}</strong>
                  </div>
                  <div className="customer-trip-card__footer">
                    <span>{viaje.asientos_disponibles > 0 ? `${viaje.asientos_disponibles} asientos disponibles` : 'Sin asientos disponibles'}</span>
                    <Link
                      to={`/reservar/${viaje.id}`}
                      className="customer-button"
                      aria-disabled={viaje.asientos_disponibles === 0}
                      tabIndex={viaje.asientos_disponibles === 0 ? -1 : undefined}
                      onClick={(event) => {
                        if (viaje.asientos_disponibles === 0) event.preventDefault()
                      }}
                    >
                      Elegir asiento
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
      <p className="customer-destination-disclaimer">La disponibilidad puede cambiar antes de completar la reserva.</p>
    </section>
  )
}

/** «Mi cuenta»: la ven todos los roles. Para clientes es su pantalla de inicio. */
export function MiCuentaContent() {
  const { user } = useAuth()
  const nombre = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || 'Cliente'
  const esCliente = !!user?.roles.includes('cliente')
  return (
    <div className="customer-content">
      <header className="customer-page-heading">
        <span className="customer-page-heading__icon"><CuentaIcon name="user" /></span>
        <div>
          <p className="customer-page-heading__eyebrow">Tu espacio personal</p>
          <h1>Mi cuenta</h1>
          <p className="customer-page-heading__subtitle">Hola, {nombre}. Gestiona tus datos y viajes desde un solo lugar.</p>
        </div>
        {esCliente && (
          <a className="customer-page-heading__link" href="#mis-reservas">
            Ver mis viajes <span aria-hidden="true">→</span>
          </a>
        )}
      </header>
      <div className="customer-content__sections">
        {esCliente && <MisReservasSection />}
        {esCliente && <DestinosSection />}
        <PerfilSection />
        <ClaveSection />
      </div>
    </div>
  )
}

/** Versión para clientes: sin menú del panel, con cabecera sencilla. */
export function MiCuentaClientePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const esPersonal = !!user?.roles.some((r) => STAFF_ROLES.includes(r))
  return (
    <div className="customer-page">
      <header className="customer-topbar">
        <div className="customer-topbar__inner">
          <Link to="/" className="customer-topbar__brand" aria-label="GH BUS, inicio">
            <Logo />
          </Link>
          <div className="customer-topbar__actions">
            {esPersonal && (
              <Link to="/panel" className="customer-topbar__staff-link">
                Ir al panel
              </Link>
            )}
            <span className="customer-topbar__account"><CuentaIcon name="user" />{user?.username}</span>
            <button
              type="button"
              className="customer-topbar__logout"
              onClick={async () => {
                await logout()
                navigate('/login', { replace: true })
              }}
            >
              <CuentaIcon name="logout" />
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>
      <main className="customer-page__main">
        <MiCuentaContent />
      </main>
      <div className="customer-page__assistant"><TripAssistant /></div>
    </div>
  )
}
