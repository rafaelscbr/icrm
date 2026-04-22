import { ReactNode } from 'react'
import { Button } from '../ui/Button'
import { Plus } from 'lucide-react'

interface PageLayoutProps {
  title: string
  subtitle?: string
  ctaLabel?: string
  onCta?: () => void
  children: ReactNode
}

export function PageLayout({ title, subtitle, ctaLabel, onCta, children }: PageLayoutProps) {
  return (
    <div className="flex-1 min-h-screen bg-[#0F1117]">
      <div className="max-w-7xl mx-auto px-8 py-8">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">{title}</h1>
            {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
          </div>
          {ctaLabel && onCta && (
            <Button onClick={onCta} size="md">
              <Plus size={15} strokeWidth={2.5} />
              {ctaLabel}
            </Button>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}
