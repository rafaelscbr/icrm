import {
  Temperature, Fit, TEMPERATURE_LABEL, TEMPERATURE_COLOR, TEMPERATURE_TEXT,
  FIT_LABEL, FIT_COLOR, FIT_TEXT, fitDeserveBadge,
} from '../../lib/intelligence'

/**
 * Selos de inteligência — os mesmos no Kanban, na lista e no painel do lead.
 *
 * A regra de ouro é não poluir: no card, só aparece o que muda a jogada. Cor
 * nunca é o único indicador (WCAG 1.4.1) — todo selo carrega texto ou title.
 */

/* ── Temperatura ─────────────────────────────────────────────────────────── */

export function TemperatureDot({ temp, title }: { temp: Temperature; title?: string }) {
  return (
    <span
      className="inline-block w-2 h-2 rounded-full flex-shrink-0"
      style={{ background: TEMPERATURE_COLOR[temp] }}
      title={title ?? TEMPERATURE_LABEL[temp]}
      aria-label={`Temperatura: ${TEMPERATURE_LABEL[temp]}`}
      role="img"
    />
  )
}

export function TemperatureBadge({ temp, score }: { temp: Temperature; score?: number }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-label text-[11px] uppercase tracking-[0.08em]
                  px-2 py-0.5 rounded-full border ${TEMPERATURE_TEXT[temp]}`}
      style={{ borderColor: TEMPERATURE_COLOR[temp], background: 'transparent' }}
      title={score != null ? `${TEMPERATURE_LABEL[temp]} · ${score} pontos` : undefined}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: TEMPERATURE_COLOR[temp] }}
        aria-hidden
      />
      {TEMPERATURE_LABEL[temp]}
    </span>
  )
}

/* ── Encaixe com o produto ───────────────────────────────────────────────── */

export function FitBadge({
  fit, produto, compact = false,
}: { fit: Fit; produto?: string; compact?: boolean }) {
  const titulo = produto ? `${produto}: ${FIT_LABEL[fit]}` : FIT_LABEL[fit]
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-label text-[11px] uppercase tracking-[0.08em]
                  px-2 py-0.5 rounded-full border ${FIT_TEXT[fit]}`}
      style={{ borderColor: FIT_COLOR[fit], background: 'transparent' }}
      title={titulo}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: FIT_COLOR[fit] }} aria-hidden />
      {compact ? FIT_LABEL[fit] : titulo}
    </span>
  )
}

/**
 * Encaixe do lead com o produto, para o cartão do Kanban. Só aparece quando é
 * Ideal ou Difícil — o meio-termo não ajuda a decidir nada.
 *
 * Substitui o par temperatura + encaixe: a temperatura saiu do cartão em
 * 16/11/2026 (pedido do Rafael) e ficou só na lista e nos filtros.
 */
export function EncaixeDoCard({ fit, produto }: { fit?: Fit; produto?: string }) {
  if (!fitDeserveBadge(fit)) return null
  return (
    <span
      className={`font-label text-[11px] font-semibold uppercase tracking-[0.08em] flex-shrink-0 ${FIT_TEXT[fit!]}`}
      title={produto ? `${produto}: ${FIT_LABEL[fit!]}` : FIT_LABEL[fit!]}
    >
      {FIT_LABEL[fit!]}
    </span>
  )
}
