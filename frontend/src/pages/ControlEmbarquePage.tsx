import { BrowserMultiFormatReader } from '@zxing/browser'
import type { IScannerControls } from '@zxing/browser'
import { useEffect, useRef, useState } from 'react'
import { mensajeDeError } from '@/services/http'
import { ticketsApi, type TicketValidationResponse } from '@/services/ticketsApi'

export function ControlEmbarquePage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const validatingRef = useRef(false)
  const [scanning, setScanning] = useState(false)
  const [validating, setValidating] = useState(false)
  const [qrCode, setQrCode] = useState('')
  const [error, setError] = useState('')
  const [scannerError, setScannerError] = useState('')
  const [validatedTicket, setValidatedTicket] = useState<TicketValidationResponse['ticket'] | null>(null)

  const validateTicket = async (value: string) => {
    const code = value.trim()
    if (!code) {
      setError('Ingresa o escanea el código QR del boleto.')
      return
    }

    controlsRef.current?.stop()
    controlsRef.current = null
    setScanning(false)
    validatingRef.current = true
    setValidating(true)
    setError('')
    setValidatedTicket(null)
    try {
      const response = await ticketsApi.validate(code)
      setValidatedTicket(response.ticket)
      setQrCode('')
    } catch (validationError) {
      setError(mensajeDeError(validationError, 'No se pudo validar el boleto.'))
    } finally {
      validatingRef.current = false
      setValidating(false)
    }
  }

  const startScanning = async () => {
    if (!videoRef.current || scanning) return
    setScannerError('')
    setScanning(true)

    try {
      const reader = new BrowserMultiFormatReader()
      const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result, _decodeError, activeControls) => {
        if (!result || validatingRef.current) return
        activeControls.stop()
        controlsRef.current = null
        setScanning(false)
        void validateTicket(result.getText())
      })
      controlsRef.current = controls
    } catch {
      setScanning(false)
      setScannerError('No se pudo acceder a la cámara. Revisa los permisos o ingresa el código manualmente.')
    }
  }

  const stopScanning = () => {
    controlsRef.current?.stop()
    controlsRef.current = null
    setScanning(false)
  }

  useEffect(() => () => controlsRef.current?.stop(), [])

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Control de embarque</h1>
        <p className="mt-2 text-gray-600">Escanea el QR de un boleto pagado o ingresa su código para validar el abordaje.</p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800">Escanear con cámara</h2>
          <video
            ref={videoRef}
            className={`aspect-video w-full rounded-md bg-gray-900 object-cover ${scanning ? '' : 'hidden'}`}
            autoPlay
            muted
            playsInline
            aria-label="Vista de la cámara para escanear el boleto"
          />
          {!scanning && (
            <div className="flex aspect-video items-center justify-center rounded-md bg-gray-100 text-sm text-gray-500">
              La cámara se activará al iniciar el escaneo.
            </div>
          )}
          {scannerError && <p role="alert" className="text-sm text-red-700">{scannerError}</p>}
          <button
            type="button"
            onClick={scanning ? stopScanning : startScanning}
            className="w-full rounded-md bg-[#174A72] px-4 py-3 font-semibold text-white hover:bg-[#10243A] disabled:opacity-60"
            disabled={validating}
          >
            {scanning ? 'Detener cámara' : 'Iniciar escaneo'}
          </button>
        </section>

        <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800">Ingresar código manualmente</h2>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              void validateTicket(qrCode)
            }}
          >
            <label htmlFor="ticket-qr" className="block text-sm font-medium text-gray-700">
              Código QR del boleto
            </label>
            <input
              id="ticket-qr"
              value={qrCode}
              onChange={(event) => setQrCode(event.target.value)}
              className="w-full rounded-md border border-gray-300 p-3 font-mono"
              placeholder="Pega o escribe el código"
              autoComplete="off"
              disabled={validating}
            />
            <button
              type="submit"
              className="w-full rounded-md bg-green-700 px-4 py-3 font-semibold text-white hover:bg-green-800 disabled:opacity-60"
              disabled={validating}
            >
              {validating ? 'Validando...' : 'Validar boleto'}
            </button>
          </form>
        </section>
      </div>

      <div aria-live="polite">
        {error && <p role="alert" className="rounded-md bg-red-50 p-4 text-red-800">{error}</p>}
        {validatedTicket && (
          <section className="rounded-lg border border-green-300 bg-green-50 p-5 text-green-900">
            <h2 className="font-bold">Boleto validado correctamente</h2>
            <dl className="mt-3 grid gap-2 sm:grid-cols-2">
              <div><dt className="font-semibold">Pasajero</dt><dd>{validatedTicket.passenger}</dd></div>
              <div><dt className="font-semibold">Viaje</dt><dd>{validatedTicket.trip_code}</dd></div>
              <div><dt className="font-semibold">Asiento</dt><dd>{validatedTicket.seat_number}</dd></div>
              <div><dt className="font-semibold">Estado</dt><dd>Abordado</dd></div>
            </dl>
          </section>
        )}
      </div>
    </div>
  )
}
