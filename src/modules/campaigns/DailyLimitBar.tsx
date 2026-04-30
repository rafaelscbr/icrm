import { ShieldAlert, AlertTriangle } from 'lucide-react'
import { getDailySends, DAILY_WARN, DAILY_LIMIT } from './dailyCounter'

interface Props {
  /** Passa o count de fora quando o componente está dentro de LeadsTab (já tem o hook rodando).
   *  Quando undefined, lê direto do localStorage (uso na CampaignsPage). */
  count?: number
}

export function DailyLimitBar({ count }: Props) {
  const dailyCount = count ?? getDailySends()
  const pct        = Math.min(100, Math.round((dailyCount / DAILY_LIMIT) * 100))
  const barColor   = dailyCount >= DAILY_LIMIT ? 'bg-red-500'
                   : dailyCount >= DAILY_WARN  ? 'bg-amber-500'
                   :                             'bg-green-500'
  const textColor  = dailyCount >= DAILY_LIMIT ? 'text-red-400'
                   : dailyCount >= DAILY_WARN  ? 'text-amber-400'
                   :                             'text-green-400'

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 rounded-xl bg-[#13151f] border border-white/8 text-xs">
      <ShieldAlert size={13} className={textColor} />

      {/* Barra de progresso */}
      <div className="flex-1 min-w-[160px]">
        <div className="flex items-center justify-between mb-1">
          <span className="text-slate-500">Disparos hoje</span>
          <span className={`font-bold tabular-nums ${textColor}`}>
            {dailyCount}/{DAILY_LIMIT}
          </span>
        </div>
        <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Avisos */}
      {dailyCount >= DAILY_LIMIT ? (
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 font-semibold">
          <AlertTriangle size={11} /> Limite atingido
        </span>
      ) : dailyCount >= DAILY_WARN ? (
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
          <AlertTriangle size={11} /> Próximo do limite
        </span>
      ) : null}
    </div>
  )
}
