import { useMemo, useEffect } from 'react'
import {
  Flame, DollarSign, TrendingDown, Activity,
  AlertTriangle, Clock, Crown, ChevronRight,
  MessageCircle, XCircle, Zap, Thermometer, BarChart2, Timer,
  Sparkles, Smartphone, Globe, Handshake, Megaphone, CheckCircle2,
} from 'lucide-react'
import { SlaBadge, slaActive } from './SlaBadge'
import { Lead, LeadFunnelStage } from '../../types'
import { formatCurrency } from '../../lib/formatters'
import { STAGE_CONFIG } from './LeadKanban'
import { useLeadInteractionsStore } from '../../store/useLeadInteractionsStore'

// ── Config ────────────────────────────────────────────────────────────────────

const STAGES: LeadFunnelStage[] = ['lead', 'followup', 'atendimento', 'visita', 'proposta', 'venda']

const ORIGIN_LABEL: Record<string, string> = {
  felicita: 'Felicità', meta_ads: 'Meta ADS', portal: 'Portal', offline: 'Offline', campanha: 'Campanha',
}
const ORIGIN_COLOR: Record<string, string> = {
  felicita: '#f43f5e', meta_ads: '#3b82f6', portal: '#06b6d4', offline: '#f59e0b', campanha: '#a855f7',
}
const ORIGIN_ICON: Record<string, typeof Sparkles> = {
  felicita: Sparkles, meta_ads: Smartphone, portal: Globe, offline: Handshake, campanha: Megaphone,
}
const DISCARD_LABELS: Record<string, string> = {
  sem_condicao: 'Sem condição financeira',
  fora_de_nicho: 'Fora do nicho',
  parou_de_responder: 'Parou de responder',
  nunca_respondeu: 'Nunca respondeu',
  telefone_invalido: 'Telefone inválido',
}

// Peso de prioridade por etapa (não inclui venda — já fechou)
const STAGE_WEIGHT: Record<LeadFunnelStage, number> = {
  proposta: 100, visita: 80, atendimento: 55,
  followup: 25,  lead: 10,   venda: 0,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysAgo(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86_400_000
}

function priorityScore(lead: Lead): number {
  const base    = STAGE_WEIGHT[lead.funnelStage]
  const ticket  = Math.min(40, ((lead.averageTicket ?? 0) / 1_000_000) * 20)
  const stale   = Math.min(25, daysAgo(lead.updatedAt) * 1.5)
  return base + ticket - stale
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  leads: Lead[]
  onOpenLead: (lead: Lead) => void
}

export function LeadsDashboard({ leads, onOpenLead }: Props) {
  // Pipeline atual = aberto: nem descartado, nem ganho/encerrado
  const active    = useMemo(() => leads.filter(l => !l.discardReason && !l.closedAt), [leads])
  const discarded = useMemo(() => leads.filter(l => !!l.discardReason), [leads])

  const { loadAll, byLead, allLoaded } = useLeadInteractionsStore()
  useEffect(() => { loadAll() }, [])

  // Leads Meta Ads com relógio de SLA rodando (1º contato pendente)
  const slaLeads = useMemo(() => active.filter(slaActive), [active])

  // ── BLOCO 1 — North Star KPIs ───────────────────────────────────────────────
  const vgvPipeline = useMemo(() =>
    active.reduce((s, l) => s + (l.averageTicket ?? 0), 0), [active])

  const vgvQuente = useMemo(() =>
    active
      .filter(l => l.funnelStage === 'visita' || l.funnelStage === 'proposta')
      .reduce((s, l) => s + (l.averageTicket ?? 0), 0), [active])

  const vgvPerdido = useMemo(() =>
    discarded.reduce((s, l) => s + (l.averageTicket ?? 0), 0), [discarded])

  const vendas     = useMemo(() => active.filter(l => l.funnelStage === 'venda'), [active])
  const convRate   = leads.length > 0
    ? ((vendas.length / leads.length) * 100).toFixed(1)
    : '0'

  // ── BLOCO 2 — Pipeline Estratégico ─────────────────────────────────────────
  const funnelStages = useMemo(() => {
    const all = [...active, ...discarded]

    // Mapa: etapa → quantos foram descartados nela (via interaction type='discard')
    const discardedByStage: Record<string, number> = {}
    const allInteractions = Object.values(byLead).flat()
    allInteractions
      .filter(i => i.type === 'discard')
      .forEach(i => {
        // description: "Descartado em Atendimento — motivo"
        const match = i.description?.match(/Descartado em ([^—]+)/)
        if (match) {
          const stageLabel = match[1].trim()
          const stageKey = STAGES.find(s => STAGE_CONFIG[s].label === stageLabel) ?? stageLabel
          discardedByStage[stageKey] = (discardedByStage[stageKey] ?? 0) + 1
        }
      })

    return STAGES.map((stage, i) => {
      const inStage   = active.filter(l => l.funnelStage === stage)
      const count     = inStage.length
      const vgv       = inStage.reduce((s, l) => s + (l.averageTicket ?? 0), 0)
      const parados   = inStage.filter(l => daysAgo(l.updatedAt) > 2).length
      // Leads que chegaram até esta etapa ou além (funil acumulado)
      const reached   = all.filter(l => STAGES.indexOf(l.funnelStage) >= i).length
      const reachedPrev = i === 0 ? all.length : all.filter(l => STAGES.indexOf(l.funnelStage) >= i - 1).length
      const dropRate  = reachedPrev > 0 ? Math.round(((reachedPrev - reached) / reachedPrev) * 100) : 0
      const discardedHere = discardedByStage[stage] ?? 0
      return { stage, count, vgv, parados, dropRate, discardedHere, conf: STAGE_CONFIG[stage] }
    })
  }, [active, discarded, byLead])

  // ── BLOCO 3 — Priority Ranking ──────────────────────────────────────────────
  const priorityList = useMemo(() =>
    active
      .filter(l => l.funnelStage !== 'venda')
      .map(l => ({ lead: l, score: priorityScore(l) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8),
    [active])

  // ── BLOCO 3 — Canal Performance ─────────────────────────────────────────────
  const canalPerf = useMemo(() => {
    const origins = Array.from(new Set(leads.map(l => l.origin)))
    return origins.map(origin => {
      const all      = leads.filter(l => l.origin === origin)
      const act      = all.filter(l => !l.discardReason)
      const disc     = all.filter(l => !!l.discardReason)
      const conv     = act.filter(l => l.funnelStage === 'venda').length
      const withTkt  = act.filter(l => l.averageTicket)
      const avgTkt   = withTkt.length > 0 ? withTkt.reduce((s, l) => s + l.averageTicket!, 0) / withTkt.length : 0
      const vgv      = act.reduce((s, l) => s + (l.averageTicket ?? 0), 0)
      return {
        origin,
        label:    ORIGIN_LABEL[origin] ?? origin,
        icon:     ORIGIN_ICON[origin] ?? Sparkles,
        color:    ORIGIN_COLOR[origin] ?? '#64748b',
        total:    all.length,
        active:   act.length,
        discarded: disc.length,
        conv, vgv, avgTkt,
        convRate:  all.length > 0 ? (conv / all.length) * 100 : 0,
        discRate:  all.length > 0 ? (disc.length / all.length) * 100 : 0,
      }
    }).sort((a, b) => b.total - a.total)
  }, [leads])

  // ── BLOCO 4 — Follow-up Intelligence ────────────────────────────────────────
  const followupLeads = useMemo(() => active.filter(l => l.funnelStage === 'followup'), [active])
  const followupSteps = useMemo(() =>
    [0, 1, 2, 3, 4, 5].map(step => ({
      step,
      count: followupLeads.filter(l => l.followupStep === step).length,
    })), [followupLeads])
  const maxFu = Math.max(1, ...followupSteps.map(s => s.count))

  // ── BLOCO 4 — Loss Analysis ──────────────────────────────────────────────────
  const lossAnalysis = useMemo(() => {
    const map: Record<string, { count: number; vgv: number }> = {}
    discarded.forEach(l => {
      const key = l.discardReason ?? 'unknown'
      if (!map[key]) map[key] = { count: 0, vgv: 0 }
      map[key].count++
      map[key].vgv += l.averageTicket ?? 0
    })
    return Object.entries(map)
      .map(([key, d]) => ({ key, label: DISCARD_LABELS[key] ?? key, ...d }))
      .sort((a, b) => b.vgv - a.vgv)
  }, [discarded])
  const maxLossVgv = Math.max(1, ...lossAnalysis.map(l => l.vgv))

  // ── BLOCO 5 — Radar de Temperatura ──────────────────────────────────────────
  const radarData = useMemo(() => {
    // Build map: leadId → most recent interactedAt
    const lastByLead: Record<string, string> = {}
    Object.values(byLead).flat().forEach(i => {
      if (!lastByLead[i.leadId] || i.interactedAt > lastByLead[i.leadId]) {
        lastByLead[i.leadId] = i.interactedAt
      }
    })
    const stagesForRadar: LeadFunnelStage[] = ['proposta', 'visita', 'atendimento', 'followup', 'lead']
    return stagesForRadar.map(stage => {
      const inStage   = active.filter(l => l.funnelStage === stage)
      const cold      = inStage.filter(l => {
        const last = lastByLead[l.id]
        return !last || daysAgo(last) > 2
      })
      const vgvAtRisk = cold.reduce((s, l) => s + (l.averageTicket ?? 0), 0)
      const coldPct   = inStage.length > 0 ? (cold.length / inStage.length) * 100 : 0
      return { stage, label: STAGE_CONFIG[stage].label, conf: STAGE_CONFIG[stage], total: inStage.length, cold: cold.length, coldPct, vgvAtRisk }
    })
  }, [active, byLead])

  // ── BLOCO 6 — Pulso Comercial ────────────────────────────────────────────────
  const pulsoData = useMemo(() => {
    const allInteractions = Object.values(byLead).flat()
    return Array.from({ length: 14 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (13 - i))
      const dateStr = d.toISOString().split('T')[0]
      const label   = i === 13 ? 'Hoje' : i === 12 ? 'Ontem' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      const count   = allInteractions.filter(x => x.interactedAt.startsWith(dateStr)).length
      return { dateStr, label, count }
    })
  }, [byLead])
  const maxPulso = Math.max(1, ...pulsoData.map(d => d.count))

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="p-5 space-y-4 max-w-7xl mx-auto">

      {/* ── SLA Meta Ads — leads aguardando 1º contato ──────────────────────── */}
      {slaLeads.length > 0 && (
        <div className="bg-error-bg border border-error-line rounded-[14px] p-3">
          <div className="flex items-center gap-2 mb-2">
            <Timer size={13} strokeWidth={1.6} className="text-error" />
            <p className="font-label text-[11px] font-medium uppercase tracking-[0.12em] text-error">
              SLA Meta Ads — {slaLeads.length === 1 ? '1 lead aguardando' : `${slaLeads.length} leads aguardando`} 1º contato
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {slaLeads.map(l => (
              <button
                key={l.id}
                onClick={() => onOpenLead(l)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[10px] bg-s2/60 border border-error-line text-xs text-t1 hover:bg-s2 transition-all duration-150"
                title={`Abrir lead — prazo ${new Date(l.slaDueAt!).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`}
              >
                <span className="font-medium truncate max-w-[140px]">{l.name}</span>
                <SlaBadge lead={l} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── BLOCO 1 — North Star KPIs ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <NorthStar
          icon={<DollarSign size={15} />}
          label="VGV no Pipeline"
          value={vgvPipeline > 0 ? formatCurrency(vgvPipeline) : '—'}
          sub={`${active.filter(l => l.averageTicket).length} de ${active.length} leads com ticket`}
          color="text-violet-300" bg="bg-violet-500/10" border="border-violet-500/20"
        />
        <NorthStar
          icon={<Flame size={15} />}
          label="VGV Quente"
          value={vgvQuente > 0 ? formatCurrency(vgvQuente) : '—'}
          sub="visita + proposta — fechamento próximo"
          color="text-orange-300" bg="bg-orange-500/10" border="border-orange-500/20"
          highlight
        />
        <NorthStar
          icon={<TrendingDown size={15} />}
          label="VGV Perdido"
          value={vgvPerdido > 0 ? formatCurrency(vgvPerdido) : '—'}
          sub={`custo de oportunidade · ${discarded.length} descartados`}
          color="text-red-300" bg="bg-red-500/10" border="border-red-500/20"
        />
        <NorthStar
          icon={<Activity size={15} />}
          label="Conversão Lead → Venda"
          value={`${convRate}%`}
          sub={`${vendas.length} vendas · ${leads.length} leads totais`}
          color="text-green-300" bg="bg-green-500/10" border="border-green-500/20"
        />
      </div>

      {/* ── BLOCO 2 — Pipeline Estratégico ─────────────────────────────────── */}
      <div className="bg-page border border-line rounded-xl p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-t3 mb-0.5">Funil de Vendas</p>
            <p className="text-base font-bold text-t1">Pipeline Estratégico</p>
          </div>
          <span className="text-[11px] text-t4 bg-s2/50 border border-line px-2 py-1 rounded-lg inline-flex items-center gap-1"><TrendingDown size={11} /> perda · <AlertTriangle size={11} /> parado +7d</span>
        </div>
        <div className="flex items-stretch gap-1 overflow-x-auto pb-1 min-w-0">
          {funnelStages.map((item, i) => (
            <div key={item.stage} className="flex items-stretch flex-shrink-0">
              <div className={`flex flex-col w-[138px] rounded-xl border ${item.conf.border} ${item.conf.bg} p-3 gap-1`}>
                {/* Queda da etapa anterior */}
                {i > 0 ? (
                  <span className={`text-[11px] font-bold ${
                    item.dropRate > 50 ? 'text-red-400' :
                    item.dropRate > 25 ? 'text-amber-400' : 'text-green-400'
                  }`}>
                    ↓ {item.dropRate}% saiu
                  </span>
                ) : (
                  <span className="text-[11px] text-t4">{leads.length} total</span>
                )}

                <p className={`text-xs font-semibold mt-0.5 ${item.conf.headerText}`}>{item.conf.label}</p>
                <p className={`text-3xl font-bold leading-none ${item.conf.color}`}>{item.count}</p>

                {item.vgv > 0 && (
                  <p className="text-[11px] text-t3 mt-0.5">{formatCurrency(item.vgv)}</p>
                )}

                {item.parados > 0 && item.stage !== 'venda' && (
                  <div className="flex items-center gap-1 mt-1">
                    <AlertTriangle size={9} className="text-amber-400 flex-shrink-0" />
                    <span className="text-[11px] text-amber-400">{item.parados} esfriando</span>
                  </div>
                )}
                {item.discardedHere > 0 && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <XCircle size={9} className="text-rose-400 flex-shrink-0" />
                    <span className="text-[11px] text-rose-400">{item.discardedHere} saíram aqui</span>
                  </div>
                )}
              </div>

              {i < funnelStages.length - 1 && (
                <div className="flex items-center px-0.5 flex-shrink-0">
                  <ChevronRight size={13} className="text-t4" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── BLOCO 5 — Radar de Temperatura do Pipeline ─────────────────────── */}
      <div className="bg-page border border-line rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <Thermometer size={13} className="text-orange-400" />
          <p className="text-sm font-semibold text-t1">Radar de Temperatura do Pipeline</p>
          {!allLoaded && <span className="ml-2 text-[11px] text-t4 animate-pulse">carregando interações…</span>}
          <span className="ml-auto text-xs text-t4">sem interação nos últimos 3 dias</span>
        </div>
        <p className="text-xs text-t4 mb-4">
          Leads que esfriaram — VGV em risco de perda por inatividade
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[11px] text-t4 uppercase tracking-wider border-b border-line">
                <th className="text-left pb-2 pr-4">Etapa</th>
                <th className="text-center pb-2 px-4">Total</th>
                <th className="text-center pb-2 px-4">Frios +3d</th>
                <th className="text-center pb-2 px-4">% Frios</th>
                <th className="text-right pb-2 pl-4">VGV em Risco</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {radarData.map(row => {
                const tempColor = row.coldPct > 50
                  ? 'text-red-400'
                  : row.coldPct > 25
                  ? 'text-amber-400'
                  : 'text-green-400'
                const tempBg = row.coldPct > 50
                  ? 'bg-red-500/8'
                  : row.coldPct > 25
                  ? 'bg-amber-500/5'
                  : ''
                return (
                  <tr key={row.stage} className={`${tempBg} transition-colors`}>
                    <td className="py-2.5 pr-4">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-md border ${row.conf.bg} ${row.conf.color} ${row.conf.border}`}>
                        {row.label}
                      </span>
                    </td>
                    <td className="text-center py-2.5 px-4 font-semibold text-t2">
                      {row.total}
                    </td>
                    <td className="text-center py-2.5 px-4">
                      <span className={`font-bold ${tempColor}`}>
                        {row.cold > 0 ? `${row.cold}` : '—'}
                      </span>
                    </td>
                    <td className="text-center py-2.5 px-4">
                      {row.total > 0 ? (
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-16 h-1.5 bg-s3/70 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-700 ${
                                row.coldPct > 50 ? 'bg-red-500/70' :
                                row.coldPct > 25 ? 'bg-amber-500/70' : 'bg-green-500/70'
                              }`}
                              style={{ width: `${row.coldPct}%` }}
                            />
                          </div>
                          <span className={`text-xs font-semibold ${tempColor}`}>
                            {row.coldPct.toFixed(0)}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-t5">—</span>
                      )}
                    </td>
                    <td className="text-right py-2.5 pl-4">
                      <span className={`text-xs font-semibold ${row.vgvAtRisk > 0 ? 'text-orange-300' : 'text-t5'}`}>
                        {row.vgvAtRisk > 0 ? formatCurrency(row.vgvAtRisk) : '—'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {radarData.some(r => r.vgvAtRisk > 0) && (
              <tfoot>
                <tr className="border-t border-line">
                  <td colSpan={4} className="pt-2.5 text-[11px] text-t4">Total VGV em risco</td>
                  <td className="pt-2.5 text-right text-xs font-bold text-orange-300">
                    {formatCurrency(radarData.reduce((s, r) => s + r.vgvAtRisk, 0))}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {allLoaded && radarData.every(r => r.cold === 0) && active.length > 0 && (
          <p className="text-center text-xs text-green-400 mt-3 flex items-center justify-center gap-1.5">
            <CheckCircle2 size={13} /> Todos os leads tiveram interação nos últimos 3 dias
          </p>
        )}
      </div>

      {/* ── BLOCO 3 — Priority Ranking + Canal Performance ──────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Prioridade de Contato */}
        <div className="lg:col-span-3 bg-page border border-line rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <Crown size={13} className="text-amber-400" />
            <p className="text-sm font-semibold text-t1">Prioridade de Contato</p>
            <span className="ml-auto text-xs text-t4">Etapa × Ticket × Dias parado</span>
          </div>
          <p className="text-xs text-t4 mb-4">
            Quem ligar agora para maximizar conversão
          </p>

          {priorityList.length === 0 ? (
            <p className="text-xs text-t4 text-center py-8">Sem leads para priorizar</p>
          ) : (
            <div className="space-y-1.5">
              {priorityList.map(({ lead, score }, i) => {
                const days  = Math.floor(daysAgo(lead.updatedAt))
                const heat  = score > 80 ? 'hot' : score > 50 ? 'warm' : 'cold'
                const conf  = STAGE_CONFIG[lead.funnelStage]
                return (
                  <button
                    key={lead.id}
                    onClick={() => onOpenLead(lead)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-s2/30 hover:bg-s3/50 border border-line hover:border-line rounded-xl transition-all text-left group"
                  >
                    {/* Rank */}
                    <span className={`text-xs font-bold w-5 flex-shrink-0 ${i === 0 ? 'text-amber-400' : 'text-t4'}`}>
                      #{i + 1}
                    </span>

                    {/* Heat indicator */}
                    <div className={`w-1 h-8 rounded-full flex-shrink-0 ${
                      heat === 'hot'  ? 'bg-orange-500' :
                      heat === 'warm' ? 'bg-amber-500'  : 'bg-slate-600'
                    }`} />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-t1 truncate">{lead.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-[11px] px-1.5 py-px rounded-full border ${conf.bg} ${conf.color} ${conf.border}`}>
                          {conf.label}
                        </span>
                        <span className={`text-[11px] flex items-center gap-0.5 ${days > 7 ? 'text-amber-400' : 'text-t4'}`}>
                          <Clock size={8} /> {days}d sem atualização
                        </span>
                      </div>
                    </div>

                    {/* Ticket */}
                    {lead.averageTicket ? (
                      <span className="text-xs font-semibold text-violet-300 flex-shrink-0">
                        {formatCurrency(lead.averageTicket)}
                      </span>
                    ) : (
                      <span className="text-[11px] text-t5 flex-shrink-0">sem ticket</span>
                    )}

                    <ChevronRight size={11} className="text-t5 group-hover:text-t3 flex-shrink-0 transition-colors" />
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Canal Performance */}
        <div className="lg:col-span-2 bg-page border border-line rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <Zap size={13} className="text-t2" />
            <p className="text-sm font-semibold text-t1">Performance por Canal</p>
          </div>
          <p className="text-xs text-t4 mb-4">
            Onde investir mais esforço comercial
          </p>

          <div className="space-y-3">
            {canalPerf.map((c) => {
              const bestConvOrigin = [...canalPerf].sort((a, b) => b.convRate - a.convRate)[0]?.origin
              const isBestConv = c.origin === bestConvOrigin && c.convRate > 0
              return (
                <div key={c.origin} className={`p-3 rounded-xl border ${isBestConv ? 'bg-green-500/5 border-green-500/20' : 'bg-s2/30 border-line'}`}>
                  <div className="flex items-center gap-2 mb-2.5">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
                    <span className="text-xs font-semibold text-t1 flex items-center gap-1.5"><c.icon size={12} strokeWidth={1.6} className="text-t3" /> {c.label}</span>
                    <span className="ml-auto text-[11px] text-t3">{c.total} leads</span>
                    {isBestConv && (
                      <span className="text-[11px] px-1.5 py-px rounded-full bg-green-500/20 text-green-400 border border-green-500/25">melhor conv.</span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className={`text-sm font-bold ${
                        c.convRate > 3 ? 'text-green-400' :
                        c.convRate > 1 ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {c.convRate.toFixed(1)}%
                      </p>
                      <p className="text-[11px] text-t4 mt-0.5">conversão</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-t2">
                        {c.avgTkt > 0 ? formatCurrency(c.avgTkt) : '—'}
                      </p>
                      <p className="text-[11px] text-t4 mt-0.5">ticket médio</p>
                    </div>
                    <div>
                      <p className={`text-sm font-bold ${
                        c.discRate > 30 ? 'text-red-400' :
                        c.discRate > 15 ? 'text-amber-400' : 'text-t3'
                      }`}>
                        {c.discRate.toFixed(0)}%
                      </p>
                      <p className="text-[11px] text-t4 mt-0.5">descartados</p>
                    </div>
                  </div>

                  {/* VGV bar */}
                  {c.vgv > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-line flex items-center justify-between">
                      <span className="text-[11px] text-t4">VGV ativo</span>
                      <span className="text-xs font-semibold text-violet-300">{formatCurrency(c.vgv)}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── BLOCO 4 — Follow-up Intelligence + Loss Analysis ───────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Follow-up Intelligence */}
        <div className="bg-page border border-line rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <MessageCircle size={13} className="text-t2" />
            <p className="text-sm font-semibold text-t1">Inteligência de Follow-up</p>
            <span className="ml-auto text-xs text-t4">{followupLeads.length} em followup</span>
          </div>
          <p className="text-xs text-t4 mb-4">
            Em qual mensagem os leads param de responder
          </p>

          {followupLeads.length === 0 ? (
            <p className="text-xs text-t4 text-center py-8">Nenhum lead em followup</p>
          ) : (
            <div className="space-y-2.5">
              {followupSteps.map((item, i) => {
                const label    = i === 0 ? 'Nunca contactado' : `${i}ª mensagem enviada`
                const barPct   = maxFu > 0 ? (item.count / maxFu) * 100 : 0
                const next     = followupSteps[i + 1]?.count ?? 0
                const dropPct  = i < 5 && item.count > 0
                  ? Math.round(((item.count - next) / item.count) * 100)
                  : null
                const isRisk   = i === 0 && item.count > 0

                return (
                  <div key={i} className={`${isRisk ? 'bg-amber-500/5 border border-amber-500/15 rounded-xl p-2.5 -mx-1' : ''}`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs w-38 flex-shrink-0 ${isRisk ? 'text-amber-400 font-semibold' : 'text-t3'}`}
                            style={{ width: '144px' }}>
                        {isRisk && <AlertTriangle size={11} className="inline mr-1 -mt-0.5" />}{label}
                      </span>
                      <div className="flex-1 h-5 bg-s2/60 rounded-md overflow-hidden">
                        <div
                          className="h-full rounded-md transition-all duration-700"
                          style={{
                            width:           `${barPct}%`,
                            backgroundColor: isRisk ? 'rgba(245,158,11,0.25)' : 'rgba(59,130,246,0.3)',
                          }}
                        />
                      </div>
                      <span className="text-xs font-bold text-t1 w-5 text-right flex-shrink-0">
                        {item.count}
                      </span>
                      <span className={`text-[11px] w-10 text-right flex-shrink-0 ${
                        dropPct !== null && dropPct > 50 ? 'text-red-400' : 'text-t5'
                      }`}>
                        {dropPct !== null && item.count > 0 && dropPct > 0 ? `-${dropPct}%` : ''}
                      </span>
                    </div>
                  </div>
                )
              })}

              {/* Insight contextual */}
              {followupSteps[0].count > 0 && (
                <div className="mt-1 pt-3 border-t border-line">
                  <p className="text-xs text-amber-400/80 flex items-start gap-1.5">
                    <Zap size={12} className="flex-shrink-0 mt-0.5" /> <span>{followupSteps[0].count} lead{followupSteps[0].count > 1 ? 's' : ''} nunca {followupSteps[0].count > 1 ? 'foram' : 'foi'} contactado{followupSteps[0].count > 1 ? 's' : ''} — acionar agora</span>
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Loss Analysis */}
        <div className="bg-page border border-line rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <XCircle size={13} className="text-red-400" />
            <p className="text-sm font-semibold text-t1">Análise de Perda</p>
            <span className="ml-auto text-xs text-t4">{discarded.length} descartados</span>
          </div>
          <p className="text-xs text-t4 mb-4">
            VGV perdido por motivo — onde mais estamos deixando dinheiro na mesa
          </p>

          {lossAnalysis.length === 0 ? (
            <p className="text-xs text-t4 text-center py-8">Sem descartados</p>
          ) : (
            <div className="space-y-3">
              {lossAnalysis.map((item, i) => {
                const barPct  = maxLossVgv > 0 ? (item.vgv / maxLossVgv) * 100 : 0
                return (
                  <div key={item.key}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        {i === 0 && <span className="text-[11px] px-1.5 py-px rounded-full bg-red-500/20 text-red-400 border border-red-500/25">maior perda</span>}
                        <span className="text-xs text-t3">{item.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-t4">{item.count} leads</span>
                        <span className="text-xs font-semibold text-red-300">
                          {item.vgv > 0 ? formatCurrency(item.vgv) : '—'}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-s3/50 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-500/50 rounded-full transition-all duration-700"
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </div>
                )
              })}

              <div className="pt-3 border-t border-line flex items-center justify-between">
                <span className="text-xs text-t3">Total de VGV perdido</span>
                <span className="text-sm font-bold text-red-300">
                  {vgvPerdido > 0 ? formatCurrency(vgvPerdido) : '—'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── BLOCO 6 — Pulso Comercial ───────────────────────────────────────── */}
      <div className="bg-page border border-line rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <BarChart2 size={13} className="text-violet-400" />
          <p className="text-sm font-semibold text-t1">Pulso Comercial</p>
          {!allLoaded && <span className="ml-2 text-[11px] text-t4 animate-pulse">carregando…</span>}
          <span className="ml-auto text-xs text-t4">interações registradas nos últimos 14 dias</span>
        </div>
        <p className="text-xs text-t4 mb-5">
          Ritmo diário da equipe — queda indica inatividade comercial
        </p>

        {!allLoaded ? (
          <div className="h-24 flex items-center justify-center">
            <span className="text-xs text-t5 animate-pulse">Carregando dados…</span>
          </div>
        ) : (
          <div className="flex items-end gap-1 h-24 overflow-x-auto pb-1">
            {pulsoData.map((day, i) => {
              const barH   = maxPulso > 0 ? (day.count / maxPulso) * 100 : 0
              const isToday = i === 13
              return (
                <div key={day.dateStr} className="flex flex-col items-center gap-1 flex-1 min-w-[28px]">
                  {/* count label on top */}
                  <span className={`text-[11px] font-semibold leading-none ${day.count > 0 ? (isToday ? 'text-violet-300' : 'text-t3') : 'text-transparent'}`}>
                    {day.count}
                  </span>
                  {/* bar */}
                  <div className="w-full flex items-end" style={{ height: '56px' }}>
                    <div
                      className={`w-full rounded-t-sm transition-all duration-700 ${
                        isToday ? 'bg-violet-500/60' : day.count > 0 ? 'bg-slate-500/40' : 'bg-s2/60'
                      }`}
                      style={{ height: `${Math.max(4, barH)}%` }}
                    />
                  </div>
                  {/* date label */}
                  <span className={`text-[10px] leading-none truncate w-full text-center ${isToday ? 'text-violet-400 font-semibold' : 'text-t5'}`}>
                    {day.label}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {allLoaded && pulsoData.every(d => d.count === 0) && (
          <p className="text-center text-xs text-t4 mt-2">
            Nenhuma interação registrada nos últimos 14 dias
          </p>
        )}

        {allLoaded && pulsoData.some(d => d.count > 0) && (
          <div className="mt-3 pt-3 border-t border-line flex items-center justify-between">
            <span className="text-xs text-t4">
              Total no período: <span className="text-t2 font-semibold">{pulsoData.reduce((s, d) => s + d.count, 0)} interações</span>
            </span>
            <span className="text-xs text-t4">
              Média/dia: <span className="text-t2 font-semibold">{(pulsoData.reduce((s, d) => s + d.count, 0) / 14).toFixed(1)}</span>
            </span>
          </div>
        )}
      </div>

    </div>
  )
}

// ── NorthStar KPI Card ────────────────────────────────────────────────────────

interface NorthStarProps {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  color: string
  bg: string
  border: string
  highlight?: boolean
}

function NorthStar({ icon, label, value, sub, color, bg, border, highlight }: NorthStarProps) {
  return (
    <div className={`${bg} border ${border} rounded-xl p-5 ${highlight ? 'ring-1 ring-orange-500/25 shadow-lg shadow-orange-500/8' : ''} relative overflow-hidden`}>
      <div className={`absolute top-0 right-0 w-24 h-24 rounded-full -mr-8 -mt-8 ${bg} opacity-40 blur-xl`} />
      <div className={`w-8 h-8 rounded-xl ${bg} border ${border} flex items-center justify-center mb-4 ${color} relative`}>
        {icon}
      </div>
      <p className={`text-xs font-semibold uppercase tracking-widest text-t3 mb-1`}>{label}</p>
      <p className={`text-3xl font-black leading-none tabular-nums ${color}`}>{value}</p>
      <p className="text-[11px] text-t4 mt-2 leading-tight">{sub}</p>
    </div>
  )
}
