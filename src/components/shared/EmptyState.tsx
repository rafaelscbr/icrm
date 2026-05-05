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
      <div className="relative mb-5">
        <div className="w-16 h-16 bg-gradient-to-br from-indigo-500/20 to-violet-500/10 border border-indigo-500/20 rounded-2xl flex items-center justify-center text-indigo-400 shadow-lg shadow-indigo-500/10">
          {icon}
        </div>
        <div className="absolute inset-0 rounded-2xl bg-indigo-500/5 blur-xl -z-10" />
      </div>
      <h3 className="text-base font-semibold gradient-text mb-1.5">{title}</h3>
      <p className="text-sm text-slate-500 mb-6 max-w-xs leading-relaxed">{description}</p>
      {ctaLabel && onCta && (
        <Button onClick={onCta} size="sm">
          {ctaLabel}
        </Button>
      )}
    </div>
  )
}
