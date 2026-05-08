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
    <div className="flex-1 min-h-screen page-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        <div className="flex items-start justify-between mb-6 lg:mb-8">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight leading-none">{title}</h1>
            {subtitle && <p className="text-sm text-slate-500 mt-1.5 font-medium">{subtitle}</p>}
          </div>
          {ctaLabel && onCta && (
            <Button onClick={onCta} size="sm" className="px-4 h-9 text-sm font-semibold">
              <Plus size={14} strokeWidth={2.5} />
              <span className="hidden sm:inline">{ctaLabel}</span>
              <span className="sm:hidden">Novo</span>
            </Button>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}
