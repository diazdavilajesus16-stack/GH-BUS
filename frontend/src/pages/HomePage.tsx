import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { homePathFor } from '@/utils/roles'

export function HomePage() {
  const { user } = useAuth()
  const destino = user ? homePathFor(user) : '/registro'
  const textoAcceso = user
    ? destino === '/panel' ? 'Ir al panel' : 'Ir a mi cuenta'
    : 'Crear mi cuenta'

  return (
    <section className="home-hero relative isolate flex min-h-[calc(100dvh-64px)] items-center overflow-hidden bg-navy text-white">
      <img
        src="/images/ghbus-hero.png"
        alt=""
        aria-hidden="true"
        className="home-hero__image absolute inset-0 h-full w-full object-cover object-[64%_center]"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-[#06172b]/95 via-[#06172b]/75 to-[#06172b]/15" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#06172b]/65 via-transparent to-[#06172b]/20" />

      <div className="relative z-10 w-full px-5 py-16 sm:px-8 lg:px-16">
        <div className="home-hero__content max-w-2xl">
          <p className="home-hero__eyebrow inline-flex items-center gap-3 text-xs font-bold uppercase tracking-[0.24em] text-gold sm:text-sm">
            <span className="h-px w-8 bg-gold sm:w-12" />
            GH BUS · Transporte interprovincial
          </p>

          <h1 className="home-hero__title mt-6 font-bold font-lobster font-[lobster] text-5xl leading-[1.12] tracking-normal sm:text-7xl lg:text-8xl">
            Cada destino
            <br />
            comienza con
            <br />
            <span className="home-hero__accent">un buen viaje.</span>
          </h1>

          <p className="mt-6 max-w-xl text-base leading-7 text-white/85 sm:text-lg sm:leading-8">
            Conectamos tus rutas con comodidad, seguridad y confianza. Ingresa o crea tu cuenta para
            consultar tus reservas y tener tus boletos siempre a mano.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link to={destino} className="home-hero__cta inline-flex items-center gap-3 rounded-lg bg-gold px-5 py-3 font-bold text-navy shadow-lg shadow-black/20">
              {textoAcceso}
              <span aria-hidden="true" className="text-xl leading-none">→</span>
            </Link>
            {!user && (
              <Link to="/login" className="home-hero__cta inline-flex items-center rounded-lg border border-white/40 bg-white/10 px-5 py-3 font-semibold text-white backdrop-blur-sm hover:bg-white/15">
                Ya tengo una cuenta
              </Link>
            )}
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-white/75">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-gold" />
              Viaja con tranquilidad
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-gold" />
              Tus boletos en un solo lugar
            </span>
          </div>
        </div>
      </div>

      <div aria-hidden="true" className="pointer-events-none absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r from-gold via-gold/40 to-transparent" />
    </section>
  )
}
