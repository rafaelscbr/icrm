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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 lg:py-7">
        <div className="flex items-center justify-between mb-5 lg:mb-6">
          <div>
            <h1 className="text-lg lg:text-xl font-bold text-slate-100">{title}</h1>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {ctaLabel && onCta && (
            <Button onClick={onCta} size="sm" className="px-3">
              <Plus size={13} strokeWidth={2.5} />
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
