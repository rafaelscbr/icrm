import { ReactNode } from 'react'

type BadgeVariant = 'green' | 'yellow' | 'red' | 'purple' | 'indigo' | 'slate' | 'blue'

interface BadgeProps {
  variant?: BadgeVariant
  children: ReactNode
  size?: 'sm' | 'md'
}

const variants: Record<BadgeVariant, string> = {
  green:  'bg-green-500/15 text-green-400 border border-green-500/25 shadow-sm shadow-green-500/15',
  yellow: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/25 shadow-sm shadow-yellow-500/15',
  red:    'bg-red-500/15 text-red-400 border border-red-500/25 shadow-sm shadow-red-500/15',
  purple: 'bg-purple-500/15 text-purple-400 border border-purple-500/25 shadow-sm shadow-purple-500/15',
  indigo: 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/25 shadow-sm shadow-indigo-500/15',
  slate:  'bg-white/5 text-slate-400 border border-white/10',
  blue:   'bg-blue-500/15 text-blue-400 border border-blue-500/25 shadow-sm shadow-blue-500/15',
}

export function Badge({ variant = 'slate', children, size = 'sm' }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center font-medium rounded-lg
        ${size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'}
        ${variants[variant]}
      `}
    >
      {children}
    </span>
  )
}
