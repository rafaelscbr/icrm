import { useMemo } from 'react'
import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList,
} from 'recharts'
import {
  Users, TrendingUp, DollarSign, Target, AlertCircle, UserCheck,
  Zap, BarChart3, Building2,
} from 'lucide-react'
import { Lead, LeadFunnelStage } from '../../types'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { formatCurrencyFull } from '../../lib/formatters'
import { STAGE_CONFIG } from './LeadKanban'

const ORIGIN_CONFIG = {
  felicita: { label: 'Felicità',  color: '#f43f5e', emoji: '✨', colorClass: 'text-rose-400',  bgClass: 'bg-rose-500/15',  borderClass: 'border-rose-500/25'  },
  meta_ads: { label: 'Meta ADS',  color: '#3b82f6', emoji: '📱', colorClass: 'text-blue-400',  bgClass: 'bg-blue-500/15',  borderClass: 'border-blue-500/25'  },
  portal:   { label: 'Portal',    color: '#06b6d4', emoji: '🌐', colorClass: 'text-cyan-400',  bgClass: 'bg-cyan-500/15',  borderClass: 'border-cyan-500/25'  },
  offline:  { label: 'Offline',   color: '#f59e0b', emoji: '🤝', colorClass: 'text-amber-400', bgClass: 'bg-amber-500/15', borderClass: 'border-amber-500/25' },
}

const STAGES: LeadFunnelStage[] = ['lead', 'followup', 'atendimento', 'visita', 'proposta', 'venda']

const DISCARD_LABELS: Record<string, string> = {
  sem_condicao:       'Sem condição',
  fora_de_nicho:      'Fora do nicho',
  parou_de_responder: 'Parou de responder',
  nunca_respondeu:    'Nunca respondeu',
  telefone_invalido:  'Tel. inválido',
}

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

interface Props {
  leads: Lead[]
  onOpenLead: (lead: Lead) => void
}

export function LeadsDashboard({ leads, onOpenLead }: Props) {
  const { properties } = usePropertiesStore()

  const active    = leads.filter(l => !l.discardReason)
  const discarded = leads.filter(l => !!l.discardReason)

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const byStage = useMemo(() => ({
    lead:        active.filter(l => l.funnelStage === 'lead').length,
    followup:    active.filter(l => l.funnelStage === 'followup').length,
    atendimento: active.filter(l => l.funnelStage === 'atendimento').length,
    visita:      active.filter(l => l.funnelStage === 'visita').length,
    proposta:    active.filter(l => l.funnelStage === 'proposta').length,
    venda:       active.filter(l => l.funnelStage === 'venda').length,
  }), [active])

  const vgv = active.reduce((sum, l) => sum + (l.averageTicket ?? 0), 0)
  const conversionRate = leads.length > 0 ? ((byStage.venda / leads.length) * 100).toFixed(1) : '0'
  const converted = leads.filter(l => l.contactId).length

  // ── Funil de conversão ───────────────────────────────────────────────────────
  const funnelData = useMemo(() => {
    const all = [...active, ...discarded]
    return STAGES.map((stage, i) => {
      const count = all.filter(l => STAGES.indexOf(l.funnelStage) >= i).length
      const prev  = i === 0 ? count : all.filter(l => STAGES.indexOf(l.funnelStage) >= i - 1).length
      const rate  = prev > 0 ? Math.round((count / prev) * 100) : 100
      const stageConf = STAGE_CONFIG[stage]
      return { stage, label: stageConf.label, count, color: stageConf.color, rate, pct: all.length > 0 ? (count / all.length) * 100 : 0 }
    })
  }, [active, discarded])

  // ── Urgentes ─────────────────────────────────────────────────────────────────
  const urgentLeads = useMemo(() => active.filter(l =>
    l.funnelStage === 'lead' || (l.funnelStage === 'followup' && l.followupStep === 0)
  ), [active])

  // ── Por origem ────────────────────────────────────────────────────────────────
  const byOrigin = useMemo(() => {
    const map: Record<string, number> = {}
    active.forEach(l => { map[l.origin] = (map[l.origin] ?? 0) + 1 })
    return Object.entries(map).map(([key, value]) => ({
      key,
      name:   ORIGIN_CONFIG[key as keyof typeof ORIGIN_CONFIG]?.label ?? key,
      emoji:  ORIGIN_CONFIG[key as keyof typeof ORIGIN_CONFIG]?.emoji ?? '',
      color:  ORIGIN_CONFIG[key as keyof typeof ORIGIN_CONFIG]?.color ?? '#64748b',
      colorClass:  ORIGIN_CONFIG[key as keyof typeof ORIGIN_CONFIG]?.colorClass ?? 'text-slate-400',
      bgClass:     ORIGIN_CONFIG[key as keyof typeof ORIGIN_CONFIG]?.bgClass ?? 'bg-slate-500/15',
      borderClass: ORIGIN_CONFIG[key as keyof typeof ORIGIN_CONFIG]?.borderClass ?? 'border-slate-500/25',
      value,
    })).sort((a, b) => b.value - a.value)
  }, [active])

  // ── Por produto ───────────────────────────────────────────────────────────────
  const byProduct = useMemo(() => {
    const map: Record<string, { count: number; name: string; isFree: boolean }> = {}
    active.forEach(l => {
      if (l.propertyId) {
        const p = properties.find(p => p.id === l.propertyId)
        if (p) {
          if (!map[l.propertyId]) map[l.propertyId] = { count: 0, name: p.name, isFree: false }
          map[l.propertyId].count++
        }
      } else if (l.propertyName) {
        if (!map[`free_${l.propertyName}`]) map[`free_${l.propertyName}`] = { count: 0, name: l.propertyName, isFree: true }
        map[`free_${l.propertyName}`].count++
      }
    })
    return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 7)
  }, [active, properties])

  // ── Descarte ──────────────────────────────────────────────────────────────────
  const byDiscard = useMemo(() => {
    const map: Record<string, number> = {}
    discarded.forEach(l => {
      if (l.discardReason) map[l.discardReason] = (map[l.discardReason] ?? 0) + 1
    })
    return Object.entries(map).map(([key, value]) => ({
      name: DISCARD_LABELS[key] ?? key,
      value,
    })).sort((a, b) => b.value - a.value)
  }, [discarded])

  const maxStageCount = Math.max(1, ...Object.values(byStage))

  return (
    <div className="p-5 space-y-5 max-w-6xl mx-auto">

      {/* ── KPI Row ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={<Users size={16} className="text-violet-300" />}
          iconBg="bg-violet-500/20"
          gradient="from-violet-500/15 to-purple-500/8"
          border="border-violet-500/20"
          value={active.length}
          label="Leads ativos"
          sub={`${leads.length} total · ${discarded.length} desc.`}
          valueColor="text-violet-200"
        />
        <KpiCard
          icon={<Zap size={16} className="text-blue-300" />}
          iconBg="bg-blue-500/20"
          gradient="from-blue-500/15 to-sky-500/8"
          border="border-blue-500/20"
          value={byStage.followup}
          label="Em followup"
          sub={`${byStage.atendimento} em atendimento`}
          valueColor="text-blue-200"
        />
        <KpiCard
          icon={<TrendingUp size={16} className="text-green-300" />}
          iconBg="bg-green-500/20"
          gradient="from-green-500/15 to-emerald-500/8"
          border="border-green-500/20"
          value={byStage.venda}
          label="Vendas realizadas"
          sub={`${conversionRate}% conversão · ${converted} no CRM`}
          valueColor="text-green-200"
        />
        <KpiCard
          icon={<DollarSign size={16} className="text-amber-300" />}
          iconBg="bg-amber-500/20"
          gradient="from-amber-500/15 to-orange-500/8"
          border="border-amber-500/20"
          value={vgv > 0 ? formatCurrencyFull(vgv) : '—'}
          label="VGV potencial"
          sub={`${active.filter(l => l.averageTicket).length} leads com ticket`}
          valueColor="text-amber-200"
          smallValue={vgv > 0}
        />
      </div>

      {/* ── Funil + Urgentes ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Funil de conversão */}
        <div className="lg:col-span-3 bg-[#1A1D27] border border-white/8 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-violet-500/15 flex items-center justify-center flex-shrink-0">
              <Target size={13} className="text-violet-400" />
            </div>
            <p className="text-sm font-semibold text-slate-200">Funil de Conversão</p>
            <span className="ml-auto text-[11px] text-slate-500">* % = conv. da etapa anterior</span>
          </div>
          <div className="space-y-2">
            {funnelData.map((item, i) => {
              const maxCount = funnelData[0]?.count || 1
              const barWidth = Math.max((item.count / maxCount) * 100, item.count > 0 ? 4 : 0)
              return (
                <div key={item.stage} className="flex items-center gap-3">
                  <span className="text-xs font-medium text-slate-400 w-24 text-right flex-shrink-0">{item.label}</span>
                  <div className="flex-1 h-7 bg-white/4 rounded-lg overflow-hidden relative">
                    <div
                      className="h-full rounded-lg transition-all duration-700 flex items-center justify-end pr-2.5"
                      style={{
                        width: `${barWidth}%`,
                        backgroundColor: item.color + '30',
                        borderRight: `2px solid ${item.color}80`,
                      }}
                    />
                    <span
                      className="absolute inset-0 flex items-center pl-3 text-xs font-bold"
                      style={{ color: item.color }}
                    >
                      {item.count}
                    </span>
                  </div>
                  {i > 0 ? (
                    <span className={`text-xs font-bold w-10 text-right flex-shrink-0 ${item.rate >= 50 ? 'text-green-400' : item.rate >= 25 ? 'text-amber-400' : 'text-red-400'}`}>
                      {item.rate}%
                    </span>
                  ) : (
                    <span className="w-10 flex-shrink-0" />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Precisam de ação */}
        <div className="lg:col-span-2 bg-[#1A1D27] border border-white/8 rounded-2xl p-5 flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0">
              <AlertCircle size={13} className="text-amber-400" />
            </div>
            <p className="text-sm font-semibold text-slate-200">Precisam de ação</p>
            {urgentLeads.length > 0 && (
              <span className="ml-auto text-[10px] font-bold px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded-full border border-amber-500/30">
                {urgentLeads.length}
              </span>
            )}
          </div>

          {urgentLeads.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 py-4">
              <div className="w-10 h-10 rounded-full bg-green-500/15 flex items-center justify-center">
                <UserCheck size={18} className="text-green-400" />
              </div>
              <p className="text-xs text-slate-500 text-center">Todos os leads estão sendo atendidos!</p>
            </div>
          ) : (
            <div className="flex-1 space-y-1.5 overflow-y-auto max-h-52">
              {urgentLeads.map(lead => (
                <button
                  key={lead.id}
                  onClick={() => onOpenLead(lead)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 bg-white/3 hover:bg-amber-500/8 border border-white/5 hover:border-amber-500/20 rounded-xl transition-all text-left group"
                >
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500/30 to-purple-500/20 flex items-center justify-center text-xs font-bold text-violet-200 flex-shrink-0">
                    {lead.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-200 truncate">{lead.name}</p>
                    <p className="text-[10px] text-slate-500">{lead.funnelStage === 'lead' ? '1º contato pendente' : 'Followup pendente'}</p>
                  </div>
                  <AlertCircle size={12} className="text-amber-400/60 group-hover:text-amber-400 flex-shrink-0 transition-colors" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Distribuição por etapa (mini cards) ───────────────────────────────── */}
      <div className="bg-[#1A1D27] border border-white/8 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
            <BarChart3 size={13} className="text-indigo-400" />
          </div>
          <p className="text-sm font-semibold text-slate-200">Distribuição por Etapa</p>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {(Object.entries(byStage) as [LeadFunnelStage, number][]).map(([stage, count]) => {
            const conf = STAGE_CONFIG[stage]
            const pct  = maxStageCount > 0 ? Math.round((count / maxStageCount) * 100) : 0
            return (
              <div key={stage} className={`rounded-xl p-3 border text-center ${conf.bg} ${conf.border}`}>
                <p className={`text-2xl font-bold ${conf.color}`}>{count}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{conf.label}</p>
                <div className="mt-2 h-1 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${conf.headerBg}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Origem + Produto ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Por origem */}
        <div className="bg-[#1A1D27] border border-white/8 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-rose-500/15 flex items-center justify-center flex-shrink-0">
              <Target size={13} className="text-rose-400" />
            </div>
            <p className="text-sm font-semibold text-slate-200">Por Origem</p>
            {byOrigin[0] && (
              <span className="ml-auto text-[11px] px-2 py-0.5 rounded-lg bg-white/5 text-slate-400 flex items-center gap-1">
                🏆 {byOrigin[0].emoji} {byOrigin[0].name}
              </span>
            )}
          </div>
          {byOrigin.length === 0 ? (
            <p className="text-xs text-slate-600 text-center py-8">Sem dados</p>
          ) : (
            <div className="flex items-center gap-5">
              <div className="flex-shrink-0">
                <PieChart width={120} height={120}>
                  <Pie data={byOrigin} cx={55} cy={55} innerRadius={28} outerRadius={52} paddingAngle={3} dataKey="value">
                    {byOrigin.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </div>
              <div className="flex-1 space-y-2.5">
                {byOrigin.map(item => (
                  <div key={item.key} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                    <span className={`text-xs font-medium flex-1 ${item.colorClass}`}>{item.emoji} {item.name}</span>
                    <span className="text-xs font-bold text-slate-200">{item.value}</span>
                    <span className="text-[10px] text-slate-600 w-8 text-right">
                      {active.length > 0 ? `${Math.round((item.value / active.length) * 100)}%` : '0%'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Por produto */}
        <div className="bg-[#1A1D27] border border-white/8 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
              <Building2 size={13} className="text-indigo-400" />
            </div>
            <p className="text-sm font-semibold text-slate-200">Por Produto</p>
            {byProduct[0] && (
              <span className="ml-auto text-[11px] px-2 py-0.5 rounded-lg bg-white/5 text-slate-400 max-w-[130px] truncate">
                🏆 {byProduct[0].name}
              </span>
            )}
          </div>
          {byProduct.length === 0 ? (
            <p className="text-xs text-slate-600 text-center py-8">Sem dados de produto</p>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={byProduct} layout="vertical" margin={{ left: 0, right: 24, top: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={100}
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickFormatter={v => v.length > 14 ? v.slice(0, 13) + '…' : v}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {byProduct.map((entry, i) => (
                    <Cell key={i} fill={entry.isFree ? '#f59e0b' : '#8b5cf6'} />
                  ))}
                  <LabelList dataKey="count" position="right" style={{ fontSize: 11, fill: '#94a3b8' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          {byProduct.some(p => p.isFree) && (
            <p className="text-[10px] text-amber-400/60 mt-2">🟡 Amarelo = nome livre (não cadastrado)</p>
          )}
        </div>
      </div>

      {/* ── Descarte ──────────────────────────────────────────────────────────── */}
      {byDiscard.length > 0 && (
        <div className="bg-[#1A1D27] border border-white/8 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-red-500/15 flex items-center justify-center flex-shrink-0">
              <Users size={13} className="text-red-400" />
            </div>
            <p className="text-sm font-semibold text-slate-200">Motivos de Descarte</p>
            <span className="ml-auto text-[11px] text-slate-500">{discarded.length} descartados</span>
          </div>
          <div className="space-y-2.5">
            {byDiscard.map(item => {
              const pct = discarded.length > 0 ? (item.value / discarded.length) * 100 : 0
              return (
                <div key={item.name} className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 w-40 flex-shrink-0">{item.name}</span>
                  <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-500/50 rounded-full transition-all duration-700"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-red-400 w-6 text-right">{item.value}</span>
                  <span className="text-[10px] text-slate-600 w-8 text-right">{Math.round(pct)}%</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── KPI Card component ────────────────────────────────────────────────────────

interface KpiCardProps {
  icon: React.ReactNode
  iconBg: string
  gradient: string
  border: string
  value: number | string
  label: string
  sub: string
  valueColor: string
  smallValue?: boolean
}

function KpiCard({ icon, iconBg, gradient, border, value, label, sub, valueColor, smallValue }: KpiCardProps) {
  return (
    <div className={`bg-gradient-to-br ${gradient} border ${border} rounded-2xl px-4 py-3.5 flex items-center gap-3`}>
      <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className={`font-bold leading-none ${valueColor} ${smallValue ? 'text-base' : 'text-2xl'}`}>{value}</p>
        <p className="text-[11px] text-slate-400 mt-0.5 font-medium">{label}</p>
        <p className="text-[10px] text-slate-600 mt-0.5 truncate">{sub}</p>
      </div>
    </div>
  )
}
