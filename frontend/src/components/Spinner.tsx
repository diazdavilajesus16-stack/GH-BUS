export function Spinner({ label = 'Cargando...' }: { label?: string }) {
  return (
    <div role="status" className="flex min-h-[50vh] items-center justify-center gap-3 text-brand">
      <span className="size-6 animate-spin rounded-full border-2 border-brand-light border-t-transparent" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  )
}
