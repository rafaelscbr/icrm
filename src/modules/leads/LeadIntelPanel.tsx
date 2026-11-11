import { useEffect } from 'react'
import { ArrowRight } from 'lucide-react'
import { useIntelligenceStore } from '../../store/useIntelligenceStore'
import { Destaque } from '../../components/shared/Destaque'
import {
  FIT_COLOR, FIT_LABEL, FIT_TEXT, TEMPERATURE_COLOR, TEMPERATURE_LABEL, priority,
} from '../../lib/intelligence'
import { computeNextPlay } from './nextPlay'
import { Lead } from '../../types'

/**
 * Inteligência do lead — dividida em duas leituras (11/11/2026).
 *
 * `LeituraDoLead` vai no Resumo: temperatura, prioridade e o porquê, numa
 * linha e três motivos — o corretor vê com quem está falando sem trocar de
 * aba. `ProdutosDoLead` é a aba Produtos: encaixe com o produto de origem,
 * os outros produtos e a jogada.
 *
 * Nunca uma nota solta: se o corretor discordar da classificação, ele vê em
 * cima de que ela foi feita — é assim que a régua vai sendo corrigida.
 */

function useIntel(leadId: string) {
  const intel = useIntelligenceStore(s => s.intel[leadId])
  const load  = useIntelligenceStore(s => s.load)
  useEffect(() => { load() }, [load])
  return intel
}

/* ── Resumo: a leitura ─────────────────────────────────────────────────── */

export function LeituraDoLead({ lead, onVerProdutos }: { lead: Lead; onVerProdutos?: () => void }) {
  const intel = useIntel(lead.id)
  if (!intel) return null

  const p = priority(intel.temperature, intel.fitOrigin?.fit)
  const cor = TEMPERATURE_COLOR[intel.temperature]
  const motivos = intel.tempReasons.slice(0, 3)

  return (
    <section>
      <h3 className="text-[15px] font-semibold text-t1 mb-2.5">Leitura do <Destaque>lead</Destaque></h3>

      <div className="leitura">
        <div className="flex items-center gap-x-4 gap-y-2 flex-wrap">
          <span className="inline-flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: cor }} aria-hidden />
            <span className="text-[16px] font-semibold text-t1">{TEMPERATURE_LABEL[intel.temperature]}</span>
            <span className="text-[13px] text-t4 tabular-nums">{intel.tempScore} pts</span>
          </span>
          {p && (
            <span className="text-[13px] text-t3" title="Prioridade de atendimento: 1 é a mais alta">
              Prioridade <span className="font-semibold text-t1 tabular-nums">{p}</span>
            </span>
          )}
          {intel.fitOrigin && (
            <button type="button" onClick={onVerProdutos}
              className="ml-auto inline-flex items-center gap-1.5 text-[13px] text-t3 hover:text-t1 group">
              <span className="w-2 h-2 rounded-full" style={{ background: FIT_COLOR[intel.fitOrigin.fit] }} aria-hidden />
              <span className="truncate max-w-[170px]">{intel.fitOrigin.name}</span>
              <span className={`font-semibold ${FIT_TEXT[intel.fitOrigin.fit]}`}>{FIT_LABEL[intel.fitOrigin.fit]}</span>
              <ArrowRight size={13} strokeWidth={2} className="opacity-60 group-hover:translate-x-0.5 transition-transform" aria-hidden />
            </button>
          )}
        </div>

        {motivos.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5">
            {motivos.map((r, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[13.5px] text-t2 leading-snug">
                <span className={`w-3 flex-shrink-0 text-center font-bold ${r.sign === '+' ? 'text-success' : 'text-t4'}`} aria-hidden>
                  {r.sign === '+' ? '+' : r.sign === '-' ? '–' : '·'}
                </span>
                {r.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

/* ── Aba Produtos ───────────────────────────────────────────────────────── */

export function ProdutosDoLead({ lead }: { lead: Lead }) {
  const intel = useIntel(lead.id)
  if (!intel) {
    return <p className="text-[13.5px] text-t4">Calculando o encaixe com os produtos…</p>
  }

  const outros = intel.fits.filter(f => !f.isOrigin)
  const play = computeNextPlay(lead, intel)
  const corPlay = play?.tone === 'urgent' ? 'var(--warning)' : play?.tone === 'opportunity' ? 'var(--info)' : 'var(--brand)'

  return (
    <div className="flex flex-col gap-7">
      {/* A jogada — o "o quê", com o motivo específico */}
      {play && (
        <section className="ficha-agora" style={{ ['--tom' as string]: corPlay }} aria-label="A jogada">
          <p className="text-[12.5px] font-semibold" style={{ color: play.tone === 'neutral' ? 'var(--t3)' : corPlay }}>A jogada</p>
          <p className="text-[16px] font-semibold text-t1 leading-snug mt-1">{play.title}</p>
          <p className="text-[13.5px] text-t2 leading-relaxed mt-1">{play.detail}</p>
        </section>
      )}

      {intel.fitOrigin ? (
        <section>
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <h3 className="text-[15px] font-semibold text-t1">Produto de <Destaque>origem</Destaque></h3>
            <span className={`text-[13px] font-semibold ${FIT_TEXT[intel.fitOrigin.fit]}`}>{FIT_LABEL[intel.fitOrigin.fit]}</span>
          </div>
          <p className="text-[19px] font-display font-bold text-t1 tracking-[-0.015em] mb-3">{intel.fitOrigin.name}</p>
          <ul className="flex flex-col gap-2">
            {intel.fitOrigin.reasons.map((r, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[14px] text-t2 leading-snug">
                <span className="w-2 h-2 rounded-full flex-shrink-0 mt-[6px]"
                      style={{ background: r.fit === 'info' ? 'var(--line-strong)' : FIT_COLOR[r.fit] }} aria-hidden />
                {r.text}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="text-[13.5px] text-t4">Este lead não chegou por um produto cadastrado.</p>
      )}

      {/* Lead quente que não cabe no produto de origem não é lead perdido —
          é lead no produto errado. Esta lista é onde isso aparece. */}
      {outros.length > 0 && (
        <section>
          <h3 className="text-[15px] font-semibold text-t1 mb-1.5">Outros produtos</h3>
          <ul className="flex flex-col">
            {outros.map(f => (
              <li key={f.developmentId} className="flex items-center gap-3 py-2.5 border-b border-line last:border-0">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: FIT_COLOR[f.fit] }} aria-hidden />
                <span className="flex-1 min-w-0 text-[14px] text-t1 truncate">{f.name}</span>
                <span className={`text-[13px] font-semibold ${FIT_TEXT[f.fit]}`}>{FIT_LABEL[f.fit]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
