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

/*
 * O accent colore apenas o chip do ícone — a barra de 3px no topo saiu.
 * Com quatro StatCards lado a lado, quatro barras coloridas competiam entre si
 * e com o número, que é o que interessa. `indigo` e `purple` viraram apelidos
 * de `brand` para não quebrar as chamadas existentes.
 */
const accentConfig = {
  brand:  { icon: 'text-brand',   iconBg: 'bg-brand-tint' },
  indigo: { icon: 'text-brand',   iconBg: 'bg-brand-tint' },
  purple: { icon: 'text-brand',   iconBg: 'bg-brand-tint' },
  green:  { icon: 'text-success', iconBg: 'bg-success-bg' },
  blue:   { icon: 'text-info',    iconBg: 'bg-info-bg'    },
  yellow: { icon: 'text-warning', iconBg: 'bg-warning-bg' },
  red:    { icon: 'text-error',   iconBg: 'bg-error-bg'   },
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
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- cartão decorativo: a ação de verdade é o botão interno
    <div
      className={`
        relative bg-surface border border-line rounded-[14px] overflow-hidden
        transition-all duration-200
        ${onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:border-line-strong hover:shadow-dropdown' : ''}
      `}
      style={{ boxShadow: 'var(--shadow-card)' }}
      onClick={onClick}
    >
      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between mb-4">
          <p className="font-label text-[11px] font-bold text-t3 uppercase tracking-[0.1em] leading-tight pr-2">
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
