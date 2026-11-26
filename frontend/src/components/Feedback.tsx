import { CLASE_ESTADO_VIAJE, ETIQUETA_ESTADO_VIAJE, type EstadoViaje } from '@/services/tripsApi'

export function EstadoBadge({ estado }: { estado: EstadoViaje }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CLASE_ESTADO_VIAJE[estado]}`}>{ETIQUETA_ESTADO_VIAJE[estado]}</span>
}

/** Muestra uno o varios motivos por los que el sistema rechazó una acción. */
export function Motivos({ motivos }: { motivos: string[] }) {
  if (motivos.length === 0) return null
  return (
    <div role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
      {motivos.length === 1 ? (
        <p>{motivos[0]}</p>
      ) : (
        <ul className="list-disc space-y-1 pl-5">
          {motivos.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
