import { ShieldAlert, AlertTriangle } from 'lucide-react'
import { DAILY_WARN, DAILY_LIMIT } from './dailyCounter'
import { useDisparosStore } from '../../store/useDisparosStore'

interface Props {
  /** Count explícito quando o componente está dentro de LeadsTab (hook já ativo).
   *  Sem prop: lê do banco via useDisparosStore. */
  count?: number
}

export function DailyLimitBar({ count }: Props) {
  const dbCount    = useDisparosStore(s => s.countDay)
  const dailyCount = count ?? dbCount
  const pct        = Math.min(100, Math.round((dailyCount / DAILY_LIMIT) * 100))
  const barColor   = dailyCount >= DAILY_LIMIT ? 'bg-red-500'
                   : dailyCount >= DAILY_WARN  ? 'bg-amber-500'
                   :                             'bg-green-500'
  const textColor  = dailyCount >= DAILY_LIMIT ? 'text-red-400'
                   : dailyCount >= DAILY_WARN  ? 'text-amber-400'
                   :                             'text-green-400'

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 rounded-xl card-surface border border-line text-xs">
      <ShieldAlert size={13} className={textColor} />

      <div className="flex-1 min-w-[160px]">
        <div className="flex items-center justify-between mb-1">
          <span className="text-t3">Disparos hoje</span>
          <span className={`font-bold tabular-nums ${textColor}`}>
            {dailyCount}/{DAILY_LIMIT}
          </span>
        </div>
        <div className="h-1.5 bg-s3/70 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

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
