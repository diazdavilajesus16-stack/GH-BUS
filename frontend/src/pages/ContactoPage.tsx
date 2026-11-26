import { useState, type FormEvent } from 'react'

const WHATSAPP_NUMBER = '51921717013'
const PHONE_NUMBER = '+51 921 717 013'
const CONTACT_EMAIL = 'ventas@ghbus.pe'
const CONTACT_TOPICS = ['Reservas', 'Boletos', 'Rutas y horarios', 'Equipaje', 'Otro']
const INITIAL_WHATSAPP_MESSAGE = 'Hola, quisiera recibir información sobre las rutas y reservas de GH BUS.'
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(INITIAL_WHATSAPP_MESSAGE)}`

type ContactIconName = 'whatsapp' | 'phone' | 'mail' | 'user' | 'bus' | 'message' | 'safety' | 'support' | 'send'

function ContactIcon({ name, className = '' }: { name: ContactIconName; className?: string }) {
  const icon = {
    whatsapp: <path d="M12.04 2a9.9 9.9 0 0 0-8.47 15.03L2 22l5.12-1.34A9.96 9.96 0 1 0 12.04 2Zm0 18.18a8.2 8.2 0 0 1-4.18-1.14l-.3-.18-3.04.8.81-2.96-.2-.3a8.2 8.2 0 1 1 6.91 3.78Zm4.5-6.15c-.25-.13-1.48-.73-1.71-.81-.23-.08-.4-.13-.57.13-.17.25-.65.81-.8.98-.15.17-.3.19-.55.06-.25-.13-1.05-.39-2-.1-.74-.65-1.23-1.45-1.38-1.7-.15-.25-.02-.39.11-.52.11-.11.25-.3.37-.44.12-.15.16-.25.25-.42.08-.17.04-.32-.02-.44-.07-.13-.57-1.37-.78-1.87-.2-.49-.41-.42-.57-.43h-.49c-.17 0-.44.06-.67.32-.23.25-.88.86-.88 2.1s.9 2.44 1.03 2.61c.13.17 1.77 2.7 4.29 3.79.6.26 1.07.42 1.43.53.6.19 1.14.16 1.57.1.48-.07 1.48-.61 1.69-1.2.21-.59.21-1.1.15-1.2-.06-.1-.23-.16-.48-.29Z" />,
    phone: <><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.72c.12.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.1L8.08 9.9a16 16 0 0 0 6 6l1.28-1.28a2 2 0 0 1 2.1-.45c.9.34 1.84.58 2.8.7A2 2 0 0 1 22 16.92Z" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></>,
    bus: <><path d="M5 11 6.5 5h11l1.5 6v8H5v-8Zm0 0h14M8 15h.01M16 15h.01M8 19v2m8-2v2" /><path d="M8 5V3h8v2" /></>,
    message: <><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" /><path d="M8 12h.01M12 12h.01M16 12h.01" /></>,
    safety: <><path d="M12 3 20 6v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3Z" /><path d="m9 12 2 2 4-4" /></>,
    support: <><path d="M3 13v-2a9 9 0 0 1 18 0v2" /><path d="M5 13h2v6H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2Zm12 0h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2v-6Zm0 6c0 2-2 3-5 3" /></>,
    send: <path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13" />,
  }[name]

  const isWhatsApp = name === 'whatsapp'
  return (
    <svg aria-hidden="true" className={className} fill={isWhatsApp ? 'currentColor' : 'none'} stroke={isWhatsApp ? 'none' : 'currentColor'} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      {icon}
    </svg>
  )
}

function ContactChannel({ icon, title, detail, href }: { icon: 'whatsapp' | 'phone' | 'mail'; title: string; detail: string; href: string }) {
  return (
    <a className={`contact-channel contact-channel--${icon}`} href={href} target={icon === 'mail' || icon === 'phone' ? undefined : '_blank'} rel={icon === 'whatsapp' ? 'noopener noreferrer' : undefined}>
      <ContactIcon name={icon} className="h-8 w-8 shrink-0" />
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
    </a>
  )
}

export function ContactoPage() {
  const [whatsappFallback, setWhatsappFallback] = useState('')

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    if (!form.reportValidity()) return

    const fields = new FormData(form)
    const message = String(fields.get('message') ?? '').trim()
    const messageInput = form.elements.namedItem('message')
    if (!message && messageInput instanceof HTMLTextAreaElement) {
      messageInput.setCustomValidity('Escribe tu mensaje antes de continuar.')
      messageInput.reportValidity()
      return
    }

    const content = [
      'Hola, quisiera comunicarme con GH BUS.',
      `Nombre: ${String(fields.get('name') ?? '').trim()}`,
      `Correo: ${String(fields.get('email') ?? '').trim()}`,
      `Teléfono: ${String(fields.get('phone') ?? '').trim()}`,
      `Asunto: ${String(fields.get('subject') ?? '').trim()}`,
      `Mensaje: ${message}`,
    ].join('\n')
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(content)}`
    setWhatsappFallback(url)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <section className="contact-page">
      <div className="contact-page__left">
        <p className="contact-page__eyebrow"><span />GH BUS · Estamos para ayudarte</p>
        <h1 className="contact-page__title">Contacto</h1>
        <p className="contact-page__lead">
          ¿Tienes dudas sobre tus <strong>viajes, reservas o boletos?</strong> Escríbenos y nuestro equipo podrá orientarte.
        </p>

        <div className="contact-channels" aria-label="Canales de contacto">
          <ContactChannel icon="whatsapp" title="Escríbenos por WhatsApp" detail={PHONE_NUMBER} href={WHATSAPP_URL} />
          <ContactChannel icon="phone" title="Llámanos" detail={PHONE_NUMBER} href={`tel:${PHONE_NUMBER.replaceAll(' ', '')}`} />
          <ContactChannel icon="mail" title="Correo" detail={CONTACT_EMAIL} href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Consulta para GH BUS')}`} />
        </div>

        <ul className="contact-promises">
          <li><ContactIcon name="safety" className="h-8 w-8" />Atención rápida y personalizada</li>
          <li><ContactIcon name="bus" className="h-8 w-8" />Viaja seguro con GH BUS</li>
          <li><ContactIcon name="support" className="h-8 w-8" />Estamos siempre para ti</li>
        </ul>

        <p className="contact-page__motto">Tu viaje, nuestra prioridad</p>
      </div>

      <div className="contact-form-card">
        <div className="contact-form-card__heading">
          <ContactIcon name="send" className="h-12 w-12 shrink-0" />
          <div>
            <h2>Envíanos un mensaje</h2>
            <p>Completa el formulario y te responderemos pronto.</p>
          </div>
        </div>

        <form className="contact-form" onSubmit={handleSubmit}>
          <label className="contact-form__field">
            <span className="sr-only">Nombre completo</span>
            <ContactIcon name="user" className="h-5 w-5 shrink-0" />
            <input name="name" type="text" autoComplete="name" placeholder="Nombre completo *" minLength={2} maxLength={120} required />
          </label>

          <label className="contact-form__field">
            <span className="sr-only">Correo electrónico</span>
            <ContactIcon name="mail" className="h-5 w-5 shrink-0" />
            <input name="email" type="email" autoComplete="email" placeholder="Correo electrónico *" maxLength={254} required />
          </label>

          <label className="contact-form__field">
            <span className="sr-only">Número de teléfono</span>
            <ContactIcon name="phone" className="h-5 w-5 shrink-0" />
            <input name="phone" type="tel" autoComplete="tel" placeholder="Número de teléfono *" pattern={'\\+?[0-9 ]{6,20}'} title="Ingresa el número con código de país, usando solo dígitos y espacios." required />
          </label>

          <label className="contact-form__field">
            <span className="sr-only">Asunto</span>
            <ContactIcon name="bus" className="h-5 w-5 shrink-0" />
            <select name="subject" defaultValue="" required>
              <option value="" disabled>Selecciona un asunto *</option>
              {CONTACT_TOPICS.map((topic) => <option key={topic} value={topic}>{topic}</option>)}
            </select>
          </label>

          <label className="contact-form__field contact-form__field--message">
            <span className="sr-only">Tu mensaje</span>
            <ContactIcon name="message" className="h-5 w-5 shrink-0" />
            <textarea name="message" placeholder="Tu mensaje *" minLength={10} maxLength={1500} required onInput={(event) => event.currentTarget.setCustomValidity('')} />
          </label>

          <button type="submit" className="contact-form__submit">
            <ContactIcon name="send" className="h-5 w-5" />
            Enviar mensaje
          </button>

          {whatsappFallback && (
            <p className="contact-form__fallback" role="status">
              WhatsApp debería haberse abierto. Si no fue así, <a href={whatsappFallback} target="_blank" rel="noopener noreferrer">ábrelo aquí</a>.
            </p>
          )}
        </form>
      </div>
    </section>
  )
}
