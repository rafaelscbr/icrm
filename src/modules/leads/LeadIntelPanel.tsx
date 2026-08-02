import { useEffect } from 'react'
import { Gauge, Lightbulb } from 'lucide-react'
import { useIntelligenceStore } from '../../store/useIntelligenceStore'
import { TemperatureBadge, FitBadge } from '../../components/shared/IntelBadges'
import {
  FIT_COLOR, FIT_LABEL, FIT_TEXT, priority,
} from '../../lib/intelligence'
import { computeNextPlay } from './nextPlay'
import { Lead } from '../../types'

/**
 * Inteligência do lead no painel: temperatura, encaixe por produto e o porquê
 * de cada um.
 *
 * Nunca uma nota solta. Se o corretor discordar da classificação, ele consegue
 * ver exatamente em cima de que ela foi feita — e é assim que a régua vai sendo
 * corrigida com a realidade.
 */
export function LeadIntelPanel({ lead }: { lead: Lead }) {
  const leadId = lead.id
  const intel = useIntelligenceStore(s => s.intel[leadId])
  const load  = useIntelligenceStore(s => s.load)

  // O painel pode abrir por link direto, sem passar pela lista.
  useEffect(() => { load() }, [load])

  if (!intel) return null

  const p = priority(intel.temperature, intel.fitOrigin?.fit)
  const outros = intel.fits.filter(f => !f.isOrigin)
  const play = computeNextPlay(lead, intel)

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Gauge size={12} strokeWidth={1.6} className="text-t4" />
        <span className="font-label text-[11px] font-medium uppercase tracking-[0.12em] text-t3">
          Inteligência
        </span>
        {p && (
          <span className="font-label text-[10px] font-bold uppercase tracking-[0.08em] px-1.5 py-0.5 rounded-full bg-s3 text-t2">
            P{p}
          </span>
        )}
      </div>

      <div className="space-y-3">
        {/* ── Temperatura e o porquê ──────────────────────────────── */}
        <div className="rounded-[14px] bg-s2/50 border border-line p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <TemperatureBadge temp={intel.temperature} score={intel.tempScore} />
            <span className="font-label text-[11px] text-t4 tabular-nums">
              {intel.tempScore} pts
            </span>
          </div>

          <div className="space-y-1">
            {intel.tempReasons.map((r, i) => (
              <div key={i} className="flex items-start gap-2">
                <span
                  className={`font-label text-[11px] font-bold w-2 flex-shrink-0 leading-relaxed ${
                    r.sign === '+' ? 'text-success' : r.sign === '-' ? 'text-t4' : 'text-t4'
                  }`}
                  aria-hidden
                >
                  {r.sign}
                </span>
                <span className="text-xs text-t2 leading-relaxed">{r.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Encaixe com o produto de origem ─────────────────────── */}
        {intel.fitOrigin && (
          <div
            className="rounded-[14px] border p-3"
            style={{ borderColor: FIT_COLOR[intel.fitOrigin.fit] + '55' }}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-sm font-medium text-t1 truncate">{intel.fitOrigin.name}</span>
              <FitBadge fit={intel.fitOrigin.fit} compact />
            </div>
            <div className="space-y-1">
              {intel.fitOrigin.reasons.map((r, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-[6px]"
                    style={{ background: r.fit === 'info' ? 'var(--t5)' : FIT_COLOR[r.fit] }}
                    aria-hidden
                  />
                  <span className="text-xs text-t2 leading-relaxed">{r.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Outros produtos ─────────────────────────────────────── */}
        {/* Lead quente que não cabe no produto de origem não é lead perdido —
            é lead no produto errado. Esta lista é onde isso aparece. */}
        {outros.length > 0 && (
          <div>
            <p className="font-label text-[11px] uppercase tracking-[0.1em] text-t4 mb-1.5">
              Outros produtos
            </p>
            <div className="rounded-[14px] bg-s2/50 border border-line px-3 py-1">
              {outros.map(f => (
                <div key={f.developmentId} className="flex items-center gap-2 py-1.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: FIT_COLOR[f.fit] }}
                    aria-hidden
                  />
                  <span className="text-xs text-t2 flex-1 truncate">{f.name}</span>
                  <span className={`font-label text-[11px] uppercase tracking-[0.08em] ${FIT_TEXT[f.fit]}`}>
                    {FIT_LABEL[f.fit]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── A jogada ────────────────────────────────────────────── */}
        {/* Responde "o quê", não "quando" — a urgência já é trabalho do
            NextStepSuggestion logo acima. E cita sempre o motivo específico:
            "faça follow-up" o corretor pula, "a trava é a entrada de R$ 20 mil"
            ele usa. */}
        {play && (
          <div
            className={`flex items-start gap-2.5 p-3 rounded-[14px] border ${
              play.tone === 'urgent'      ? 'bg-warning-bg border-warning-line'
              : play.tone === 'opportunity' ? 'bg-info-bg border-info-line'
              : 'bg-s2/50 border-line'}`}
          >
            <Lightbulb
              size={13}
              className={`flex-shrink-0 mt-0.5 ${
                play.tone === 'urgent' ? 'text-warning'
                : play.tone === 'opportunity' ? 'text-info' : 'text-t3'}`}
            />
            <div className="min-w-0">
              <p className={`text-xs font-semibold ${
                play.tone === 'urgent' ? 'text-warning'
                : play.tone === 'opportunity' ? 'text-info' : 'text-t1'}`}>
                {play.title}
              </p>
              <p className="text-xs text-t2 leading-relaxed mt-0.5">{play.detail}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
