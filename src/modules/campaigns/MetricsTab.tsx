import { useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Card } from '../../components/ui/Card'
import { CampaignLead } from '../../types'
import { FUNNEL_STAGES, FUNNEL_COLORS, SITUATION_CONFIG } from './config'
import { formatCurrency } from '../../lib/formatters'

interface MetricsTabProps {
  leads: CampaignLead[]
}

const axisStyle = { fill: '#475569', fontSize: 11 }

// Larguras fixas decrescentes para cada etapa (0 = mais largo, 6 = mais estreito)
// Independente dos dados — cria o visual de funil real
const STAGE_WIDTHS_PCT = [100, 84, 69, 55, 42, 30, 20]

// ─── Funil SVG — pirâmide invertida ──────────────────────────────────────────

function SalesFunnel({ leads }: { leads: CampaignLead[] }) {
  const total = leads.length

  // Ordem das etapas para comparação de índice
  const STAGE_ORDER = FUNNEL_STAGES.map(s => s.value)

  const stageData = FUNNEL_STAGES.map((s, i) => {
    // Conta leads que estão nesta etapa OU em etapas posteriores (já passaram por aqui)
    const stageIdx = STAGE_ORDER.indexOf(s.value)
    const count    = leads.filter(l => STAGE_ORDER.indexOf(l.funnelStage) >= stageIdx).length
    const ofTotal  = total > 0 ? Math.round((count / total) * 100) : 0
    const widthPct = STAGE_WIDTHS_PCT[i] ?? 20
    return { ...s, count, ofTotal, widthPct, fill: FUNNEL_COLORS[s.value] }
  })

  // Conversão estágio-a-estágio (em relação ao estágio anterior)
  const convPct = stageData.map((s, i) => {
    if (i === 0) return null
    const prev = stageData[i - 1].count
    return prev > 0 ? Math.round((s.count / prev) * 100) : 0
  })

  const W       = 460    // viewBox width
  const STAGE_H = 46     // altura de cada faixa
  const TOTAL_H = stageData.length * STAGE_H
  const BADGE_R = 18     // raio dos badges de conversão

  const stages = stageData.map((s, i) => {
    const barW = (s.widthPct / 100) * W
    const x    = (W - barW) / 2
    const y    = i * STAGE_H
    return { ...s, barW, x, y }
  })

  return (
    <svg
      viewBox={`-${BADGE_R + 4} 0 ${W + (BADGE_R + 4) * 2} ${TOTAL_H}`}
      width="100%"
      style={{ display: 'block', maxHeight: 340 }}
    >
      <defs>
        {stages.map(s => (
          <linearGradient key={s.value} id={`mfg-${s.value}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor={s.fill} stopOpacity={0.6}  />
            <stop offset="50%"  stopColor={s.fill} stopOpacity={1.0}  />
            <stop offset="100%" stopColor={s.fill} stopOpacity={0.6}  />
          </linearGradient>
        ))}
      </defs>

      {stages.map((stage, i) => {
        const next = stages[i + 1]
        const cx   = W / 2
        const cy   = stage.y + STAGE_H / 2

        // Trapézio: topo desta etapa afunilando até o topo da próxima
        const x1 = stage.x,           y1 = stage.y
        const x2 = stage.x + stage.barW
        const y2 = stage.y + STAGE_H
        const x3 = next ? next.x             : cx - 2
        const x4 = next ? next.x + next.barW : cx + 2

        const conv = convPct[i]

        return (
          <g key={stage.value}>
            {/* Trapézio preenchido */}
            <polygon
              points={`${x1},${y1} ${x2},${y1} ${x4},${y2} ${x3},${y2}`}
              fill={`url(#mfg-${stage.value})`}
            />
            {/* Borda superior sutil */}
            <line x1={x1} y1={y1} x2={x2} y2={y1} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />

            {/* Label da etapa */}
            <text x={cx} y={cy - 7} textAnchor="middle" fill="white" fontSize={10} fontWeight="700" opacity={0.92}>
              {stage.label}
            </text>

            {/* Contagem */}
            <text x={cx} y={cy + 6} textAnchor="middle" fill="white" fontSize={13} fontWeight="800">
              {stage.count.toLocaleString('pt-BR')}
            </text>

            {/* % conversão da etapa anterior (mais útil que % do total) */}
            {conv !== null && (
              <text x={cx} y={cy + 19} textAnchor="middle" fill="white" fontSize={8} fontWeight="400" opacity={0.55}>
                {conv}% do anterior
              </text>
            )}

            {/* Badge de conversão (entre etapas) — à direita */}
            {conv !== null && (
              <g>
                {/* linha tracejada */}
                <line
                  x1={x2 + 4} y1={stage.y}
                  x2={W / 2 + stage.barW / 2 + BADGE_R + 2} y2={stage.y}
                  stroke="rgba(255,255,255,0.1)" strokeWidth={0.8} strokeDasharray="3 2"
                />
                {/* círculo badge */}
                <circle
                  cx={W / 2 + stage.barW / 2 + BADGE_R + 6}
                  cy={stage.y}
                  r={BADGE_R}
                  fill={conv >= 50 ? '#22c55e22' : conv >= 20 ? '#f59e0b22' : '#ef444422'}
                  stroke={conv >= 50 ? '#22c55e80' : conv >= 20 ? '#f59e0b80' : '#ef444480'}
                  strokeWidth={1}
                />
                <text
                  x={W / 2 + stage.barW / 2 + BADGE_R + 6}
                  y={stage.y + 4}
                  textAnchor="middle"
                  fill={conv >= 50 ? '#4ade80' : conv >= 20 ? '#fbbf24' : '#f87171'}
                  fontSize={9} fontWeight="700"
                >
                  {conv}%
                </text>
              </g>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ─── Conversão por mensagem ───────────────────────────────────────────────────

const ENGAGED_STAGES = ['attended', 'scheduled', 'presentation', 'proposal', 'sale']

function ConversionByMessage({ leads }: { leads: CampaignLead[] }) {
  const messageStats = useMemo(() => {
    const leadsWithMessage = leads.filter(l => l.lastMessage && l.lastMessage.trim() !== '')
    if (leadsWithMessage.length === 0) return []

    const map = new Map<string, { total: number; engaged: number }>()
    leadsWithMessage.forEach(l => {
      const msg = l.lastMessage!
      const existing = map.get(msg) ?? { total: 0, engaged: 0 }
      existing.total += 1
      if (ENGAGED_STAGES.includes(l.funnelStage)) existing.engaged += 1
      map.set(msg, existing)
    })

    return Array.from(map.entries())
      .map(([message, { total, engaged }]) => ({
        message,
        total,
        engaged,
        rate: total > 0 ? Math.round((engaged / total) * 100) : 0,
      }))
      .sort((a, b) => b.rate - a.rate)
  }, [leads])

  const hasData = messageStats.length > 0

  return (
    <Card>
      <h2 className="text-sm font-semibold text-slate-300 mb-4">Conversão por mensagem</h2>
      {!hasData ? (
        <p className="text-sm text-slate-600 text-center py-6">
          Envie mensagens pelo sistema para ver a análise por template
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {messageStats.map((item, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 p-3 rounded-xl bg-white/3 border border-white/5"
            >
              {/* Message preview + badge */}
              <div className="flex items-start gap-3">
                <p
                  className="flex-1 text-xs italic text-slate-400 leading-5 min-w-0"
                  style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  "{item.message}"
                </p>
                <span className="flex-shrink-0 text-[11px] font-semibold bg-white/8 text-slate-300 px-2 py-0.5 rounded-full whitespace-nowrap">
                  {item.total} lead{item.total !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Progress bar + percentage */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-white/8 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-green-500 transition-all"
                    style={{ width: `${item.rate}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-green-400 tabular-nums w-9 text-right">
                  {item.rate}%
                </span>
              </div>
              <p className="text-[10px] text-slate-600">
                {item.engaged} de {item.total} engajaram
              </p>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function MetricsTab({ leads }: MetricsTabProps) {
  // Leads com contato inexistente são excluídos do funil
  const funnelLeads = leads.filter(l => l.situation !== 'invalid')

  const total      = funnelLeads.length
  const contacted  = funnelLeads.filter(l => l.firstContactAt).length
  const engaged    = funnelLeads.filter(l => ['attended','scheduled','presentation','proposal','sale'].includes(l.funnelStage)).length
  const proposals  = funnelLeads.filter(l => l.funnelStage === 'proposal').length
  const sales      = funnelLeads.filter(l => l.funnelStage === 'sale').length
  const responseRate  = contacted > 0 ? Math.round((engaged   / contacted) * 100) : 0
  const convRate      = total     > 0 ? Math.round((sales     / total)     * 100) : 0
  const proposalValue = funnelLeads.reduce((a, l) => a + (l.proposalValue ?? 0), 0)

  const dailyData = useMemo(() => {
    return Array.from({ length: 21 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (20 - i))
      const dateStr = d.toISOString().split('T')[0]
      return {
        date:      `${d.getDate()}/${d.getMonth() + 1}`,
        acionados: funnelLeads.filter(l => l.firstContactAt?.startsWith(dateStr)).length,
      }
    })
  }, [funnelLeads])

  const situationData = SITUATION_CONFIG.map(s => ({
    ...s,
    count: leads.filter(l => l.situation === s.value).length,
  }))

  return (
    <div className="flex flex-col gap-6">

      {/* KPIs topo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total no funil',    value: total.toLocaleString('pt-BR'),                                                                   color: 'text-slate-200'  },
          { label: 'Leads acionados',   value: `${contacted.toLocaleString('pt-BR')} (${contacted > 0 ? Math.round(contacted/total*100) : 0}%)`, color: 'text-blue-400'   },
          { label: 'Taxa de resposta',  value: `${responseRate}%`,                                                                              color: 'text-cyan-400'   },
          { label: 'Conversão (venda)', value: `${convRate}%`,                                                                                  color: 'text-green-400'  },
        ].map(kpi => (
          <Card key={kpi.label} className="!py-4">
            <p className="text-xs text-slate-600 mb-1">{kpi.label}</p>
            <p className={`text-2xl font-bold tabular-nums ${kpi.color}`}>{kpi.value}</p>
          </Card>
        ))}
      </div>

      {/* Layout 2 colunas: funil (esq) + métricas laterais (dir) */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* ── Funil ── (ocupa 3/5 do espaço) */}
        <Card className="lg:col-span-3">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Funil de conversão</h2>
          {total === 0 ? (
            <div className="flex items-center justify-center h-52">
              <p className="text-sm text-slate-600">Nenhum lead importado ainda</p>
            </div>
          ) : (
            <div className="px-2">
              <SalesFunnel leads={funnelLeads} />
            </div>
          )}
        </Card>

        {/* ── Lateral: situação + volume ── (ocupa 2/5) */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <Card className="flex-1">
            <h2 className="text-sm font-semibold text-slate-300 mb-4">Situação dos leads</h2>
            <div className="flex flex-col gap-2">
              {situationData.map(s => (
                <div key={s.value} className="flex items-center gap-2 py-2 px-3 rounded-xl bg-white/3 border border-white/5">
                  <span className={`flex-1 text-xs ${s.color}`}>{s.label}</span>
                  <span className="text-sm font-bold tabular-nums text-slate-200">{s.count}</span>
                  <span className="text-[10px] text-slate-600 w-8 text-right">
                    {total > 0 ? `${Math.round(s.count / total * 100)}%` : '—'}
                  </span>
                </div>
              ))}
              <div className="flex items-center gap-2 py-2 px-3 rounded-xl bg-white/3 border border-white/5">
                <span className="flex-1 text-xs text-slate-400">Sem situação</span>
                <span className="text-sm font-bold tabular-nums text-slate-200">
                  {leads.filter(l => !l.situation).length}
                </span>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold text-slate-300 mb-4">Volume financeiro</h2>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between py-2 border-b border-white/8">
                <span className="text-xs text-slate-400">Propostas abertas</span>
                <div className="text-right">
                  <p className="text-sm font-bold text-amber-400 tabular-nums">{proposals}</p>
                  {proposalValue > 0 && <p className="text-[10px] text-slate-500">{formatCurrency(proposalValue)}</p>}
                </div>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-white/8">
                <span className="text-xs text-slate-400">Vendas convertidas</span>
                <p className="text-sm font-bold text-green-400 tabular-nums">{sales}</p>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-xs text-slate-400">Proposta → Venda</span>
                <p className="text-sm font-bold text-slate-200 tabular-nums">
                  {proposals + sales > 0 ? `${Math.round(sales / (proposals + sales) * 100)}%` : '—'}
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Leads acionados por dia */}
      <Card>
        <h2 className="text-sm font-semibold text-slate-300 mb-5">Leads acionados por dia — últimos 21 dias</h2>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={dailyData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="camGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}    />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="date" tick={axisStyle} axisLine={false} tickLine={false} interval={2} />
            <YAxis tick={axisStyle} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: '#1A1D27', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }}
              labelStyle={{ color: '#94a3b8', fontSize: 11 }}
              itemStyle={{ color: '#93c5fd' }}
              formatter={(v: number) => [v, 'Acionados']}
            />
            <Area type="monotone" dataKey="acionados" stroke="#3b82f6" strokeWidth={2}
              fill="url(#camGrad)" dot={{ fill: '#3b82f6', r: 3 }} activeDot={{ r: 5 }} name="Acionados" />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* Conversão por mensagem */}
      <ConversionByMessage leads={funnelLeads} />
    </div>
  )
}
