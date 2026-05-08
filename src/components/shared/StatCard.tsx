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
    bar:        'bg-indigo-500',
    iconBg:     'bg-indigo-500/15',
    iconText:   'text-indigo-400',
    valueColor: 'text-white',
    border:     'border-indigo-500/20',
  },
  green: {
    bar:        'bg-emerald-500',
    iconBg:     'bg-emerald-500/15',
    iconText:   'text-emerald-400',
    valueColor: 'text-emerald-300',
    border:     'border-emerald-500/20',
  },
  blue: {
    bar:        'bg-blue-500',
    iconBg:     'bg-blue-500/15',
    iconText:   'text-blue-400',
    valueColor: 'text-white',
    border:     'border-blue-500/20',
  },
  purple: {
    bar:        'bg-purple-500',
    iconBg:     'bg-purple-500/15',
    iconText:   'text-purple-400',
    valueColor: 'text-purple-200',
    border:     'border-purple-500/20',
  },
  yellow: {
    bar:        'bg-amber-400',
    iconBg:     'bg-amber-500/15',
    iconText:   'text-amber-400',
    valueColor: 'text-white',
    border:     'border-amber-500/20',
  },
}

export function StatCard({ label, value, sub, icon, accent = 'indigo' }: StatCardProps) {
  const cfg = accentConfig[accent]
  return (
    <div className={`
      relative bg-[#0D1117] border border-white/8 rounded-xl overflow-hidden
      transition-all duration-200 hover:-translate-y-0.5 hover:border-white/15 hover:shadow-2xl hover:shadow-black/40
    `}>
      {/* accent bar top */}
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${cfg.bar}`} />

      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">{label}</p>
          <div className={`w-8 h-8 ${cfg.iconBg} rounded-lg flex items-center justify-center ${cfg.iconText} flex-shrink-0`}>
            {icon}
          </div>
        </div>
        <p className={`text-3xl font-black ${cfg.valueColor} tabular-nums leading-none mb-2`}>{value}</p>
        {sub && <p className="text-xs text-slate-600">{sub}</p>}
      </div>
    </div>
  )
}
