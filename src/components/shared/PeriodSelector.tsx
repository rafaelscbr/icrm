import { ChevronLeft, ChevronRight, RotateCcw, Clock } from 'lucide-react'
import { usePeriodStore, MONTHS_PT } from '../../store/usePeriodStore'

interface PeriodSelectorProps {
  className?: string
}

export function PeriodSelector({ className = '' }: PeriodSelectorProps) {
  const { year, month, prev, next, reset, isCurrentMonth } = usePeriodStore()
  const isCurrent = isCurrentMonth()
  const nowYear   = new Date().getFullYear()
  const nowMonth  = new Date().getMonth()
  const atFuture  = year > nowYear || (year === nowYear && month >= nowMonth)

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Badge retroativo */}
      {!isCurrent && (
        <span className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-lg
          bg-amber-500/15 border border-amber-500/30 text-amber-400 uppercase tracking-wider">
          <Clock size={10} />
          Retroativo
        </span>
      )}

      {/* Navegação */}
      <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl px-1 py-1">
        <button
          onClick={prev}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10
            text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
          title="Mês anterior"
        >
          <ChevronLeft size={14} />
        </button>

        <span className="text-sm font-semibold text-slate-200 min-w-[130px] text-center select-none px-1">
          {MONTHS_PT[month]} {year}
        </span>

        <button
          onClick={next}
          disabled={atFuture}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10
            text-slate-400 hover:text-slate-200 transition-all cursor-pointer
            disabled:opacity-30 disabled:cursor-not-allowed"
          title="Próximo mês"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Botão voltar ao mês atual */}
      {!isCurrent && (
        <button
          onClick={reset}
          className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300
            bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/25
            rounded-xl px-3 py-1.5 transition-all cursor-pointer"
        >
          <RotateCcw size={11} />
          Mês atual
        </button>
      )}
    </div>
  )
}
