/**
 * BrokersTab — comparativo de performance entre corretores.
 * Dados: lead_interactions (via leads.broker_id), sales, disparo_logs.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  MessageCircle, TrendingUp, TrendingDown, Minus,
  ArrowRight, XCircle, UserPlus, Zap, DollarSign,
  BarChart2, Crown, Users,
} from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { useAuthStore } from '../../store/useAuthStore'
import { useLeadsStore } from '../../store/useLeadsStore'
import { useLeadInteractionsStore } from '../../store/useLeadInteractionsStore'
import { useSalesStore } from '../../store/useSalesStore'
import { useDisparosStore } from '../../store/useDisparosStore'
import { formatCurrency } from '../../lib/formatters'

const REAL_TYPES = new Set(['ligacao', 'whatsapp', 'email', 'visita', 'reuniao', 'nota', 'tarefa'])

/** Converte um Date para string YYYY-MM-DD no fuso local */
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type Period = 'semana' | 'mes' | 'total'

const PERIODS: { id: Period; label: string }[] = [
  { id: 'semana', label: 'Esta semana' },
  { id: 'mes',    label: 'Este mês'    },
  { id: 'total',  label: 'Histórico'   },
]

function startOf(period: Period): Date {
  const now = new Date(); now.setHours(0, 0, 0, 0)
  if (period === 'semana') {
    const dow = now.getDay(); now.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1))
  } else if (period === 'mes') {
    now.setDate(1)
  } else {
    return new Date(0)
  }
  return now
}

function Delta({ curr, prev }: { curr: number; prev: number }) {
  const d = curr - prev
  if (prev === 0 && curr === 0) return <span className="text-[10px] text-t4">—</span>
  if (d === 0) return <span className="flex items-center gap-0.5 text-[10px] text-t4"><Minus size={9}/> igual</span>
  const up = d > 0
  return (
    <span className={`flex items-center gap-0.5 text-[10px] font-medium ${up ? 'text-success' : 'text-error'}`}>
      {up ? <TrendingUp size={9}/> : <TrendingDown size={9}/>}
      {up ? '+' : ''}{d}
    </span>
  )
}

interface BrokerStats {
  id: string; name: string; initial: string
  interactions: number; advances: number; discards: number
  newLeads: number; sales: number; revenue: number
  disparos: number; disparosNew: number; disparosFollowup: number
  convRate: number
}

export function BrokersTab() {
  const { allProfiles, fetchAllProfiles, isAdmin } = useAuthStore()
  const { leads: allLeads, load: loadLeads }       = useLeadsStore()
  const { byLead, loadAll, allLoaded }             = useLeadInteractionsStore()
  const { sales, load: loadSales }                 = useSalesStore()
  const { loadBrokerSummaries }                    = useDisparosStore()

  const [period, setPeriod]                 = useState<Period>('mes')
  const [disparosByBroker, setDisparos]     = useState<Record<string, { total: number; new: number; followup: number }>>({})
  const [prevDisparos, setPrevDisparos]     = useState<Record<string, number>>({})

  function buildDisparosMap(summaries: import('../../store/useDisparosStore').BrokerDisparoSummary[], p: Period) {
    const curr: Record<string, { total: number; new: number; followup: number }> = {}
    summaries.forEach(s => {
      if (p === 'semana') {
        curr[s.brokerId] = { total: s.thisWeek, new: s.thisWeekNew, followup: s.thisWeekFollowup }
      } else if (p === 'mes') {
        curr[s.brokerId] = { total: s.thisMonth, new: s.thisMonthNew, followup: s.thisMonthFollowup }
      } else {
        curr[s.brokerId] = { total: s.total, new: s.totalNew, followup: s.totalFollowup }
      }
    })
    return curr
  }

  useEffect(() => {
    if (allProfiles.length === 0) fetchAllProfiles().catch(() => {})
    loadLeads(); loadSales()
    if (!allLoaded) loadAll()
    loadBrokerSummaries().then(summaries => {
      setDisparos(buildDisparosMap(summaries, period))
      const prev: Record<string, number> = {}
      summaries.forEach(s => { prev[s.brokerId] = 0 })
      setPrevDisparos(prev)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    loadBrokerSummaries().then(summaries => {
      setDisparos(buildDisparosMap(summaries, period))
    }).catch(() => {})
  }, [period])

  const brokers = useMemo(() =>
    allProfiles.filter(p => p.role === 'broker' || (isAdmin && p.role === 'admin')),
    [allProfiles, isAdmin]
  )

  const from = useMemo(() => startOf(period), [period])
  const prevFrom = useMemo(() => {
    const f = startOf(period)
    if (period === 'total') return new Date(0)
    const diff = Date.now() - f.getTime()
    return new Date(f.getTime() - diff)
  }, [period])

  // Strings YYYY-MM-DD derivadas das datas de corte — usadas para comparação
  // de datas sem problema de timezone (leads são salvos como midnight UTC =
  // data local correta em string, mas em timestamp é 3h antes da meia-noite local).
  const fromStr    = useMemo(() => toDateStr(from),    [from])
  const prevFromStr = useMemo(() => toDateStr(prevFrom), [prevFrom])

  const allInteractions = useMemo(() => Object.values(byLead).flat(), [byLead])

  const stats = useMemo((): BrokerStats[] => {
    return brokers.map(broker => {
      const brokerLeads = allLeads.filter(l => l.brokerId === broker.id)
      // Atribui pela autoria (quem registrou a interação), não pelo dono do lead —
      // interações em leads de campanha de outro corretor contam para quem agiu.
      const brokerInts  = allInteractions.filter(i => i.brokerId === broker.id)

      // Compara apenas YYYY-MM-DD — evita offset UTC-3 excluir registros do dia correto.
      // LeadForm salva created_at como midnight UTC do dia selecionado; interactions
      // são timestamps completos mas basta o dia para a granularidade semanal/mensal.
      function inPeriod(iso: string) { return iso.substring(0, 10) >= fromStr }

      const interactions = brokerInts.filter(i => REAL_TYPES.has(i.type) && inPeriod(i.interactedAt)).length
      const advances     = brokerInts.filter(i => i.type === 'stage_change' && inPeriod(i.interactedAt)).length
      const discards     = brokerInts.filter(i => i.type === 'discard' && inPeriod(i.interactedAt)).length
      const newLeads     = brokerLeads.filter(l => inPeriod(l.createdAt)).length
      const brokerSales       = sales.filter(s => s.brokerId === broker.id && inPeriod(s.date))
      const revenue           = brokerSales.reduce((a, s) => a + s.value, 0)
      const brokerDisparos    = disparosByBroker[broker.id]
      const disparos          = brokerDisparos?.total    ?? 0
      const disparosNew       = brokerDisparos?.new      ?? 0
      const disparosFollowup  = brokerDisparos?.followup ?? 0

      const totalLeads   = brokerLeads.length
      const totalSales   = sales.filter(s => s.brokerId === broker.id).length
      const convRate     = totalLeads > 0 ? +((totalSales / totalLeads) * 100).toFixed(1) : 0

      return {
        id: broker.id, name: broker.name,
        initial: broker.name.charAt(0).toUpperCase(),
        interactions, advances, discards, newLeads,
        sales: brokerSales.length, revenue, disparos, disparosNew, disparosFollowup, convRate,
      }
    })
  }, [brokers, allLeads, allInteractions, sales, disparosByBroker, fromStr])

  const prevStats = useMemo((): Record<string, Partial<BrokerStats>> => {
    const result: Record<string, Partial<BrokerStats>> = {}
    brokers.forEach(broker => {
      if (period === 'total') { result[broker.id] = {}; return }
      const brokerInts = allInteractions.filter(i => i.brokerId === broker.id)
      const inPrevRange = (iso: string) => iso.substring(0, 10) >= prevFromStr && iso.substring(0, 10) < fromStr
      result[broker.id] = {
        interactions:    brokerInts.filter(i => REAL_TYPES.has(i.type) && inPrevRange(i.interactedAt)).length,
        advances:        brokerInts.filter(i => i.type === 'stage_change' && inPrevRange(i.interactedAt)).length,
        discards:        brokerInts.filter(i => i.type === 'discard' && inPrevRange(i.interactedAt)).length,
        disparosNew:     prevDisparos[broker.id] ?? 0,
        disparosFollowup: 0,
      }
    })
    return result
  }, [brokers, allInteractions, prevFromStr, fromStr, period, prevDisparos])

  if (brokers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Users size={32} className="text-t4" />
        <p className="text-sm text-t3">Nenhum corretor cadastrado</p>
      </div>
    )
  }

  const METRICS = (s: BrokerStats, prev: Partial<BrokerStats>) => [
    { label: 'Novos Disparos',     icon: Zap,            color: 'text-violet-400', bg: 'bg-violet-500/10', value: s.disparosNew,      prevVal: prev.disparosNew },
    { label: 'Follow-ups',         icon: BarChart2,      color: 'text-indigo-400', bg: 'bg-indigo-500/10', value: s.disparosFollowup, prevVal: prev.disparosFollowup },
    { label: 'Interações leads',   icon: MessageCircle,  color: 'text-green-400',  bg: 'bg-green-500/10',  value: s.interactions,     prevVal: prev.interactions },
    { label: 'Avanços no funil',   icon: ArrowRight,     color: 'text-brand',      bg: 'bg-brand/10',      value: s.advances,         prevVal: prev.advances },
    { label: 'Leads novos',        icon: UserPlus,       color: 'text-sky-400',    bg: 'bg-sky-500/10',    value: s.newLeads,         prevVal: undefined },
    { label: 'Descartes',          icon: XCircle,        color: 'text-error',      bg: 'bg-error-bg',      value: s.discards,         prevVal: prev.discards },
    { label: 'Vendas',             icon: TrendingUp,     color: 'text-success',    bg: 'bg-success-bg',    value: s.sales,            prevVal: undefined },
    { label: 'Receita',            icon: DollarSign,     color: 'text-success',    bg: 'bg-success-bg',    value: null, revenue: s.revenue, prevVal: undefined },
  ]

  // Ranqueamento por disparos + interações (atividade total)
  const ranked = [...stats].sort((a, b) => (b.disparos + b.interactions) - (a.disparos + a.interactions))

  return (
    <div className="flex flex-col gap-6">

      {/* Seletor de período */}
      <div className="flex items-center gap-1 p-1 rounded-xl border border-line bg-s2/40 w-fit">
        {PERIODS.map(p => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              period === p.id
                ? 'bg-brand text-[#0B0F1C]'
                : 'text-t3 hover:text-t1 hover:bg-s3/60'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Ranking geral */}
      {ranked.length > 1 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-line bg-s2/30">
          <Crown size={14} className="text-brand flex-shrink-0" />
          <p className="text-sm text-t2">
            <span className="font-bold text-t1">{ranked[0].name}</span> lidera em atividade —{' '}
            <span className="text-brand font-semibold">{ranked[0].disparos + ranked[0].interactions}</span> ações no período
          </p>
        </div>
      )}

      {/* Cards por corretor */}
      <div className={`grid gap-6 ${brokers.length > 1 ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 max-w-lg'}`}>
        {stats.map((s) => {
          const prev = prevStats[s.id] ?? {}
          const metrics = METRICS(s, prev)
          const rank = ranked.findIndex(r => r.id === s.id)
          return (
            <Card key={s.id} className="flex flex-col gap-5">
              {/* Header corretor */}
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-brand/20 flex items-center justify-center text-sm font-bold text-brand">
                    {s.initial}
                  </div>
                  {rank === 0 && ranked.length > 1 && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-brand flex items-center justify-center">
                      <Crown size={9} className="text-[#0B0F1C]" />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-t1">{s.name}</p>
                  <p className="text-[11px] text-t4">
                    Taxa conversão histórica: <span className="text-t2 font-medium">{s.convRate}%</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-t4 uppercase tracking-wider">Atividade</p>
                  <p className="text-lg font-black text-brand tabular-nums">{s.disparos + s.interactions}</p>
                </div>
              </div>

              {/* Grid de métricas */}
              <div className="grid grid-cols-3 gap-2">
                {metrics.filter(m => m.label !== 'Receita').map(m => {
                  const Icon = m.icon
                  return (
                    <div key={m.label} className="flex flex-col gap-2 p-3 rounded-xl bg-s2/50 border border-line">
                      <div className={`w-6 h-6 ${m.bg} rounded-lg flex items-center justify-center`}>
                        <Icon size={12} className={m.color} />
                      </div>
                      <p className={`text-2xl font-black tabular-nums leading-none ${m.color}`}>{m.value}</p>
                      <div className="flex flex-col gap-0.5">
                        <p className="text-[10px] text-t4 leading-tight">{m.label}</p>
                        {m.prevVal !== undefined && period !== 'total' && (
                          <Delta curr={m.value as number} prev={m.prevVal as number} />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Receita + VGV */}
              {s.revenue > 0 && (
                <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-success-bg border border-success-line">
                  <div className="flex items-center gap-2">
                    <DollarSign size={14} className="text-success" />
                    <span className="text-xs text-success font-medium">Receita no período</span>
                  </div>
                  <span className="text-sm font-bold text-success tabular-nums">{formatCurrency(s.revenue)}</span>
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {/* Pulso de atividade — últimos 14 dias (agregado) */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <BarChart2 size={14} className="text-violet-400" />
          <h2 className="text-sm font-semibold text-t1">Pulso de atividade — últimos 14 dias</h2>
          <span className="ml-auto text-[11px] text-t4">WhatsApp + ligações + emails + visitas</span>
        </div>
        {!allLoaded ? (
          <div className="flex items-center justify-center h-20 gap-2">
            <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-t4">Carregando interações…</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {stats.map(s => {
              const brokerInts = allInteractions.filter(i => {
                const lead = allLeads.find(l => l.id === i.leadId)
                return lead?.brokerId === s.id && REAL_TYPES.has(i.type)
              })
              const daily = Array.from({ length: 14 }, (_, i) => {
                const d = new Date(); d.setDate(d.getDate() - (13 - i))
                const dateStr = d.toISOString().split('T')[0]
                return { label: i === 13 ? 'Hoje' : `${d.getDate()}/${d.getMonth()+1}`, count: brokerInts.filter(x => x.interactedAt.startsWith(dateStr)).length }
              })
              const max = Math.max(1, ...daily.map(d => d.count))
              const total14 = daily.reduce((a, d) => a + d.count, 0)
              return (
                <div key={s.id}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-t2">{s.name}</span>
                    <span className="text-[11px] text-t4">{total14} interações</span>
                  </div>
                  <div className="flex items-end gap-1 h-10">
                    {daily.map((d, di) => (
                      <div key={d.label} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                        {d.count > 0 && (
                          <div className="absolute -top-4 left-1/2 -translate-x-1/2 hidden group-hover:flex bg-surface text-t1 text-[9px] px-1 py-0.5 rounded whitespace-nowrap z-10 border border-line">
                            {d.label}: {d.count}
                          </div>
                        )}
                        <div className="w-full flex items-end" style={{ height: 36 }}>
                          <div
                            className={`w-full rounded-t-sm transition-all ${di === 13 ? 'bg-brand/70' : d.count > 0 ? 'bg-violet-500/50' : 'bg-s3/40'}`}
                            style={{ height: `${Math.max((d.count / max) * 100, d.count > 0 ? 8 : 2)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

    </div>
  )
}
