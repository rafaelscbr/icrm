import { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, Cell, PieChart, Pie
} from 'recharts'
import { Card } from '../../components/ui/Card'
import { CampaignLead } from '../../types'
import { FUNNEL_STAGES, SITUATION_CONFIG } from './config'
import { formatCurrency } from '../../lib/formatters'

interface MetricsTabProps {
  leads: CampaignLead[]
}

const axisStyle = { fill: '#475569', fontSize: 11 }

const STAGE_COLORS: Record<string, string> = {
  new:          '#64748b',
  sent:         '#3b82f6',
  attended:     '#06b6d4',
  presentation: '#6366f1',
  proposal:     '#f59e0b',
  sale:         '#22c55e',
}

export function MetricsTab({ leads }: MetricsTabProps) {
  const total      = leads.length
  const contacted  = leads.filter(l => l.firstContactAt).length
  const attended   = leads.filter(l => ['attended','presentation','proposal','sale'].includes(l.funnelStage)).length
  const proposals  = leads.filter(l => l.funnelStage === 'proposal').length
  const sales      = leads.filter(l => l.funnelStage === 'sale').length
  const responseRate  = contacted > 0 ? Math.round((attended / contacted) * 100) : 0
  const convRate      = total     > 0 ? Math.round((sales    / total)     * 100) : 0
  const proposalValue = leads.reduce((a, l) => a + (l.proposalValue ?? 0), 0)

  // Funnel bar chart
  const funnelData = FUNNEL_STAGES.slice(1).map(s => ({
    name:  s.short,
    leads: leads.filter(l => l.funnelStage === s.value).length,
    fill:  STAGE_COLORS[s.value],
  }))

  // Contacts per day (last 21 days)
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

  // Situation breakdown
  const situationData = SITUATION_CONFIG.map(s => ({
    ...s,
    count: leads.filter(l => l.situation === s.value).length,
  }))

  // Stage pie chart data
  const pieData = FUNNEL_STAGES.filter(s => s.value !== 'new').map(s => ({
    name:  s.label,
    value: leads.filter(l => l.funnelStage === s.value).length,
    fill:  STAGE_COLORS[s.value],
  })).filter(d => d.value > 0)

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total de leads',    value: total,                       color: 'text-slate-200'  },
          { label: 'Leads acionados',   value: `${contacted} (${contacted > 0 ? Math.round(contacted/total*100) : 0}%)`, color: 'text-blue-400' },
          { label: 'Taxa de resposta',  value: `${responseRate}%`,           color: 'text-cyan-400'   },
          { label: 'Conversão (venda)', value: `${convRate}%`,               color: 'text-green-400'  },
        ].map(kpi => (
          <Card key={kpi.label} className="!py-4">
            <p className="text-xs text-slate-600 mb-1">{kpi.label}</p>
            <p className={`text-2xl font-bold tabular-nums ${kpi.color}`}>{kpi.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Funnel bar chart */}
        <Card>
          <h2 className="text-sm font-medium text-slate-300 mb-5">Leads por etapa do funil</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={funnelData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} />
              <YAxis tick={axisStyle} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#1A1D27', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }}
                labelStyle={{ color: '#94a3b8', fontSize: 11 }}
                itemStyle={{ color: '#e2e8f0' }}
                formatter={(v: number) => [v, 'Leads']}
              />
              <Bar dataKey="leads" radius={[6, 6, 0, 0]}>
                {funnelData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Pie chart */}
        <Card>
          <h2 className="text-sm font-medium text-slate-300 mb-5">Distribuição do funil</h2>
          {pieData.length === 0 ? (
            <div className="flex items-center justify-center h-48">
              <p className="text-sm text-slate-600">Nenhum lead acionado ainda</p>
            </div>
          ) : (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                    {pieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-2 flex-1">
                {pieData.map(d => (
                  <div key={d.name} className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.fill }} />
                    <span className="text-slate-400 flex-1 truncate">{d.name}</span>
                    <span className="font-semibold text-slate-200 tabular-nums">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Daily contacts line chart */}
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

      {/* Bottom row: situation + proposal value */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Situation breakdown */}
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

        {/* Proposal + Sales summary */}
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
