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
        bg-[#1A1D27] border border-white/7 rounded-2xl p-6
        ${accents[accent]}
        ${hover
          ? 'transition-all duration-200 hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/40 hover:border-white/12 cursor-pointer'
          : ''}
        ${className}
      `}
    >
      {children}
    </div>
  )
}
