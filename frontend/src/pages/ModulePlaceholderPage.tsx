interface ModulePlaceholderPageProps {
  title: string
  moduleLabel: string
}

export function ModulePlaceholderPage({ title, moduleLabel }: ModulePlaceholderPageProps) {
  return (
    <div className="mx-auto max-w-4xl">
      <p className="text-xs font-semibold uppercase tracking-wider text-brand-light">{moduleLabel}</p>
      <h1 className="text-2xl font-bold text-navy">{title}</h1>
      <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        Pantalla en desarrollo. Se construirá junto con el módulo correspondiente del backend.
      </div>
    </div>
  )
}
