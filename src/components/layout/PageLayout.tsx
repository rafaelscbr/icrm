import { ReactNode } from 'react'
import { Button } from '../ui/Button'
import { Plus } from 'lucide-react'

interface PageLayoutProps {
  title: string
  subtitle?: string
  ctaLabel?: string
  onCta?: () => void
  actions?: ReactNode
  children: ReactNode
}

export function PageLayout({ title, subtitle, ctaLabel, onCta, actions, children }: PageLayoutProps) {
  return (
    <div className="flex-1 min-h-screen bg-page">
      {/* ── Sticky page header ──────────────────────────────────── */}
      <div
        className="sticky top-0 z-10 nav-bg-blur pt-safe"
        style={{ borderBottom: '1px solid var(--line)' }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-t1 leading-tight truncate">{title}</h1>
            {subtitle && (
              <p className="text-xs text-t3 mt-0.5 truncate">{subtitle}</p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {actions}
            {ctaLabel && onCta && (
              <Button onClick={onCta} size="sm">
                <Plus size={14} strokeWidth={2.5} />
                <span className="hidden sm:inline">{ctaLabel}</span>
                <span className="sm:hidden">Novo</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Page content ────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        {children}
      </div>
    </div>
  )
}
