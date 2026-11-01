import { AlertTriangle } from 'lucide-react'
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
  const pct      = Math.min(100, Math.round((dailyCount / DAILY_LIMIT) * 100))
  const estourou = dailyCount >= DAILY_LIMIT
  const perto    = !estourou && dailyCount >= DAILY_WARN
  const corBarra = estourou ? 'bg-error' : perto ? 'bg-warning' : 'bg-success'
  const corNum   = estourou ? 'text-error' : perto ? 'text-warning' : 'text-t1'

  // v10 (01/11/2026): uma linha no padrão da meta de ligações — número,
  // barra fina e o aviso só quando existe.
  return (
    <div className="bento flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
      <div className="flex items-baseline gap-2 shrink-0">
        <span className="text-[12.5px] text-t4">Disparos hoje</span>
        <span className={`font-display font-extrabold tabular-nums leading-none text-[20px] tracking-[-0.02em] ${corNum}`}>
          {dailyCount}
        </span>
        <span className="text-[13px] text-t4 tabular-nums">de {DAILY_LIMIT}</span>
      </div>

      <div className="flex-1 min-w-[160px] h-[5px] rounded-full bg-s3 overflow-hidden"
           role="progressbar" aria-label={`${dailyCount} de ${DAILY_LIMIT} disparos hoje`}
           aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full transition-[width] duration-500 ${corBarra}`} style={{ width: `${pct}%` }} />
      </div>

      {(estourou || perto) && (
        <span className={`flex items-center gap-1.5 text-[12.5px] font-medium ${estourou ? 'text-error' : 'text-warning'}`}>
          <AlertTriangle size={13} strokeWidth={1.8} aria-hidden />
          {estourou ? 'Limite atingido' : 'Perto do limite'}
        </span>
      )}
    </div>
  )
}
