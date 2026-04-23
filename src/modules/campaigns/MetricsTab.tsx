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

// ─── Funil visual SVG ─────────────────────────────────────────────────────────

function SalesFunnel({ leads }: { leads: CampaignLead[] }) {
  const total = leads.length

  const stageData = FUNNEL_STAGES.map(s => ({
    ...s,
    count: leads.filter(l => l.funnelStage === s.value).length,
    fill:  FUNNEL_COLORS[s.value],
  }))

  const maxCount = Math.max(...stageData.map(s => s.count), 1)

  const W       = 540    // largura do viewBox
  const STAGE_H = 54     // altura de cada etapa
  const MIN_W   = 110    // largura mínima visível
  const TOTAL_H = stageData.length * STAGE_H

  const stages = stageData.map((s, i) => {
    const barW = Math.max(MIN_W, (s.count / maxCount) * W)
    const x    = (W - barW) / 2
    const y    = i * STAGE_H
    const pct  = total > 0 ? Math.round((s.count / total) * 100) : 0
    return { ...s, barW, x, y, pct }
  })

  return (
    <svg viewBox={`0 0 ${W} ${TOTAL_H}`} width="100%" style={{ display: 'block' }}>
      <defs>
        {stages.map(s => (
          <linearGradient key={s.value} id={`fg-${s.value}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor={s.fill} stopOpacity={0.55} />
            <stop offset="50%"  stopColor={s.fill} stopOpacity={0.9}  />
            <stop offset="100%" stopColor={s.fill} stopOpacity={0.55} />
          </linearGradient>
        ))}
      </defs>

      {stages.map((stage, i) => {
        const next = stages[i + 1]
        const cx   = W / 2
        const cy   = stage.y + STAGE_H / 2

        // Trapézio: topo desta etapa → base afinando para a próxima etapa
        const x1 = stage.x
        const x2 = stage.x + stage.barW
        const y1 = stage.y
        const y2 = stage.y + STAGE_H
        const x3 = next ? next.x              : x1
        const x4 = next ? next.x + next.barW  : x2

        const points = `${x1},${y1} ${x2},${y1} ${x4},${y2} ${x3},${y2}`

        return (
          <g key={stage.value}>
            {/* Trapézio da etapa */}
            <polygon
              points={points}
              fill={`url(#fg-${stage.value})`}
              stroke={stage.fill}
              strokeWidth={0.8}
              strokeOpacity={0.3}
            />

            {/* Linha separadora interna */}
            <line
              x1={x1} y1={y1} x2={x2} y2={y1}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={1}
            />

            {/* Nome da etapa */}
            <text
              x={cx} y={cy - 9}
              textAnchor="middle"
              fill="white"
              fontSize={11}
              fontWeight="600"
              opacity={0.95}
            >
              {stage.label}
            </text>

            {/* Contagem · percentual */}
            <text
              x={cx} y={cy + 10}
              textAnchor="middle"
              fill="white"
              fontSize={13}
              fontWeight="700"
              opacity={0.9}
            >
              {stage.count.toLocaleString('pt-BR')}
            </text>
            <text
              x={cx} y={cy + 24}
              textAnchor="middle"
              fill="white"
              fontSize={9}
              fontWeight="400"
              opacity={0.5}
            >
              {stage.pct}% do total
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function MetricsTab({ leads }: MetricsTabProps) {
  const total      = leads.length
  const contacted  = leads.filter(l => l.firstContactAt).length
  const engaged    = leads.filter(l => ['attended','scheduled','presentation','proposal','sale'].includes(l.funnelStage)).length
  const proposals  = leads.filter(l => l.funnelStage === 'proposal').length
  const sales      = leads.filter(l => l.funnelStage === 'sale').length
  const responseRate  = contacted > 0 ? Math.round((engaged   / contacted) * 100) : 0
  const convRate      = total     > 0 ? Math.round((sales     / total)     * 100) : 0
  const proposalValue = leads.reduce((a, l) => a + (l.proposalValue ?? 0), 0)

  // Contatos por dia — últimos 21 dias
  const dailyData = useMemo(() => {
    return Array.from({ length: 21 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (20 - i))
      const dateStr = d.toISOString().split('T')[0]
      return {
        date:      `${d.getDate()}/${d.getMonth() + 1}`,
        acionados: leads.filter(l => l.firstContactAt?.startsWith(dateStr)).length,
      }
    })
  }, [leads])

  const situationData = SITUATION_CONFIG.map(s => ({
    ...s,
    count: leads.filter(l => l.situation === s.value).length,
  }))

  return (
    <div className="flex flex-col gap-6">

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total de leads',    value: total.toLocaleString('pt-BR'),                                                            color: 'text-slate-200'  },
          { label: 'Leads acionados',   value: `${contacted.toLocaleString('pt-BR')} (${contacted > 0 ? Math.round(contacted/total*100) : 0}%)`, color: 'text-blue-400'   },
          { label: 'Taxa de resposta',  value: `${responseRate}%`,                                                                       color: 'text-cyan-400'   },
          { label: 'Conversão (venda)', value: `${convRate}%`,                                                                           color: 'text-green-400'  },
        ].map(kpi => (
          <Card key={kpi.label} className="!py-4">
            <p className="text-xs text-slate-600 mb-1">{kpi.label}</p>
            <p className={`text-2xl font-bold tabular-nums ${kpi.color}`}>{kpi.value}</p>
          </Card>
        ))}
      </div>

      {/* ── Funil visual ── */}
      <Card>
        <h2 className="text-sm font-medium text-slate-300 mb-5">Funil de conversão</h2>
        {total === 0 ? (
          <div className="flex items-center justify-center h-40">
            <p className="text-sm text-slate-600">Nenhum lead importado ainda</p>
          </div>
        ) : (
          <SalesFunnel leads={leads} />
        )}
      </Card>

      {/* Leads acionados por dia */}
      <Card>
        <h2 className="text-sm font-medium text-slate-300 mb-5">Leads acionados por dia — últimos 21 dias</h2>
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

      {/* Situação + Volume financeiro */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <h2 className="text-sm font-medium text-slate-300 mb-4">Relatório de situação</h2>
          <div className="flex flex-col gap-2">
            {situationData.map(s => (
              <div key={s.value} className="flex items-center gap-3 py-2.5 px-3 rounded-xl bg-white/3 border border-white/5">
                <span className={`flex-1 text-sm ${s.color}`}>{s.label}</span>
                <span className="text-lg font-bold tabular-nums text-slate-200">{s.count}</span>
                <span className="text-xs text-slate-600 w-10 text-right">
                  {total > 0 ? `${Math.round(s.count / total * 100)}%` : '—'}
                </span>
              </div>
            ))}
            <div className="flex items-center gap-3 py-2.5 px-3 rounded-xl bg-white/3 border border-white/5">
              <span className="flex-1 text-sm text-slate-400">Sem situação definida</span>
              <span className="text-lg font-bold tabular-nums text-slate-200">
                {leads.filter(l => !l.situation).length}
              </span>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-medium text-slate-300 mb-4">Volume financeiro</h2>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between py-3 border-b border-white/8">
              <span className="text-sm text-slate-400">Propostas abertas</span>
              <div className="text-right">
                <p className="text-sm font-bold text-amber-400 tabular-nums">{proposals}</p>
                {proposalValue > 0 && <p className="text-xs text-slate-500">{formatCurrency(proposalValue)}</p>}
              </div>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-white/8">
              <span className="text-sm text-slate-400">Vendas convertidas</span>
              <p className="text-sm font-bold text-green-400 tabular-nums">{sales}</p>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-slate-400">Taxa proposta → venda</span>
              <p className="text-sm font-bold text-slate-200 tabular-nums">
                {proposals + sales > 0 ? `${Math.round(sales / (proposals + sales) * 100)}%` : '—'}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
