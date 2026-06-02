import { HTMLAttributes, ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  hover?: boolean
  accent?: 'indigo' | 'green' | 'blue' | 'purple' | 'yellow' | 'brand' | 'none'
  padding?: 'sm' | 'md' | 'lg' | 'none'
}

const accents = {
  indigo: 'card-accent-indigo',
  green:  'card-accent-green',
  blue:   'card-accent-blue',
  purple: 'card-accent-purple',
  yellow: 'card-accent-yellow',
  brand:  'border-t-[3px] border-t-brand',
  none:   '',
}

const paddings = {
  none: '',
  sm:   'p-4',
  md:   'p-5 lg:p-6',
  lg:   'p-6 lg:p-8',
}

export function Card({
  children,
  hover = false,
  accent = 'none',
  padding = 'md',
  className = '',
  ...props
}: CardProps) {
  return (
    <div
      {...props}
      className={`
        relative bg-surface border border-line rounded-xl shadow-card overflow-hidden
        ${accents[accent]}
        ${paddings[padding]}
        ${hover
          ? 'transition-all duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-modal cursor-pointer'
          : ''}
        ${className}
      `}
    >
      {children}
    </div>
  )
}
