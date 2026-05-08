import { useMemo } from 'react'
import {
  Flame, DollarSign, TrendingDown, Activity,
  AlertTriangle, Clock, Crown, ChevronRight,
  MessageCircle, XCircle, Zap,
} from 'lucide-react'
import { Lead, LeadFunnelStage } from '../../types'
import { formatCurrency } from '../../lib/formatters'
import { STAGE_CONFIG } from './LeadKanban'

// ── Config ────────────────────────────────────────────────────────────────────

const STAGES: LeadFunnelStage[] = ['lead', 'followup', 'atendimento', 'visita', 'proposta', 'venda']

const ORIGIN_LABEL: Record<string, string> = {
  felicita: 'Felicità', meta_ads: 'Meta ADS', portal: 'Portal', offline: 'Offline',
}
const ORIGIN_COLOR: Record<string, string> = {
  felicita: '#f43f5e', meta_ads: '#3b82f6', portal: '#06b6d4', offline: '#f59e0b',
}
const ORIGIN_EMOJI: Record<string, string> = {
  felicita: '✨', meta_ads: '📱', portal: '🌐', offline: '🤝',
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
  const active    = useMemo(() => leads.filter(l => !l.discardReason), [leads])
  const discarded = useMemo(() => leads.filter(l => !!l.discardReason), [leads])

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
    return STAGES.map((stage, i) => {
      const inStage   = active.filter(l => l.funnelStage === stage)
      const count     = inStage.length
      const vgv       = inStage.reduce((s, l) => s + (l.averageTicket ?? 0), 0)
      const parados   = inStage.filter(l => daysAgo(l.updatedAt) > 7).length
      // Leads que chegaram até esta etapa ou além (funil acumulado)
      const reached   = all.filter(l => STAGES.indexOf(l.funnelStage) >= i).length
      const reachedPrev = i === 0 ? all.length : all.filter(l => STAGES.indexOf(l.funnelStage) >= i - 1).length
      const dropRate  = reachedPrev > 0 ? Math.round(((reachedPrev - reached) / reachedPrev) * 100) : 0
      return { stage, count, vgv, parados, dropRate, conf: STAGE_CONFIG[stage] }
    })
  }, [active, discarded])

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
        emoji:    ORIGIN_EMOJI[origin] ?? '',
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

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="p-5 space-y-4 max-w-7xl mx-auto">

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
      <div className="bg-[#1A1D27] border border-white/8 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-slate-200">Pipeline Estratégico</p>
          <span className="text-[11px] text-slate-600">↓% = perda da etapa anterior · ⚠ parado &gt;7 dias</span>
        </div>
        <div className="flex items-stretch gap-1 overflow-x-auto pb-1 min-w-0">
          {funnelStages.map((item, i) => (
            <div key={item.stage} className="flex items-stretch flex-shrink-0">
              <div className={`flex flex-col w-[138px] rounded-xl border ${item.conf.border} ${item.conf.bg} p-3 gap-1`}>
                {/* Queda da etapa anterior */}
                {i > 0 ? (
                  <span className={`text-[10px] font-bold ${
                    item.dropRate > 50 ? 'text-red-400' :
                    item.dropRate > 25 ? 'text-amber-400' : 'text-green-400'
                  }`}>
                    ↓ {item.dropRate}% saiu
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-600">{leads.length} total</span>
                )}

                <p className={`text-xs font-semibold mt-0.5 ${item.conf.headerText}`}>{item.conf.label}</p>
                <p className={`text-3xl font-bold leading-none ${item.conf.color}`}>{item.count}</p>

                {item.vgv > 0 && (
                  <p className="text-[10px] text-slate-500 mt-0.5">{formatCurrency(item.vgv)}</p>
                )}

                {item.parados > 0 && item.stage !== 'venda' && (
                  <div className="flex items-center gap-1 mt-1">
                    <AlertTriangle size={9} className="text-amber-400 flex-shrink-0" />
                    <span className="text-[10px] text-amber-400">{item.parados} parados</span>
                  </div>
                )}
              </div>

              {i < funnelStages.length - 1 && (
                <div className="flex items-center px-0.5 flex-shrink-0">
                  <ChevronRight size={13} className="text-slate-700" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── BLOCO 3 — Priority Ranking + Canal Performance ──────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Prioridade de Contato */}
        <div className="lg:col-span-3 bg-[#1A1D27] border border-white/8 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <Crown size={13} className="text-amber-400" />
            <p className="text-sm font-semibold text-slate-200">Prioridade de Contato</p>
            <span className="ml-auto text-[11px] text-slate-600">Etapa × Ticket × Dias parado</span>
          </div>
          <p className="text-[11px] text-slate-600 mb-4">
            Quem ligar agora para maximizar conversão
          </p>

          {priorityList.length === 0 ? (
            <p className="text-xs text-slate-600 text-center py-8">Sem leads para priorizar</p>
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
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-white/2 hover:bg-white/5 border border-white/5 hover:border-white/12 rounded-xl transition-all text-left group"
                  >
                    {/* Rank */}
                    <span className={`text-xs font-bold w-5 flex-shrink-0 ${i === 0 ? 'text-amber-400' : 'text-slate-600'}`}>
                      #{i + 1}
                    </span>

                    {/* Heat indicator */}
                    <div className={`w-1 h-8 rounded-full flex-shrink-0 ${
                      heat === 'hot'  ? 'bg-orange-500' :
                      heat === 'warm' ? 'bg-amber-500'  : 'bg-slate-600'
                    }`} />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-200 truncate">{lead.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-[10px] px-1.5 py-px rounded-full border ${conf.bg} ${conf.color} ${conf.border}`}>
                          {conf.label}
                        </span>
                        <span className={`text-[10px] flex items-center gap-0.5 ${days > 7 ? 'text-amber-400' : 'text-slate-600'}`}>
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
                      <span className="text-[10px] text-slate-700 flex-shrink-0">sem ticket</span>
                    )}

                    <ChevronRight size={11} className="text-slate-700 group-hover:text-slate-400 flex-shrink-0 transition-colors" />
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Canal Performance */}
        <div className="lg:col-span-2 bg-[#1A1D27] border border-white/8 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <Zap size={13} className="text-blue-400" />
            <p className="text-sm font-semibold text-slate-200">Performance por Canal</p>
          </div>
          <p className="text-[11px] text-slate-600 mb-4">
            Onde investir mais esforço comercial
          </p>

          <div className="space-y-3">
            {canalPerf.map((c, idx) => {
              const bestConvOrigin = [...canalPerf].sort((a, b) => b.convRate - a.convRate)[0]?.origin
              const isBestConv = c.origin === bestConvOrigin && c.convRate > 0
              return (
                <div key={c.origin} className={`p-3 rounded-xl border ${isBestConv ? 'bg-green-500/5 border-green-500/20' : 'bg-white/2 border-white/5'}`}>
                  <div className="flex items-center gap-2 mb-2.5">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
                    <span className="text-xs font-semibold text-slate-200">{c.emoji} {c.label}</span>
                    <span className="ml-auto text-[10px] text-slate-500">{c.total} leads</span>
                    {isBestConv && (
                      <span className="text-[9px] px-1.5 py-px rounded-full bg-green-500/20 text-green-400 border border-green-500/25">melhor conv.</span>
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
                      <p className="text-[9px] text-slate-600 mt-0.5">conversão</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-300">
                        {c.avgTkt > 0 ? formatCurrency(c.avgTkt) : '—'}
                      </p>
                      <p className="text-[9px] text-slate-600 mt-0.5">ticket médio</p>
                    </div>
                    <div>
                      <p className={`text-sm font-bold ${
                        c.discRate > 30 ? 'text-red-400' :
                        c.discRate > 15 ? 'text-amber-400' : 'text-slate-400'
                      }`}>
                        {c.discRate.toFixed(0)}%
                      </p>
                      <p className="text-[9px] text-slate-600 mt-0.5">descartados</p>
                    </div>
                  </div>

                  {/* VGV bar */}
                  {c.vgv > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center justify-between">
                      <span className="text-[10px] text-slate-600">VGV ativo</span>
                      <span className="text-[11px] font-semibold text-violet-300">{formatCurrency(c.vgv)}</span>
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
        <div className="bg-[#1A1D27] border border-white/8 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <MessageCircle size={13} className="text-blue-400" />
            <p className="text-sm font-semibold text-slate-200">Inteligência de Follow-up</p>
            <span className="ml-auto text-[11px] text-slate-600">{followupLeads.length} em followup</span>
          </div>
          <p className="text-[11px] text-slate-600 mb-4">
            Em qual mensagem os leads param de responder
          </p>

          {followupLeads.length === 0 ? (
            <p className="text-xs text-slate-600 text-center py-8">Nenhum lead em followup</p>
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
                      <span className={`text-[11px] w-38 flex-shrink-0 ${isRisk ? 'text-amber-400 font-semibold' : 'text-slate-500'}`}
                            style={{ width: '144px' }}>
                        {isRisk && '⚠ '}{label}
                      </span>
                      <div className="flex-1 h-5 bg-white/4 rounded-md overflow-hidden">
                        <div
                          className="h-full rounded-md transition-all duration-700"
                          style={{
                            width:           `${barPct}%`,
                            backgroundColor: isRisk ? 'rgba(245,158,11,0.25)' : 'rgba(59,130,246,0.3)',
                          }}
                        />
                      </div>
                      <span className="text-xs font-bold text-slate-200 w-5 text-right flex-shrink-0">
                        {item.count}
                      </span>
                      <span className={`text-[10px] w-10 text-right flex-shrink-0 ${
                        dropPct !== null && dropPct > 50 ? 'text-red-400' : 'text-slate-700'
                      }`}>
                        {dropPct !== null && item.count > 0 && dropPct > 0 ? `-${dropPct}%` : ''}
                      </span>
                    </div>
                  </div>
                )
              })}

              {/* Insight contextual */}
              {followupSteps[0].count > 0 && (
                <div className="mt-1 pt-3 border-t border-white/5">
                  <p className="text-[11px] text-amber-400/80">
                    ⚡ {followupSteps[0].count} lead{followupSteps[0].count > 1 ? 's' : ''} nunca {followupSteps[0].count > 1 ? 'foram' : 'foi'} contactado{followupSteps[0].count > 1 ? 's' : ''} — acionar agora
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Loss Analysis */}
        <div className="bg-[#1A1D27] border border-white/8 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <XCircle size={13} className="text-red-400" />
            <p className="text-sm font-semibold text-slate-200">Análise de Perda</p>
            <span className="ml-auto text-[11px] text-slate-600">{discarded.length} descartados</span>
          </div>
          <p className="text-[11px] text-slate-600 mb-4">
            VGV perdido por motivo — onde mais estamos deixando dinheiro na mesa
          </p>

          {lossAnalysis.length === 0 ? (
            <p className="text-xs text-slate-600 text-center py-8">Sem descartados</p>
          ) : (
            <div className="space-y-3">
              {lossAnalysis.map((item, i) => {
                const barPct  = maxLossVgv > 0 ? (item.vgv / maxLossVgv) * 100 : 0
                return (
                  <div key={item.key}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        {i === 0 && <span className="text-[9px] px-1.5 py-px rounded-full bg-red-500/20 text-red-400 border border-red-500/25">maior perda</span>}
                        <span className="text-[11px] text-slate-400">{item.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-600">{item.count} leads</span>
                        <span className="text-xs font-semibold text-red-300">
                          {item.vgv > 0 ? formatCurrency(item.vgv) : '—'}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-500/50 rounded-full transition-all duration-700"
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </div>
                )
              })}

              <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                <span className="text-xs text-slate-500">Total de VGV perdido</span>
                <span className="text-sm font-bold text-red-300">
                  {vgvPerdido > 0 ? formatCurrency(vgvPerdido) : '—'}
                </span>
              </div>
            </div>
          )}
        </div>
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
    <div className={`${bg} border ${border} rounded-2xl p-4 ${highlight ? 'ring-1 ring-orange-500/20' : ''}`}>
      <div className={`w-8 h-8 rounded-xl ${bg} border ${border} flex items-center justify-center mb-3 ${color}`}>
        {icon}
      </div>
      <p className={`text-xl font-bold leading-none ${color}`}>{value}</p>
      <p className="text-xs font-semibold text-slate-300 mt-1.5">{label}</p>
      <p className="text-[10px] text-slate-600 mt-0.5 leading-tight">{sub}</p>
    </div>
  )
}
