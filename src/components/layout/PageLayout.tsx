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
      {/* Page header */}
      <div className="sticky top-0 z-10 nav-bg-blur border-b border-white/6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl lg:text-2xl font-bold text-white tracking-tight leading-none truncate">{title}</h1>
            {subtitle && <p className="text-xs text-slate-500 mt-1 font-medium truncate">{subtitle}</p>}
          </div>
          {ctaLabel && onCta && (
            <Button onClick={onCta} size="sm" className="px-4 h-9 text-sm font-semibold flex-shrink-0">
              <Plus size={14} strokeWidth={2.5} />
              <span className="hidden sm:inline">{ctaLabel}</span>
              <span className="sm:hidden">Novo</span>
            </Button>
          )}
        </div>
      </div>
      {/* Page content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        {children}
      </div>
    </div>
  )
}
