import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'

const FEATURES = [
  {
    id: 'conexion',
    number: '01',
    title: 'Conexión',
    description: 'Cada viaje empieza con un destino. En GH BUS trabajamos para que organizar tus viajes y encontrar tu información sea claro desde el primer paso.',
    detail: 'Crea tu cuenta para gestionar tus reservas desde un solo lugar.',
    action: 'Crear mi cuenta',
    path: '/registro',
    visual: 'connection',
    visualLabel: 'Rutas que te acercan a nuevos destinos',
  },
  {
    id: 'comodidad',
    number: '02',
    title: 'Comodidad',
    description: 'Diseñamos una experiencia digital sencilla para que puedas revisar tus reservas y tener tus boletos disponibles cuando los necesites.',
    detail: 'Consulta tus viajes y boletos desde Mi cuenta.',
    action: 'Conoce el servicio',
    path: '/contacto',
    visual: 'comfort',
    visualLabel: 'Una experiencia simple para organizar tu viaje',
  },
  {
    id: 'confianza',
    number: '03',
    title: 'Confianza',
    description: 'La información de cada cliente está vinculada a su propia cuenta. Así puedes consultar tus reservas y boletos de forma personal.',
    detail: 'Tu cuenta reúne la información de tus viajes.',
    action: 'Ingresar a mi cuenta',
    path: '/login',
    visual: 'trust',
    visualLabel: 'Tus reservas protegidas en tu cuenta',
  },
] as const

type FeatureVisual = (typeof FEATURES)[number]['visual']
const FEATURE_IMAGES: Record<FeatureVisual, string> = {
  connection: '/images/about-connection.png',
  comfort: '/images/about-comfort.png',
  trust: '/images/about-trust.png',
}

const VALUES = ['Compromiso', 'Respeto', 'Seguridad', 'Innovación', 'Responsabilidad', 'Calidad']

function FeatureIcon({ name }: { name: FeatureVisual }) {
  const icon = {
    connection: (
      <>
        <path d="M17 51c18-21 35-26 49-11 13 14 25 14 38-1" strokeDasharray="4 5" />
        <path d="M61 39c0 12-15 24-15 24S31 51 31 39a15 15 0 1 1 30 0Z" />
        <circle cx="46" cy="39" r="5" />
      </>
    ),
    comfort: (
      <>
        <path d="M38 23v30c0 4 3 7 7 7h30c4 0 7 3 7 7v11" />
        <path d="M38 40h29c5 0 9 4 9 9v11H45c-4 0-7-3-7-7V40Z" />
        <path d="M45 60v14m31-13v13M34 79h49" />
      </>
    ),
    trust: (
      <>
        <path d="m60 18 31 12v21c0 22-13 37-31 47-18-10-31-25-31-47V30l31-12Z" />
        <path d="m45 58 10 10 21-23" />
      </>
    ),
  }[name]

  return (
    <svg aria-hidden="true" className="h-20 w-20" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" viewBox="0 0 120 120">
      {icon}
    </svg>
  )
}

export function NosotrosPage() {
  const pageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sections = pageRef.current?.querySelectorAll<HTMLElement>('[data-about-reveal]')
    if (!sections?.length) return

    if (typeof IntersectionObserver === 'undefined') {
      sections.forEach((section) => section.classList.add('is-visible'))
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          entry.target.classList.toggle('is-visible', entry.isIntersecting)
        })
      },
      { threshold: 0.18, rootMargin: '0px 0px -36px 0px' },
    )

    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={pageRef} className="about-page">
      <section className="about-hero">
        <img src="/images/about-team.png" alt="" aria-hidden="true" className="about-hero__image" />
        <div className="about-hero__shade" />
        <div className="about-hero__content">
          <p className="about-hero__eyebrow">
            <span />
            GH BUS · Transporte interprovincial
            <span />
          </p>
          <h1 className="about-hero__title">
            Sobre <em>nosotros</em>
          </h1>
          <p className="about-hero__lead">
            En GH BUS conectamos tus rutas con comodidad, seguridad y confianza. Queremos que organizar
            tu viaje y tener tus boletos a mano sea simple desde el primer momento.
          </p>
          <p className="about-hero__support">
            Te acompañamos con herramientas para consultar tus reservas y mantener la información de
            tus viajes en un solo lugar.
          </p>
          <a className="about-hero__cta" href="#historia">
            Conoce más <span aria-hidden="true">→</span>
          </a>
        </div>
        <a className="about-hero__scroll" href="#historia" aria-label="Desplazarse a nuestras secciones">
          <span />
        </a>
      </section>

      <section id="historia" className="about-history" data-about-reveal>
        <img
          src="/images/about-history.png"
          alt="Antigua terminal y buses de GH BUS en la ruta Chiclayo-Tarapoto"
          className="about-history__image"
          loading="lazy"
          decoding="async"
        />
        <div className="about-history__shade" />
        <div className="about-history__copy">
          <p className="about-history__eyebrow">Nuestra historia · Desde 2005</p>
          <h2>Un camino que seguimos recorriendo</h2>
          <p>
            Fundada el 10 de junio de 2005 en Lima, GHBUS inició operaciones el 1 de septiembre de 2006,
            ofreciendo su primer servicio en Tarapoto con solo dos unidades en la ruta Chiclayo-Tarapoto.
          </p>
          <p>
            Desde entonces, la empresa ha crecido significativamente, modernizando su flota y ampliando
            sus servicios de transporte regional e interprovincial de personas y carga.
          </p>
          <p>
            Agradecidos por el respaldo de nuestros pasajeros, trabajamos arduamente para cumplir nuestros
            sueños y ofrecer un servicio de calidad.
          </p>
        </div>
      </section>

      <div className="about-story">
        {FEATURES.map((feature, index) => (
          <section
            id={feature.id}
            key={feature.id}
            className={`about-feature${index % 2 === 1 ? ' about-feature--reverse' : ''}`}
            data-about-reveal
          >
            <div className="about-feature__copy">
              <span className="about-feature__number">{feature.number}</span>
              <h2>{feature.title}</h2>
              <p>{feature.description}</p>
              <p className="about-feature__detail">{feature.detail}</p>
              <Link to={feature.path} className="about-feature__link">
                {feature.action} <span aria-hidden="true">→</span>
              </Link>
            </div>

            <div className={`about-feature__visual about-feature__visual--${feature.visual}`} role="img" aria-label={feature.visualLabel}>
              <img src={FEATURE_IMAGES[feature.visual]} alt="" aria-hidden="true" className="about-feature__photo" />
              <div className="about-feature__icon">
                <FeatureIcon name={feature.visual} />
              </div>
            </div>
          </section>
        ))}
      </div>

      <section className="about-purpose" aria-label="Misión y visión">
        <article id="mision" className="about-purpose__card about-purpose__card--mission" data-about-reveal>
          <span className="about-purpose__label">Nuestro propósito</span>
          <h2>Misión</h2>
          <p>
            Ser la mejor empresa de transporte que proporcione a los pasajeros un servicio de calidad,
            rápido, seguro, cómodo y confiable. Nos comprometemos a satisfacer las necesidades de nuestros
            clientes con amabilidad y respeto, cumpliendo con los más altos estándares de servicio y
            fomentando una mentalidad de mejora continua en nuestros empleados.
          </p>
        </article>
        <article id="vision" className="about-purpose__card about-purpose__card--vision" data-about-reveal>
          <span className="about-purpose__label">Hacia dónde vamos</span>
          <h2>Visión</h2>
          <p>
            Convertirnos en la empresa de servicio público de transporte interprovincial más eficiente y
            reconocida a nivel nacional. Implementaremos nuevas estrategias, tecnologías y procesos de
            mejora continua para satisfacer las demandas de nuestros clientes y consolidar nuestra
            posición en el mercado peruano.
          </p>
        </article>
      </section>

      <section id="valores" className="about-values" data-about-reveal>
        <header className="about-values__heading">
          <p className="about-values__eyebrow">Lo que nos guía</p>
          <h2>Nuestros valores</h2>
        </header>
        <ul className="about-values__list">
          {VALUES.map((value, index) => (
            <li className="about-values__item" key={value}>
              <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <h3>{value}</h3>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
