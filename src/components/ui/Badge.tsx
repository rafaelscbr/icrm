import { ReactNode } from 'react'

type BadgeVariant = 'green' | 'yellow' | 'red' | 'purple' | 'indigo' | 'slate' | 'blue' | 'orange' | 'brand'

interface BadgeProps {
  variant?: BadgeVariant
  children: ReactNode
  size?: 'sm' | 'md'
  dot?: boolean
}

/*
 * Só existem cinco significados: marca, sucesso, atenção, risco e informação.
 * `purple`, `indigo` e `orange` continuam no tipo para não quebrar chamadas
 * existentes, mas apontam para o tom semântico equivalente — nenhuma cor
 * decorativa é renderizada. Em código novo, use os nomes semânticos.
 */
const variants: Record<BadgeVariant, string> = {
  brand:  'bg-brand-tint text-brand-text border border-brand/25',
  green:  'bg-success-bg text-success border border-success-line',
  yellow: 'bg-warning-bg text-warning border border-warning-line',
  red:    'bg-error-bg text-error border border-error-line',
  blue:   'bg-info-bg text-info border border-info-line',
  slate:  'bg-s2 text-t3 border border-line',
  purple: 'bg-brand-tint text-brand-text border border-brand/25',   // → marca
  indigo: 'bg-brand-tint text-brand-text border border-brand/25',   // → marca
  orange: 'bg-warning-bg text-warning border border-warning-line',  // → atenção
}

const dotColors: Record<BadgeVariant, string> = {
  brand:  'bg-brand',
  green:  'bg-success',
  yellow: 'bg-warning',
  red:    'bg-error',
  blue:   'bg-info',
  slate:  'bg-t4',
  purple: 'bg-brand',
  indigo: 'bg-brand',
  orange: 'bg-warning',
}

export function Badge({ variant = 'slate', children, size = 'sm', dot = false }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 font-medium rounded-md
        ${size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'}
        ${variants[variant]}
      `}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColors[variant]}`} />}
      {children}
    </span>
  )
}
