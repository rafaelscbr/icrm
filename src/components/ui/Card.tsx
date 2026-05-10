import { HTMLAttributes, ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  hover?: boolean
  accent?: 'indigo' | 'green' | 'blue' | 'purple' | 'yellow' | 'none'
}

const accents = {
  indigo: 'card-accent-indigo',
  green:  'card-accent-green',
  blue:   'card-accent-blue',
  purple: 'card-accent-purple',
  yellow: 'card-accent-yellow',
  none:   '',
}

export function Card({ children, hover = false, accent = 'none', className = '', ...props }: CardProps) {
  return (
    <div
      {...props}
      className={`
        card-surface border border-white/10 rounded-xl p-5 lg:p-6
        ${accents[accent]}
        ${hover
          ? 'transition-all duration-200 hover:-translate-y-0.5 hover:border-white/18 hover:shadow-2xl hover:shadow-black/50 cursor-pointer'
          : ''}
        ${className}
      `}
    >
      {children}
    </div>
  )
}
