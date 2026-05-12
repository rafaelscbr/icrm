import { ReactNode } from 'react'

type BadgeVariant = 'green' | 'yellow' | 'red' | 'purple' | 'indigo' | 'slate' | 'blue' | 'orange' | 'brand'

interface BadgeProps {
  variant?: BadgeVariant
  children: ReactNode
  size?: 'sm' | 'md'
  dot?: boolean
}

const variants: Record<BadgeVariant, string> = {
  brand:  'bg-brand-tint text-brand-text border border-brand/25',
  green:  'bg-success-bg text-success border border-success-line',
  yellow: 'bg-warning-bg text-warning border border-warning-line',
  red:    'bg-error-bg text-error border border-error-line',
  purple: 'bg-purple-500/12 text-purple-400 border border-purple-500/25',
  indigo: 'bg-indigo-500/12 text-indigo-400 border border-indigo-500/25',
  blue:   'bg-info-bg text-info border border-info-line',
  orange: 'bg-orange-500/12 text-orange-400 border border-orange-500/25',
  slate:  'bg-s2 text-t3 border border-line',
}

const dotColors: Record<BadgeVariant, string> = {
  brand:  'bg-brand',
  green:  'bg-success',
  yellow: 'bg-warning',
  red:    'bg-error',
  purple: 'bg-purple-400',
  indigo: 'bg-indigo-400',
  blue:   'bg-info',
  orange: 'bg-orange-400',
  slate:  'bg-t4',
}

export function Badge({ variant = 'slate', children, size = 'sm', dot = false }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 font-medium rounded-md
        ${size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'}
        ${variants[variant]}
      `}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColors[variant]}`} />}
      {children}
    </span>
  )
}
