import { ReactNode } from 'react'

interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  icon: ReactNode
  accent?: 'indigo' | 'green' | 'blue' | 'purple' | 'yellow'
}

const accentConfig = {
  indigo: {
    border:     'card-accent-indigo',
    iconBg:     'bg-indigo-500/20',
    iconText:   'text-indigo-400',
    iconGlow:   'shadow-md shadow-indigo-500/20',
    glow:       'hover:glow-indigo',
    valueColor: 'text-slate-100',
  },
  green: {
    border:     'card-accent-green',
    iconBg:     'bg-green-500/20',
    iconText:   'text-green-400',
    iconGlow:   'shadow-md shadow-green-500/20',
    glow:       'hover:glow-green',
    valueColor: 'text-green-300',
  },
  blue: {
    border:     'card-accent-blue',
    iconBg:     'bg-blue-500/20',
    iconText:   'text-blue-400',
    iconGlow:   'shadow-md shadow-blue-500/15',
    glow:       '',
    valueColor: 'text-slate-100',
  },
  purple: {
    border:     'card-accent-purple',
    iconBg:     'bg-purple-500/20',
    iconText:   'text-purple-400',
    iconGlow:   'shadow-md shadow-purple-500/20',
    glow:       'hover:glow-purple',
    valueColor: 'text-purple-300',
  },
  yellow: {
    border:     'card-accent-yellow',
    iconBg:     'bg-yellow-500/20',
    iconText:   'text-yellow-400',
    iconGlow:   'shadow-md shadow-yellow-500/15',
    glow:       '',
    valueColor: 'text-slate-100',
  },
}

export function StatCard({ label, value, sub, icon, accent = 'indigo' }: StatCardProps) {
  const cfg = accentConfig[accent]
  return (
    <div className={`
      bg-[#1A1D27] border border-white/10 rounded-2xl p-6
      ${cfg.border}
      transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/30 hover:border-white/18
    `}>
      <div className="flex items-start justify-between mb-4">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</p>
        <div className={`w-9 h-9 ${cfg.iconBg} ${cfg.iconGlow} rounded-xl flex items-center justify-center ${cfg.iconText} flex-shrink-0`}>
          {icon}
        </div>
      </div>
      <p className={`text-3xl font-bold ${cfg.valueColor} mb-1 tabular-nums`}>{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  )
}
