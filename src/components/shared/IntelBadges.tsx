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
 * O par temperatura + encaixe para o card do funil.
 *
 * O encaixe só entra quando é Ideal (por onde começar) ou Difícil (a conversa
 * tem trava). Possível e Sem dados são a maioria dos leads e não mudam a
 * decisão — pintá-los deixaria todo card com selo e nenhum com destaque.
 */
export function IntelPair({
  temp, fit, produto,
}: { temp?: Temperature; fit?: Fit; produto?: string }) {
  if (!temp) return null
  return (
    <span className="inline-flex items-center gap-1.5">
      {/*
        Ponto + palavra, não ponto sozinho. Cor sem legenda obriga a decorar o
        código ("azul era o quê mesmo?") e quem usa o funil de vez em quando
        nunca decora. Com o texto, a primeira leitura já entende — e a cor
        continua fazendo o trabalho de varrer a coluna.
      */}
      <span
        className={`inline-flex items-center gap-1 font-label text-[10px] font-semibold
                    uppercase tracking-[0.08em] ${TEMPERATURE_TEXT[temp]}`}
      >
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ background: TEMPERATURE_COLOR[temp] }}
          aria-hidden
        />
        {TEMPERATURE_LABEL[temp]}
      </span>
      {fitDeserveBadge(fit) && (
        <>
          <span className="text-t5 text-[10px]" aria-hidden>·</span>
          <span
            className={`font-label text-[10px] font-semibold uppercase tracking-[0.08em] ${FIT_TEXT[fit!]}`}
            title={produto ? `${produto}: ${FIT_LABEL[fit!]}` : FIT_LABEL[fit!]}
          >
            {FIT_LABEL[fit!]}
          </span>
        </>
      )}
    </span>
  )
}
