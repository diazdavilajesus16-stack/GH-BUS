export function HomePage() {
  return (
    <section className="bg-gradient-to-br from-navy via-brand to-brand-light text-white">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
        <p className="text-sm font-semibold uppercase tracking-widest text-gold">Transporte interprovincial</p>
        <h1 className="mt-3 max-w-2xl text-4xl font-extrabold leading-tight sm:text-5xl">
          Viaja cómodo y seguro, <span className="text-gold">justo a tiempo</span>.
        </h1>
        <p className="mt-5 max-w-xl text-white/80">
          Muy pronto podrás buscar viajes, elegir tu asiento y comprar tu boleto desde aquí.
        </p>
        <p className="mt-8 inline-block rounded-lg bg-white/10 px-4 py-2 text-sm text-white/80">
          La venta en línea se habilita con el módulo Comercial.
        </p>
      </div>
    </section>
  )
}
