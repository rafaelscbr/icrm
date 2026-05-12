import { ReactNode } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  icon: ReactNode
  accent?: 'brand' | 'indigo' | 'green' | 'blue' | 'purple' | 'yellow' | 'red'
  trend?: number      // positivo = alta, negativo = queda, 0 ou undefined = neutro
  trendLabel?: string
  onClick?: () => void
}

const accentConfig = {
  brand:  { bar: 'bg-brand',       icon: 'text-brand',       iconBg: 'bg-brand-tint',      value: 'text-brand-text'  },
  indigo: { bar: 'bg-brand',       icon: 'text-brand',       iconBg: 'bg-brand-tint',      value: 'text-brand-text'  },
  green:  { bar: 'bg-success',     icon: 'text-success',     iconBg: 'bg-success-bg',      value: 'text-success'     },
  blue:   { bar: 'bg-info',        icon: 'text-info',        iconBg: 'bg-info-bg',         value: 'text-info'        },
  purple: { bar: 'bg-purple-500',  icon: 'text-purple-400',  iconBg: 'bg-purple-500/12',   value: 'text-purple-400'  },
  yellow: { bar: 'bg-warning',     icon: 'text-warning',     iconBg: 'bg-warning-bg',      value: 'text-warning'     },
  red:    { bar: 'bg-error',       icon: 'text-error',       iconBg: 'bg-error-bg',        value: 'text-error'       },
}

export function StatCard({ label, value, sub, icon, accent = 'brand', trend, trendLabel, onClick }: StatCardProps) {
  const cfg = accentConfig[accent]

  const hasTrend = trend !== undefined
  const isUp   = hasTrend && trend > 0
  const isDown = hasTrend && trend < 0
  const TrendIcon = isUp ? TrendingUp : isDown ? TrendingDown : Minus

  const trendColor = isUp
    ? 'text-success bg-success-bg'
    : isDown
    ? 'text-error bg-error-bg'
    : 'text-t3 bg-s2'

  return (
    <div
      className={`
        relative bg-surface border border-line rounded-xl overflow-hidden
        transition-all duration-200
        ${onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:border-line-strong hover:shadow-modal' : ''}
      `}
      style={{ boxShadow: 'var(--shadow-card)' }}
      onClick={onClick}
    >
      {/* Accent bar top */}
      <div className={`absolute top-0 left-0 right-0 h-[3px] ${cfg.bar}`} />

      <div className="p-5 pt-6">
        {/* Header row */}
        <div className="flex items-start justify-between mb-4">
          <p className="text-[11px] font-semibold text-t3 uppercase tracking-widest leading-tight pr-2">
            {label}
          </p>
          <div className={`w-9 h-9 ${cfg.iconBg} rounded-lg flex items-center justify-center ${cfg.icon} flex-shrink-0`}>
            {icon}
          </div>
        </div>

        {/* Value */}
        <p className={`text-3xl font-bold text-t1 tabular-nums leading-none mb-1`}>
          {value}
        </p>

        {/* Footer row */}
        <div className="flex items-center justify-between mt-2 gap-2">
          {sub && <p className="text-xs text-t3 leading-tight flex-1">{sub}</p>}

          {hasTrend && (
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${trendColor}`}>
              <TrendIcon size={11} strokeWidth={2.5} />
              <span>{Math.abs(trend!)}%</span>
              {trendLabel && <span className="font-normal opacity-75">{trendLabel}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
