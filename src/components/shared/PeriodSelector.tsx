import { ChevronLeft, ChevronRight, RotateCcw, Clock } from 'lucide-react'
import { usePeriodStore, MONTHS_PT, PeriodMode } from '../../store/usePeriodStore'

interface PeriodSelectorProps {
  className?: string
}

const MODES: { value: PeriodMode; label: string }[] = [
  { value: 'month', label: 'Mês'    },
  { value: 'year',  label: 'Ano'    },
  { value: 'all',   label: 'Geral'  },
]

export function PeriodSelector({ className = '' }: PeriodSelectorProps) {
  const { mode, year, month, setMode, prev, next, reset, isCurrentPeriod, getLabel } = usePeriodStore()
  const isCurrent = isCurrentPeriod()

  const nowYear  = new Date().getFullYear()
  const nowMonth = new Date().getMonth()

  // Seta direita desabilitada quando já estamos no limite atual
  const atLimit = mode === 'all'
    || (mode === 'year'  && year  >= nowYear)
    || (mode === 'month' && year === nowYear && month >= nowMonth)

  // Badge retroativo só faz sentido nos modos mês/ano
  const showRetro = !isCurrent && mode !== 'all'

  // Texto do botão de reset
  const resetLabel = mode === 'year' ? 'Ano atual' : 'Mês atual'

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>

      {/* Tabs de modo */}
      <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-0.5">
        {MODES.map(m => (
          <button
            key={m.value}
            onClick={() => setMode(m.value)}
            className={`px-3 py-1.5 rounded-[10px] text-xs font-medium transition-all cursor-pointer
              ${mode === m.value
                ? 'bg-indigo-500/25 text-indigo-300 border border-indigo-500/40'
                : 'text-slate-500 hover:text-slate-300'
              }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Navegação (oculta no modo Geral) */}
      {mode !== 'all' && (
        <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl px-1 py-1">
          <button
            onClick={prev}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10
              text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
            title={mode === 'year' ? 'Ano anterior' : 'Mês anterior'}
          >
            <ChevronLeft size={14} />
          </button>

          <span className="text-sm font-semibold text-slate-200 min-w-[110px] text-center select-none px-1">
            {mode === 'month' ? `${MONTHS_PT[month].slice(0, 3)} ${year}` : year}
          </span>

          <button
            onClick={next}
            disabled={atLimit}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10
              text-slate-400 hover:text-slate-200 transition-all cursor-pointer
              disabled:opacity-30 disabled:cursor-not-allowed"
            title={mode === 'year' ? 'Próximo ano' : 'Próximo mês'}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* Modo Geral — label estático */}
      {mode === 'all' && (
        <span className="text-sm font-semibold text-slate-400 px-1">
          Todos os períodos
        </span>
      )}

      {/* Badge retroativo */}
      {showRetro && (
        <span className="flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-lg
          bg-amber-500/15 border border-amber-500/30 text-amber-400 uppercase tracking-wider">
          <Clock size={10} />
          Retroativo
        </span>
      )}

      {/* Botão voltar ao período atual */}
      {!isCurrent && mode !== 'all' && (
        <button
          onClick={reset}
          className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300
            bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/25
            rounded-xl px-3 py-1.5 transition-all cursor-pointer"
        >
          <RotateCcw size={11} />
          {resetLabel}
        </button>
      )}
    </div>
  )
}
