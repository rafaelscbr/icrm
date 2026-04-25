import { useEffect, useMemo } from 'react'
import { localDateStr } from '../../store/useDailyLogsStore'
import { usePeriodStore, matchesPeriod } from '../../store/usePeriodStore'
import { PeriodSelector } from '../../components/shared/PeriodSelector'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts'
import { Card } from '../../components/ui/Card'
import { StatCard } from '../../components/shared/StatCard'
import { useSalesStore } from '../../store/useSalesStore'
import { useContactsStore } from '../../store/useContactsStore'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { useDailyLogsStore } from '../../store/useDailyLogsStore'
import { formatCurrency } from '../../lib/formatters'
import { DAILY_TARGETS } from '../../types'
import { TrendingUp, DollarSign, Users, Building2, UserPlus, Phone, MessageSquare } from 'lucide-react'

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const PIE_COLORS = {
  opportunity:  '#22C55E',
  market_price: '#EAB308',
  above_market: '#EF4444',
}

function SalesTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#1A1D27] border border-white/10 rounded-xl px-4 py-3 shadow-xl">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-sm font-semibold text-slate-100">{formatCurrency(payload[0].value)}</p>
    </div>
  )
}

function ActivityTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#1A1D27] border border-white/10 rounded-xl px-4 py-3 shadow-xl">
      <p className="text-xs text-slate-500 mb-2">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2 text-xs">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-400">{p.name}:</span>
          <span className="font-semibold text-slate-200">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

const axisStyle = { fill: '#475569', fontSize: 11 }

export function ReportsTab() {
  const { sales,      load: loadSales      } = useSalesStore()
  const { contacts,   load: loadContacts   } = useContactsStore()
  const { properties, load: loadProperties } = usePropertiesStore()
  const { logs,       load: loadLogs       } = useDailyLogsStore()
  const { mode, year, month, getLabel } = usePeriodStore()

  useEffect(() => {
    loadSales(); loadContacts(); loadProperties(); loadLogs()
  }, [loadSales, loadContacts, loadProperties, loadLogs])

  // ── Sales charts ─────────────────────────────────────────────────────────
  const monthlySales = useMemo(() => {
    if (mode === 'year') {
      // Mostra os 12 meses do ano selecionado
      return Array.from({ length: 12 }, (_, i) => {
        const items = sales.filter(s => {
          const parts = s.date.split('-')
          return Number(parts[0]) === year && Number(parts[1]) === i + 1
        })
        return { name: MONTH_NAMES[i], valor: items.reduce((acc, s) => acc + s.value, 0), qtd: items.length }
      })
    }
    // month ou all: últimos 6 meses a partir do mês/ano selecionado (ou atual no modo all)
    const refYear  = mode === 'all' ? new Date().getFullYear() : year
    const refMonth = mode === 'all' ? new Date().getMonth()    : month
    return Array.from({ length: 6 }, (_, i) => {
      const d   = new Date(refYear, refMonth - (5 - i), 1)
      const m   = d.getMonth()
      const y   = d.getFullYear()
      const items = sales.filter(s => {
        const sd = new Date(s.date)
        return sd.getMonth() === m && sd.getFullYear() === y
      })
      return { name: MONTH_NAMES[m], valor: items.reduce((acc, s) => acc + s.value, 0), qtd: items.length }
    })
  }, [sales, mode, year, month])

  const propByStatus = useMemo(() => [
    { name: 'Oportunidade',     value: properties.filter(p => p.status === 'opportunity').length,   color: PIE_COLORS.opportunity   },
    { name: 'Preço de mercado', value: properties.filter(p => p.status === 'market_price').length,  color: PIE_COLORS.market_price  },
    { name: 'Acima do mercado', value: properties.filter(p => p.status === 'above_market').length,  color: PIE_COLORS.above_market  },
  ].filter(d => d.value > 0), [properties])

  const salesByType = useMemo(() => [
    { name: 'Pronto', value: sales.filter(s => s.type === 'ready').reduce((a, s) => a + s.value, 0),    color: '#6366F1' },
    { name: 'Planta', value: sales.filter(s => s.type === 'off_plan').reduce((a, s) => a + s.value, 0), color: '#A855F7' },
  ], [sales])

  const avgTicket = sales.length > 0 ? sales.reduce((a, s) => a + s.value, 0) / sales.length : 0

  // ── Productivity charts ───────────────────────────────────────────────────
  const activityChart = useMemo(() => {
    const result: { date: string; Leads: number; Ligações: number }[] = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      // Usa data LOCAL (não UTC) para bater com os logs gravados pelo dispositivo
      const dateStr = localDateStr(d)
      const log     = logs.find(l => l.date === dateStr)
      result.push({
        date:     `${d.getDate()}/${d.getMonth() + 1}`,
        Leads:    log?.newLeads   ?? 0,
        Ligações: log?.ownerCalls ?? 0,
      })
    }
    return result
  }, [logs])

  // ── Logs filtrados pelo período ───────────────────────────────────────────
  const periodLabel = getLabel()
  const pad = (n: number) => String(n).padStart(2, '0')

  // Intervalo de datas para mês, ano ou geral
  const periodStart = mode === 'all' ? '0000-01-01'
    : mode === 'year' ? `${year}-01-01`
    : `${year}-${pad(month + 1)}-01`
  const periodEnd = mode === 'all' ? '9999-12-31'
    : mode === 'year' ? `${year}-12-31`
    : localDateStr(new Date(year, month + 1, 0))

  const periodLogs  = logs.filter(l => l.date >= periodStart && l.date <= periodEnd)
  const monthLeads  = periodLogs.reduce((a, l) => a + l.newLeads, 0)
  const monthCalls  = periodLogs.reduce((a, l) => a + l.ownerCalls, 0)
  const monthFunnel = periodLogs.filter(l => l.funnelFollowup).length
  const monthDays   = periodLogs.filter(l => l.closed).length

  // Targets — calculados para o intervalo do período
  function countDayTypes(start: string, end: string, weekdays: number[]): number {
    let count = 0
    const d = new Date(start + 'T12:00:00')
    const e = new Date(end   + 'T12:00:00')
    while (d <= e) {
      if (weekdays.includes(d.getDay())) count++
      d.setDate(d.getDate() + 1)
    }
    return count
  }
  const showTargets     = mode !== 'all'
  const totalDays       = showTargets ? countDayTypes(periodStart, periodEnd, [0,1,2,3,4,5,6]) : 0
  const weekdaysCount   = showTargets ? countDayTypes(periodStart, periodEnd, [1,2,3,4,5])     : 0
  const monSatCount     = showTargets ? countDayTypes(periodStart, periodEnd, [1,2,3,4,5,6])   : 0
  const targetLeads     = totalDays   * DAILY_TARGETS.newLeads
  const targetCalls     = weekdaysCount * DAILY_TARGETS.ownerCalls
  const targetFunnel    = monSatCount

  // Sales do período selecionado
  const periodSales = useMemo(
    () => sales.filter(s => matchesPeriod(s.date, mode, year, month)),
    [sales, mode, year, month]
  )

  return (
    <div className="flex flex-col gap-8">

      {/* ── Productivity this month ─────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Produtividade — {periodLabel}
          </h2>
          <PeriodSelector />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard
            label="Leads gerados"
            value={monthLeads}
            sub={showTargets ? `meta ${targetLeads} (${totalDays} dias)` : 'total acumulado'}
            icon={<UserPlus size={18} />}
            accent="indigo"
          />
          <StatCard
            label="Ligações propr."
            value={monthCalls}
            sub={showTargets ? `meta ${targetCalls} (seg–sex)` : 'total acumulado'}
            icon={<Phone size={18} />}
            accent="blue"
          />
          <StatCard
            label="Funil feito"
            value={`${monthFunnel}d`}
            sub={showTargets ? `meta ${targetFunnel} dias (seg–sáb)` : 'total acumulado'}
            icon={<MessageSquare size={18} />}
            accent="green"
          />
          <StatCard
            label="Dias fechados"
            value={monthDays}
            sub={showTargets ? `de ${totalDays} dias no período` : 'total acumulado'}
            icon={<TrendingUp size={18} />}
            accent="purple"
          />
        </div>

        {/* Activity bar chart */}
        <Card>
          <h2 className="text-sm font-medium text-slate-300 mb-6">
            Atividade diária — últimos 14 dias
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={activityChart} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={axisStyle} axisLine={false} tickLine={false} interval={1} />
              <YAxis tick={axisStyle} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<ActivityTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 11, color: '#64748b', paddingTop: 12 }}
              />
              <Bar dataKey="Leads"    fill="#6366F1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Ligações" fill="#06B6D4" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </section>

      {/* ── Sales performance ───────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
          Performance de Vendas
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard
            label="Ticket médio"
            value={formatCurrency(avgTicket)}
            sub="por venda"
            icon={<DollarSign size={18} />}
            accent="green"
          />
          <StatCard
            label={`Vendas — ${periodLabel}`}
            value={periodSales.length}
            sub={formatCurrency(periodSales.reduce((a, s) => a + s.value, 0))}
            icon={<TrendingUp size={18} />}
            accent="indigo"
          />
          <StatCard
            label="Total contatos"
            value={contacts.length}
            sub={`${contacts.filter(c => c.tags.includes('investor')).length} investidores`}
            icon={<Users size={18} />}
            accent="purple"
          />
          <StatCard
            label="Portfólio"
            value={properties.length}
            sub={`${properties.filter(p => p.status === 'opportunity').length} oportunidades`}
            icon={<Building2 size={18} />}
            accent="blue"
          />
        </div>

        <Card className="mb-6">
          <h2 className="text-sm font-medium text-slate-300 mb-6">
            Volume de vendas — {mode === 'year' ? `Jan–Dez ${year}` : 'últimos 6 meses'}
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={monthlySales} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366F1" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#6366F1" stopOpacity={0}    />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => formatCurrency(v)} tick={axisStyle} axisLine={false} tickLine={false} width={70} />
              <Tooltip content={<SalesTooltip />} />
              <Area type="monotone" dataKey="valor" stroke="#6366F1" strokeWidth={2}
                fill="url(#areaGrad)" dot={{ fill: '#6366F1', r: 3 }} activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <h2 className="text-sm font-medium text-slate-300 mb-6">
              Quantidade de vendas — {mode === 'year' ? `Jan–Dez ${year}` : 'últimos 6 meses'}
            </h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlySales} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: '#1A1D27', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }}
                  labelStyle={{ color: '#94a3b8', fontSize: 11 }}
                  itemStyle={{ color: '#a5b4fc' }}
                />
                <Bar dataKey="qtd" fill="#6366F1" radius={[6, 6, 0, 0]} name="Vendas" />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <h2 className="text-sm font-medium text-slate-300 mb-6">Portfólio por status</h2>
            {propByStatus.length === 0 ? (
              <div className="flex items-center justify-center h-48">
                <p className="text-sm text-slate-600">Sem imóveis cadastrados</p>
              </div>
            ) : (
              <div className="flex items-center gap-8">
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie data={propByStatus} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                      {propByStatus.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-3 flex-1">
                  {propByStatus.map(d => (
                    <div key={d.name} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
                      <span className="text-xs text-slate-400 flex-1">{d.name}</span>
                      <span className="text-xs font-semibold text-slate-200">{d.value}</span>
                    </div>
                  ))}
                  <div className="border-t border-white/8 pt-3 mt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Planta</span>
                      <span className="text-xs font-semibold text-purple-400">{formatCurrency(salesByType[1]?.value ?? 0)}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-slate-500">Pronto</span>
                      <span className="text-xs font-semibold text-indigo-400">{formatCurrency(salesByType[0]?.value ?? 0)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      </section>
    </div>
  )
}
