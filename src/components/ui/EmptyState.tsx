import { ReactNode } from 'react'
import { Button } from './Button'

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
      <div className="w-14 h-14 bg-brand-tint border border-brand/20 rounded-2xl flex items-center justify-center text-brand mb-4">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-t1 mb-1">{title}</h3>
      <p className="text-sm text-t3 mb-6 max-w-xs leading-relaxed">{description}</p>
      {ctaLabel && onCta && (
        <Button onClick={onCta} size="sm">
          {ctaLabel}
        </Button>
      )}
    </div>
  )
}
