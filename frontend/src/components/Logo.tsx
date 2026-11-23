interface LogoProps {
  className?: string
}

/** Marca de texto provisional. Se reemplaza por el logotipo oficial cuando se entregue el archivo vectorial. */
export function Logo({ className = '' }: LogoProps) {
  return (
    <span className={`inline-flex items-baseline gap-1.5 font-extrabold tracking-tight ${className}`}>
      <span className="text-gold">GH</span>
      <span>BUS</span>
    </span>
  )
}
