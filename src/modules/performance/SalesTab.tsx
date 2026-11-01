/**
 * SalesTab — performance de vendas com gráficos reais.
 * Migrado do antigo ReportsTab, mantendo apenas o que tem dados.
 */
import { useEffect, useMemo, useCallback } from 'react'
import { Grafico, barrasPorPeriodo } from '../../components/charts/Grafico'
import type { CoresGrafico } from '../../components/charts/Grafico'
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
                  className={`h-full rounded-full transition-all duration-500 ${isBest ? 'bg-brand-fill' : isCurrentMonth ? 'bg-brand-fill/60' : 'bg-brand-fill/30'}`}
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

  useEffect(() => { loadSales() }, [loadSales])

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

  const compacto = useCallback((v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1).replace('.', ',')} mi` : v >= 1_000 ? `${Math.round(v / 1_000)} mil` : String(v), [])
  const opcaoVgv = useCallback((t: CoresGrafico) =>
    barrasPorPeriodo(t, monthlySales.map(m => m.name), monthlySales.map(m => m.valor),
      { nome: 'VGV', formatar: formatCurrency, formatarEixo: compacto }), [monthlySales, compacto])
  const opcaoQtd = useCallback((t: CoresGrafico) =>
    barrasPorPeriodo(t, monthlySales.map(m => m.name), monthlySales.map(m => m.qtd),
      { nome: 'Vendas', cor: t.sucesso }), [monthlySales])

  return (
    <div className="flex flex-col gap-8">

      {/* Seletor de período */}
      <div className="flex items-center justify-between">
        <h2 className="font-label text-[11px] font-bold uppercase tracking-[0.14em] text-t4">Performance de Vendas — {periodLabel}</h2>
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
          <Grafico altura={240} opcao={opcaoVgv}
            rotulo={'VGV por mês. ' + monthlySales.map(m => `${m.name}: ${formatCurrency(m.valor)}`).join('; ')} />
        </Card>
      )}

      {/* Barras — quantidade + por corretor */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {monthlySales.some(m => m.qtd > 0) && (
          <Card>
            <h2 className="text-sm font-medium text-t1 mb-6">Quantidade de vendas — {periodLabel}</h2>
            <Grafico altura={210} opcao={opcaoQtd}
              rotulo={'Vendas por mês. ' + monthlySales.map(m => `${m.name}: ${m.qtd}`).join('; ')} />
          </Card>
        )}

        {/* Por corretor */}
        {byBroker.length > 0 && (
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <Users size={14} className="text-brand-text" />
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
