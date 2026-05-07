import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LabelList,
} from 'recharts'
import { ArrowLeft, TrendingUp, Users, DollarSign, BarChart3 } from 'lucide-react'
import { useLeadsStore } from '../../store/useLeadsStore'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { formatCurrency } from '../../lib/formatters'
import { LeadFunnelStage } from '../../types'

const ORIGIN_CONFIG = {
  felicita:  { label: 'Felicità',  color: '#f43f5e', emoji: '✨' },
  meta_ads:  { label: 'Meta ADS',  color: '#3b82f6', emoji: '📱' },
  portal:    { label: 'Portal',    color: '#06b6d4', emoji: '🌐' },
  offline:   { label: 'Offline',   color: '#f59e0b', emoji: '🤝' },
}

const STAGE_CONFIG: Record<LeadFunnelStage, { label: string; color: string }> = {
  lead:        { label: 'Leads',       color: '#64748b' },
  followup:    { label: 'Followup',    color: '#3b82f6' },
  atendimento: { label: 'Atendimento', color: '#8b5cf6' },
  visita:      { label: 'Visita',      color: '#f59e0b' },
  proposta:    { label: 'Proposta',    color: '#f97316' },
  venda:       { label: 'Venda',       color: '#22c55e' },
}

const STAGES: LeadFunnelStage[] = ['lead', 'followup', 'atendimento', 'visita', 'proposta', 'venda']

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#1E2130] border border-white/10 rounded-xl px-3 py-2 shadow-xl">
      <p className="text-xs font-semibold text-slate-200 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-xs" style={{ color: p.color ?? p.fill }}>
          {p.value} leads
        </p>
      ))}
    </div>
  )
}


const PIE_COLORS = ['#f43f5e', '#3b82f6', '#06b6d4', '#f59e0b']

export function LeadsReports() {
  const { leads } = useLeadsStore()
  const { properties } = usePropertiesStore()

  const active = leads.filter(l => !l.discardReason)
  const discarded = leads.filter(l => !!l.discardReason)

  // KPIs
  const totalLeads = leads.length
  const totalActive = active.length
  const converted = leads.filter(l => l.contactId).length
  const conversionRate = totalLeads > 0 ? ((leads.filter(l => l.funnelStage === 'venda').length / totalLeads) * 100).toFixed(1) : '0'

  // Origem
  const byOrigin = useMemo(() => {
    const map: Record<string, number> = {}
    active.forEach(l => { map[l.origin] = (map[l.origin] ?? 0) + 1 })
    return Object.entries(map).map(([key, value]) => ({
      name: ORIGIN_CONFIG[key as keyof typeof ORIGIN_CONFIG]?.label ?? key,
      value,
      color: ORIGIN_CONFIG[key as keyof typeof ORIGIN_CONFIG]?.color ?? '#64748b',
      emoji: ORIGIN_CONFIG[key as keyof typeof ORIGIN_CONFIG]?.emoji ?? '',
    })).sort((a, b) => b.value - a.value)
  }, [active])

  const topOrigin = byOrigin[0]

  // Produto / Imóvel
  const byProperty = useMemo(() => {
    const map: Record<string, { count: number; ticket: number; name: string }> = {}
    active.forEach(l => {
      if (l.propertyId) {
        const p = properties.find(p => p.id === l.propertyId)
        if (p) {
          if (!map[l.propertyId]) map[l.propertyId] = { count: 0, ticket: p.value, name: p.name }
          map[l.propertyId].count++
        }
      } else {
        const key = l.averageTicket ? `ticket_${l.averageTicket}` : 'sem_produto'
        if (!map[key]) map[key] = { count: 0, ticket: l.averageTicket ?? 0, name: 'Sem produto' }
        map[key].count++
      }
    })
    return Object.values(map)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
  }, [active, properties])

  const topProperty = byProperty[0]

  // Funil
  const funnelData = useMemo(() => {
    const all = [...active, ...discarded]
    return STAGES.map((stage, i) => {
      const count = all.filter(l => {
        const stageIndex = STAGES.indexOf(l.funnelStage)
        return stageIndex >= i
      }).length
      const prev = i === 0 ? count : all.filter(l => {
        const stageIndex = STAGES.indexOf(l.funnelStage)
        return stageIndex >= i - 1
      }).length
      const rate = prev > 0 ? ((count / prev) * 100).toFixed(0) : '100'
      return { stage, label: STAGE_CONFIG[stage].label, count, color: STAGE_CONFIG[stage].color, rate: Number(rate) }
    })
  }, [active, discarded])

  // Descarte por motivo
  const byDiscard = useMemo(() => {
    const LABELS: Record<string, string> = {
      sem_condicao:       'Sem condição',
      fora_de_nicho:      'Fora do nicho',
      parou_de_responder: 'Parou de responder',
      nunca_respondeu:    'Nunca respondeu',
      telefone_invalido:  'Tel. inválido',
    }
    const map: Record<string, number> = {}
    discarded.forEach(l => {
      if (l.discardReason) {
        map[l.discardReason] = (map[l.discardReason] ?? 0) + 1
      }
    })
    return Object.entries(map).map(([key, value]) => ({
      name: LABELS[key] ?? key,
      value,
    })).sort((a, b) => b.value - a.value)
  }, [discarded])

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          to="/leads"
          className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 border border-white/8 text-slate-400 hover:text-slate-200 transition-all"
        >
          <ArrowLeft size={15} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-100">Relatório de Leads</h1>
          <p className="text-sm text-slate-500">Análise de performance do funil de vendas</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-violet-500/10 border border-violet-500/20 rounded-xl">
          <BarChart3 size={13} className="text-violet-400" />
          <span className="text-xs font-medium text-violet-300">{totalLeads} leads totais</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total de Leads', value: totalLeads, icon: Users, color: 'violet', sub: `${totalActive} ativos` },
          { label: 'Taxa de Venda', value: `${conversionRate}%`, icon: TrendingUp, color: 'green', sub: `${leads.filter(l => l.funnelStage === 'venda').length} vendas` },
          { label: 'Convertidos', value: converted, icon: Users, color: 'blue', sub: 'leads → contatos' },
          { label: 'Descartados', value: discarded.length, icon: Users, color: 'red', sub: `${totalLeads > 0 ? ((discarded.length / totalLeads) * 100).toFixed(0) : 0}% do total` },
        ].map(kpi => (
          <div key={kpi.label} className="bg-[#1A1D27] border border-white/8 rounded-2xl p-4">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-3 bg-${kpi.color}-500/15`}>
              <kpi.icon size={16} className={`text-${kpi.color}-400`} />
            </div>
            <p className="text-2xl font-bold text-slate-100">{kpi.value}</p>
            <p className="text-xs font-medium text-slate-400 mt-0.5">{kpi.label}</p>
            <p className="text-[11px] text-slate-600 mt-0.5">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Funil de conversão */}
      <div className="bg-[#1A1D27] border border-white/8 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-slate-200 mb-4">Funil de Conversão</h2>
        <div className="space-y-2">
          {funnelData.map((item, i) => {
            const maxCount = funnelData[0]?.count || 1
            const width = `${Math.max((item.count / maxCount) * 100, 4)}%`
            return (
              <div key={item.stage} className="flex items-center gap-3">
                <div className="w-24 text-right">
                  <span className="text-xs font-medium text-slate-400">{item.label}</span>
                </div>
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1 h-8 bg-white/5 rounded-lg overflow-hidden relative">
                    <div
                      className="h-full rounded-lg transition-all duration-500 flex items-center justify-end pr-2"
                      style={{ width, backgroundColor: item.color + '40', borderRight: `2px solid ${item.color}` }}
                    >
                      <span className="text-xs font-bold text-white">{item.count}</span>
                    </div>
                  </div>
                  {i > 0 && (
                    <span className={`text-xs font-semibold w-10 text-right ${item.rate >= 50 ? 'text-green-400' : item.rate >= 25 ? 'text-amber-400' : 'text-red-400'}`}>
                      {item.rate}%
                    </span>
                  )}
                  {i === 0 && <span className="w-10" />}
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-[11px] text-slate-600 mt-3">* % indica conversão em relação à etapa anterior</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Origem */}
        <div className="bg-[#1A1D27] border border-white/8 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-200">Principal Origem</h2>
            {topOrigin && (
              <span className="text-xs font-medium px-2 py-1 rounded-lg bg-white/5 text-slate-400">
                🏆 {topOrigin.emoji} {topOrigin.name}
              </span>
            )}
          </div>
          {byOrigin.length === 0 ? (
            <p className="text-xs text-slate-600 text-center py-8">Sem dados</p>
          ) : (
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0">
                <PieChart width={140} height={140}>
                  <Pie data={byOrigin} cx={65} cy={65} innerRadius={35} outerRadius={60} paddingAngle={3} dataKey="value">
                    {byOrigin.map((_entry, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </div>
              <div className="flex-1 space-y-2">
                {byOrigin.map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-xs text-slate-400 truncate">{item.emoji} {item.name}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs font-semibold text-slate-200">{item.value}</span>
                      <span className="text-[10px] text-slate-600">
                        {totalActive > 0 ? `${((item.value / totalActive) * 100).toFixed(0)}%` : '0%'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Produto */}
        <div className="bg-[#1A1D27] border border-white/8 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-200">Principal Produto</h2>
            {topProperty && (
              <span className="text-xs font-medium px-2 py-1 rounded-lg bg-white/5 text-slate-400 max-w-[140px] truncate">
                🏆 {topProperty.name}
              </span>
            )}
          </div>
          {byProperty.length === 0 ? (
            <p className="text-xs text-slate-600 text-center py-8">Sem dados</p>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={byProperty} layout="vertical" margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]}>
                  <LabelList dataKey="count" position="right" style={{ fontSize: 11, fill: '#94a3b8' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Descarte por motivo */}
      {byDiscard.length > 0 && (
        <div className="bg-[#1A1D27] border border-white/8 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-slate-200 mb-4">Motivos de Descarte</h2>
          <div className="space-y-2">
            {byDiscard.map(item => {
              const pct = discarded.length > 0 ? (item.value / discarded.length) * 100 : 0
              return (
                <div key={item.name} className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 w-36 flex-shrink-0">{item.name}</span>
                  <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-500/60 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-slate-400 w-8 text-right">{item.value}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* VGV potencial */}
      {active.some(l => l.averageTicket) && (
        <div className="bg-gradient-to-r from-violet-500/10 to-purple-500/5 border border-violet-500/20 rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center flex-shrink-0">
              <DollarSign size={18} className="text-violet-400" />
            </div>
            <div>
              <p className="text-xs text-violet-300 font-medium">VGV Potencial (leads ativos)</p>
              <p className="text-2xl font-bold text-violet-200">
                {formatCurrency(active.reduce((sum, l) => sum + (l.averageTicket ?? 0), 0))}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">Soma dos tickets dos {active.filter(l => l.averageTicket).length} leads com produto</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
