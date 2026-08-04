import { STAGE_THEME, FUNNEL_STAGES } from '../../../lib/stageTheme'

/**
 * Funil ativo em uma faixa só.
 *
 * As contagens sobem e descem em tempo real pelos eventos de stage_change. Um
 * lead movido sem gerar interação (caso raro) causaria desvio de 1 — corrigido
 * sozinho no próximo snapshot (virada do dia ou reconexão).
 */
export function FunnelStrip({ funil }: { funil: Record<string, number> }) {
  const total = FUNNEL_STAGES.reduce((acc, s) => acc + (funil[s] ?? 0), 0)

  return (
    <div className="shrink-0 rounded-[14px] border border-line surface-premium shadow-card px-4 py-2.5 flex items-center gap-3">
      <span className="font-label text-[10px] uppercase tracking-[0.14em] text-t4 shrink-0">
        Funil ativo
      </span>

      <div className="flex-1 flex items-center gap-2 min-w-0">
        {FUNNEL_STAGES.map(stage => {
          const theme = STAGE_THEME[stage]
          const qtd = funil[stage] ?? 0
          return (
            <div
              key={stage}
              className={`flex-1 flex items-center justify-center gap-2 rounded-full border px-3 py-1.5 min-w-0 ${theme.bg} ${theme.border}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${theme.dot}`} aria-hidden />
              <span className="font-label text-[10px] uppercase tracking-[0.1em] text-t3 truncate">
                {theme.label}
              </span>
              <span className={`font-heading font-bold tabular-nums text-base leading-none ${theme.color}`}>
                {qtd}
              </span>
            </div>
          )
        })}
      </div>

      <div className="shrink-0 flex items-baseline gap-1.5 pl-1">
        <span className="font-heading font-extrabold tabular-nums text-xl text-t1 leading-none">{total}</span>
        <span className="font-label text-[10px] uppercase tracking-[0.14em] text-t4">no funil</span>
      </div>
    </div>
  )
}
