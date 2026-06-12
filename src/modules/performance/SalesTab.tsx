/**
 * SalesTab — performance de vendas com gráficos reais.
 * Migrado do antigo ReportsTab, mantendo apenas o que tem dados.
 */
import { useEffect, useMemo } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Sun, DollarSign, TrendingUp, Users } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { StatCard } from '../../components/shared/StatCard'
import { PeriodSelector } from '../../components/shared/PeriodSelector'
import { useSalesStore } from '../../store/useSalesStore'
import { usePeriodStore, matchesPeriod } from '../../store/usePeriodStore'
import { formatCurrency, formatCurrencyFull } from '../../lib/formatters'
import { Sale, calcSaleCommissions } from '../../types'

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const MONTH_FULL  = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const axisStyle   = { fill: '#6B748A', fontSize: 11 }

function SalesTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface border border-line rounded-xl px-4 py-3 shadow-xl">
      <p className="text-xs text-t3 mb-1">{label}</p>
      <p className="text-sm font-semibold text-t1">{formatCurrency(payload[0].value)}</p>
    </div>
  )
}

function SeasonalitySection({ sales }: { sales: Sale[] }) {
  const data = useMemo(() => {
    const map = Array.from({ length: 12 }, (_, i) => ({
      month: MONTH_NAMES[i], monthFull: MONTH_FULL[i],
      total: 0, count: 0, years: new Set<number>(),
    }))
    sales.forEach(s => {
      const [y, m] = s.date.split('-').map(Number)
      map[m - 1].total += s.value; map[m - 1].count++; map[m - 1].years.add(y)
    })
    const maxTotal = Math.max(...map.map(d => d.total), 1)
    return map.map(d => ({ ...d, avg: d.count > 0 ? d.total / d.years.size : 0, barPct: Math.round((d.total / maxTotal) * 100) }))
  }, [sales])

  const bestMonth = data.reduce((b, d) => d.total > b.total ? d : b, data[0])
  if (sales.length === 0) return null

  return (
    <Card className="mb-6">
      <div className="flex items-center gap-2 mb-5">
        <Sun size={14} className="text-brand" />
        <h2 className="text-sm font-semibold text-t1">Sazonalidade — histórico acumulado</h2>
        <span className="ml-auto text-[11px] text-brand bg-brand/10 px-2 py-0.5 rounded border border-brand/20">
          melhor mês: {bestMonth.monthFull}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {data.map((d, i) => {
          const isCurrentMonth = new Date().getMonth() === i
          const isBest = d.month === bestMonth.month && d.total > 0
          return (
            <div key={d.month} className={`flex items-center gap-3 py-1.5 px-2 rounded-lg ${isCurrentMonth ? 'bg-brand/5 border border-brand/20' : ''}`}>
              <span className={`text-xs w-8 flex-shrink-0 font-medium ${isCurrentMonth ? 'text-brand' : 'text-t4'}`}>{d.month}</span>
              <div className="flex-1 h-2 bg-s3/50 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${isBest ? 'bg-brand' : isCurrentMonth ? 'bg-brand/60' : 'bg-brand/30'}`}
                  style={{ width: `${d.barPct}%` }}
                />
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-xs tabular-nums text-t3 w-5 text-right">{d.count}</span>
                <span className={`text-xs tabular-nums font-semibold w-28 text-right ${isBest ? 'text-brand' : 'text-t2'}`}>
                  {d.total > 0 ? formatCurrency(d.total) : '—'}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

export function SalesTab() {
  const { sales, load: loadSales } = useSalesStore()
  const { startDate, endDate, getLabel } = usePeriodStore()

  useEffect(() => { loadSales() }, [])

  const periodLabel  = getLabel()
  const periodSales  = useMemo(() => sales.filter(s => matchesPeriod(s.date, startDate, endDate)), [sales, startDate, endDate])
  const avgTicket    = periodSales.length > 0 ? periodSales.reduce((a, s) => a + s.value, 0) / periodSales.length : 0
  const periodComm   = periodSales.reduce((a, s) => a + calcSaleCommissions(s).totalCommission, 0)
  const periodBroker = periodSales.reduce((a, s) => a + calcSaleCommissions(s).brokerCommission, 0)

  const monthlySales = useMemo(() => {
    const effectiveEnd   = endDate   === '9999-12-31' ? new Date() : new Date(endDate   + 'T12:00:00')
    const effectiveStart = startDate === '0000-01-01'
      ? new Date(effectiveEnd.getFullYear() - 1, effectiveEnd.getMonth() + 1, 1)
      : new Date(startDate + 'T12:00:00')
    const months: { y: number; m: number }[] = []
    const cur = new Date(effectiveStart.getFullYear(), effectiveStart.getMonth(), 1)
    const end = new Date(effectiveEnd.getFullYear(), effectiveEnd.getMonth(), 1)
    while (cur <= end && months.length < 24) {
      months.push({ y: cur.getFullYear(), m: cur.getMonth() + 1 })
      cur.setMonth(cur.getMonth() + 1)
    }
    return months.map(({ y, m }) => {
      const items = sales.filter(s => { const [sy, sm] = s.date.split('-').map(Number); return sy === y && sm === m })
      return { name: MONTH_NAMES[m - 1], valor: items.reduce((a, s) => a + s.value, 0), qtd: items.length }
    })
  }, [sales, startDate, endDate])

  // Vendas por corretor
  const byBroker = useMemo(() => {
    const map: Record<string, { name: string; count: number; revenue: number }> = {}
    periodSales.forEach(s => {
      const key = s.brokerId ?? 'unknown'
      if (!map[key]) map[key] = { name: 'Corretor', count: 0, revenue: 0 }
      map[key].count++
      map[key].revenue += s.value
    })
    return Object.entries(map).map(([id, d]) => ({ id, ...d })).sort((a, b) => b.revenue - a.revenue)
  }, [periodSales])

  return (
    <div className="flex flex-col gap-8">

      {/* Seletor de período */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-t3 uppercase tracking-wider">Performance de Vendas — {periodLabel}</h2>
        <PeriodSelector />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label={`Vendas — ${periodLabel}`}      value={periodSales.length}           sub={formatCurrency(periodSales.reduce((a,s) => a+s.value, 0))} icon={<TrendingUp size={18}/>}  accent="indigo" />
        <StatCard label="Ticket médio"                    value={formatCurrency(avgTicket)}      sub="por venda"                      icon={<DollarSign size={18}/>}  accent="green"  />
        <StatCard label={`Comissão gerada — ${periodLabel}`} value={formatCurrencyFull(periodComm)} sub="total das comissões"       icon={<DollarSign size={18}/>}  accent="purple" />
        <StatCard label={`Sua comissão — ${periodLabel}`} value={formatCurrencyFull(periodBroker)} sub="sua parte"                  icon={<TrendingUp size={18}/>}  accent="green"  />
      </div>

      {/* Gráfico área — volume */}
      {monthlySales.some(m => m.valor > 0) && (
        <Card>
          <h2 className="text-sm font-medium text-t1 mb-6">Volume de vendas — {periodLabel}</h2>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={monthlySales} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#E4B23C" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#E4B23C" stopOpacity={0}    />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => formatCurrency(v)} tick={axisStyle} axisLine={false} tickLine={false} width={80} />
              <Tooltip content={<SalesTooltip />} />
              <Area type="monotone" dataKey="valor" stroke="#E4B23C" strokeWidth={2}
                fill="url(#salesGrad)" dot={{ fill: '#E4B23C', r: 3 }} activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Barras — quantidade + por corretor */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {monthlySales.some(m => m.qtd > 0) && (
          <Card>
            <h2 className="text-sm font-medium text-t1 mb-6">Quantidade de vendas — {periodLabel}</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlySales} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12 }}
                  labelStyle={{ color: 'var(--t3)', fontSize: 11 }}
                  itemStyle={{ color: '#E4B23C' }}
                />
                <Bar dataKey="qtd" fill="#E4B23C" radius={[6, 6, 0, 0]} name="Vendas" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Por corretor */}
        {byBroker.length > 0 && (
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <Users size={14} className="text-violet-400" />
              <h2 className="text-sm font-medium text-t1">Vendas por corretor — {periodLabel}</h2>
            </div>
            <div className="flex flex-col gap-3">
              {byBroker.map((b) => (
                <div key={b.id} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-brand/20 flex items-center justify-center text-[11px] font-bold text-brand flex-shrink-0">
                    {b.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-t2 truncate">{b.name}</span>
                      <span className="text-xs font-bold text-t1 tabular-nums ml-2">{b.count} venda{b.count !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="h-1.5 bg-s3/50 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand/60 rounded-full transition-all"
                        style={{ width: `${byBroker[0].count > 0 ? (b.count / byBroker[0].count) * 100 : 0}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-t4 mt-0.5">{formatCurrencyFull(b.revenue)}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Sazonalidade */}
      <SeasonalitySection sales={sales} />

      {sales.length === 0 && (
        <div className="flex flex-col items-center py-16 gap-3">
          <DollarSign size={32} className="text-t4" />
          <p className="text-sm text-t3">Nenhuma venda registrada ainda</p>
        </div>
      )}
    </div>
  )
}
