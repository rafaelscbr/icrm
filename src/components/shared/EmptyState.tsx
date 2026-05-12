import { ReactNode } from 'react'
import { Button } from '../ui/Button'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description: string
  ctaLabel?: string
  onCta?: () => void
}

export function EmptyState({ icon, title, description, ctaLabel, onCta }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="w-16 h-16 bg-brand-tint border border-brand/25 rounded-2xl flex items-center justify-center text-brand mb-5 shadow-brand/10 shadow-lg">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-t1 mb-1.5">{title}</h3>
      <p className="text-sm text-t3 mb-6 max-w-xs leading-relaxed">{description}</p>
      {ctaLabel && onCta && (
        <Button onClick={onCta} size="sm">
          {ctaLabel}
        </Button>
      )}
    </div>
  )
}
