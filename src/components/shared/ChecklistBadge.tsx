import { CheckCircle2, ListChecks } from 'lucide-react'
import { ChecklistItem } from '../../types'

// ─── Anel SVG de progresso circular ──────────────────────────────────────────

function ProgressRing({ pct, color }: { pct: number; color: string }) {
  const SIZE = 28
  const R    = 10
  const CIRC = 2 * Math.PI * R
  const offset = CIRC * (1 - pct)

  return (
    <div className="relative flex-shrink-0" style={{ width: SIZE, height: SIZE }}>
      <svg
        width={SIZE} height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="absolute inset-0 -rotate-90"
      >
        {/* Trilha de fundo */}
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={R}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={3}
        />
        {/* Progresso */}
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={R}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.4s ease, stroke 0.3s ease' }}
        />
      </svg>
      {/* Ícone central */}
      <div className="absolute inset-0 flex items-center justify-center">
        {pct === 1
          ? <CheckCircle2 size={11} className="text-green-400" />
          : <ListChecks   size={11} className="text-slate-500"  />
        }
      </div>
    </div>
  )
}

// ─── Badge público ────────────────────────────────────────────────────────────

interface ChecklistBadgeProps {
  checklist: ChecklistItem[]
  size?: 'sm' | 'md'
}

export function ChecklistBadge({ checklist, size = 'md' }: ChecklistBadgeProps) {
  const total  = checklist.length
  const done   = checklist.filter(i => i.done).length
  const pct    = total > 0 ? done / total : 0
  const allDone = pct === 1

  // Cor dinâmica conforme progresso
  const ringHex = allDone       ? '#22c55e'   // verde
                : pct >= 0.66   ? '#a855f7'   // violeta
                : pct >= 0.33   ? '#6366f1'   // índigo
                :                 '#64748b'   // slate

  const textCls = allDone       ? 'text-green-400'
                : pct >= 0.66   ? 'text-violet-400'
                : pct >= 0.33   ? 'text-indigo-400'
                :                 'text-slate-500'

  const bgCls   = allDone       ? 'bg-green-500/10  border-green-500/25'
                : pct >= 0.66   ? 'bg-violet-500/10 border-violet-500/25'
                : pct >= 0.33   ? 'bg-indigo-500/10 border-indigo-500/20'
                :                 'bg-white/4       border-white/10'

  return (
    <div className={`inline-flex items-center gap-1.5 rounded-xl border ${bgCls}
      ${size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-1'}`}>
      <ProgressRing pct={pct} color={ringHex} />
      <div className="flex flex-col leading-none">
        <span className={`font-bold tabular-nums ${textCls} ${size === 'sm' ? 'text-[10px]' : 'text-xs'}`}>
          {done}/{total}
        </span>
        <span className="text-[9px] text-slate-600 mt-0.5">
          {allDone ? 'completo ✓' : 'checklist'}
        </span>
      </div>
    </div>
  )
}
