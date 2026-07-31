import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/**
 * Primitivas visuais do Pulse.
 *
 * A tela é vista de ~70cm de distância e nunca é tocada — por isso tudo aqui é
 * maior e mais contrastado que no resto do iCRM. A identidade Souza continua
 * valendo: Space Grotesk maiúsculo nos rótulos, Lucide 1.6, radius 14, ouro
 * apenas como acento.
 */

export function Painel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-[14px] border border-line bg-surface shadow-card overflow-hidden flex flex-col ${className}`}
    >
      {children}
    </section>
  )
}

export function PainelTitulo({ icon: Icon, children, extra }: {
  icon: LucideIcon
  children: ReactNode
  extra?: ReactNode
}) {
  return (
    <header className="flex items-center gap-2 px-4 pt-3 pb-2 shrink-0">
      <span className="w-1 h-3.5 rounded-full bg-brand" aria-hidden />
      <Icon size={15} strokeWidth={1.6} className="text-t3" aria-hidden />
      <h2 className="font-label text-[11px] uppercase tracking-[0.14em] text-t3">
        {children}
      </h2>
      {extra && <div className="ml-auto">{extra}</div>}
    </header>
  )
}

/** Rótulo de dado — Space Grotesk maiúsculo, o padrão da identidade. */
export function Rotulo({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`font-label text-[11px] uppercase tracking-[0.12em] text-t4 ${className}`}>
      {children}
    </span>
  )
}
