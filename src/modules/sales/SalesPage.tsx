import { useEffect, useState, useMemo } from 'react'
import { TrendingUp, Pencil, Trash2, Search, BadgePercent, DollarSign } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { PageLayout } from '../../components/layout/PageLayout'
import { Card } from '../../components/ui/Card'
import { ListContainer } from '../../components/ui/ListContainer'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Avatar } from '../../components/ui/Avatar'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { PeriodSelector } from '../../components/shared/PeriodSelector'
import { SaleForm } from './SaleForm'
import { useSalesStore } from '../../store/useSalesStore'
import { useContactsStore } from '../../store/useContactsStore'
import { usePeriodStore, matchesPeriod } from '../../store/usePeriodStore'
import { useAuthStore } from '../../store/useAuthStore'
import { Sale, SaleType, calcSaleCommissions } from '../../types'
import { formatCurrency, formatCurrencyFull, formatDateShort } from '../../lib/formatters'
import toast from 'react-hot-toast'

const TYPE_CONFIG: Record<SaleType, { label: string; variant: 'indigo' | 'purple' }> = {
  ready:    { label: 'Pronto', variant: 'indigo'  },
  off_plan: { label: 'Planta', variant: 'purple'  },
}

const FILTER_OPTIONS: { value: SaleType | null; label: string }[] = [
  { value: null,       label: 'Todas'  },
  { value: 'ready',    label: 'Pronto' },
  { value: 'off_plan', label: 'Planta' },
]

export function SalesPage() {
  const { sales: allSales, load, remove } = useSalesStore()
  const { isAdmin, viewAsBrokerId, allProfiles } = useAuthStore()
  const sales = isAdmin && viewAsBrokerId ? allSales.filter(s => s.brokerId === viewAsBrokerId) : allSales
  const { contacts, loadByIds: loadContactsByIds } = useContactsStore()
  const { startDate, endDate, getLabel } = usePeriodStore()
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<SaleType | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Sale | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<Sale | undefined>()

  useEffect(() => {
    load()
    const params = new URLSearchParams(window.location.search)
    if (params.get('new') === '1') {
      setFormOpen(true)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [load])

  // Só os contatos citados nesta tela — antes era o fetchAll de 12.543 linhas
  // (~7,7 MB) para exibir algumas dezenas de nomes.
  useEffect(() => {
    const ids = sales.map(s => s.clientId).filter(Boolean)
    if (ids.length > 0) loadContactsByIds(ids)
  }, [sales]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = sales.filter(s => {
    const client = contacts.find(c => c.id === s.clientId)
    const matchQuery = !query.trim() ||
      (client?.name ?? '').toLowerCase().includes(query.toLowerCase()) ||
      s.propertyName.toLowerCase().includes(query.toLowerCase())
    const matchType   = !typeFilter || s.type === typeFilter
    const matchPeriod = matchesPeriod(s.date, startDate, endDate)
    return matchQuery && matchType && matchPeriod
  })

  // Todos os KPIs respeitam o período selecionado
  const periodLabel   = getLabel()
  const salesInPeriod = sales.filter(s => matchesPeriod(s.date, startDate, endDate))
  const valueInPeriod = salesInPeriod.reduce((acc, s) => acc + s.value, 0)
  const avgTicket     = salesInPeriod.length > 0 ? valueInPeriod / salesInPeriod.length : 0
  const periodComm    = salesInPeriod.reduce((acc, s) => acc + calcSaleCommissions(s).totalCommission, 0)
  const periodBroker  = salesInPeriod.reduce((acc, s) => acc + calcSaleCommissions(s).brokerCommission, 0)

  const monthlyData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date()
      d.setDate(1)
      d.setMonth(d.getMonth() - (11 - i))
      const year = d.getFullYear()
      const month = d.getMonth()
      const monthSales = sales.filter(s => {
        const sd = new Date(s.date + 'T00:00:00')
        return sd.getFullYear() === year && sd.getMonth() === month
      })
      return {
        month: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
        value: monthSales.reduce((a, s) => a + s.value, 0),
        count: monthSales.length,
      }
    })
  }, [sales])

  const formatAxisValue = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
    if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}k`
    return `${v}`
  }

  function handleDelete() {
    if (!deleteTarget) return
    remove(deleteTarget.id)
    toast.success('Venda excluída')
    setDeleteTarget(undefined)
  }

  return (
    <PageLayout
      title="Vendas"
      subtitle={`${salesInPeriod.length} venda${salesInPeriod.length !== 1 ? 's' : ''} · ${periodLabel}`}
      ctaLabel="Nova Venda"
      onCta={() => { setEditing(undefined); setFormOpen(true) }}
    >
      {/* Seletor de período */}
      <div className="flex items-center justify-between mb-5">
        <p className="text-xs text-t3">Todos os dados filtrados pelo período</p>
        <PeriodSelector />
      </div>

      {/* ── KPIs — com hierarquia ──────────────────────────────────────────
          Eram quatro cards idênticos: mesmo tamanho, mesmo peso, nenhum
          protagonista. VGV é o número que define o mês, então ele fica grande
          e sozinho; ticket, comissão gerada e comissão do corretor são apoio
          e ocupam o porte compacto. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-5 lg:mb-6">
        <div className="lg:col-span-1 relative overflow-hidden rounded-[16px] border border-line card-surface gold-edge p-5">
          <p className="font-label text-[11px] font-bold uppercase tracking-[0.1em] text-t3">VGV no período</p>
          <p className="font-heading text-[clamp(1.9rem,3.5vw,2.5rem)] font-black text-t1 tabular-nums leading-none tracking-[-0.03em] mt-3">
            {formatCurrency(valueInPeriod)}
          </p>
          <p className="text-xs text-t3 mt-2">
            {salesInPeriod.length} venda{salesInPeriod.length !== 1 ? 's' : ''} · ticket médio {formatCurrency(avgTicket)}
          </p>
        </div>

        <div className="lg:col-span-2 grid grid-cols-2 gap-3">
          {[
            { label: 'Comissão gerada', value: periodComm,   hint: 'negociada no período', icon: BadgePercent, tone: 'text-t1'      },
            { label: 'Sua comissão',    value: periodBroker, hint: 'sua parte no período', icon: DollarSign,   tone: 'text-success' },
          ].map(k => (
            <div key={k.label} className="rounded-[14px] border border-line card-surface p-4 flex flex-col">
              <div className="flex items-center justify-between gap-2">
                <p className="font-label text-[11px] font-bold uppercase tracking-[0.1em] text-t3 truncate">{k.label}</p>
                <span className="w-7 h-7 rounded-lg bg-s3 flex items-center justify-center flex-shrink-0">
                  <k.icon size={13} className="text-t3" />
                </span>
              </div>
              <p className={`font-heading text-[22px] font-black tabular-nums leading-none mt-3 ${k.tone}`}>
                {formatCurrency(k.value)}
              </p>
              <p className="text-[11px] text-t4 mt-2">{k.hint}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Gráfico mensal */}
      {sales.length > 0 && (
        <Card className="mb-5 lg:mb-6">
          <h2 className="text-sm font-semibold text-t2 mb-4">Evolução mensal — últimos 12 meses</h2>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={monthlyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis dataKey="month" tick={{ fill: 'var(--t4)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fill: 'var(--t4)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={formatAxisValue}
                width={42}
              />
              <Tooltip
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 14, boxShadow: 'var(--shadow-dropdown)' }}
                labelStyle={{ color: 'var(--t3)', fontSize: 11 }}
                formatter={(value: number, _name: string, props: { payload?: { count?: number } }) => [
                  `${formatCurrency(value)}  ·  ${props.payload?.count ?? 0} venda${(props.payload?.count ?? 0) !== 1 ? 's' : ''}`,
                  'VGV',
                ]}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--brand)"
                strokeWidth={2}
                dot={{ fill: 'var(--brand)', r: 3 }}
                activeDot={{ r: 5 }}
                name="VGV"
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-t3" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar por cliente ou imóvel..."
            className="w-full bg-s3/50 border border-line rounded-xl pl-9 pr-4 py-3 text-sm text-slate-100 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-brand/25 transition-all min-h-[44px]"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-0.5 sm:pb-0">
          {FILTER_OPTIONS.map(opt => (
            <button
              key={String(opt.value)}
              onClick={() => setTypeFilter(opt.value)}
              className={`
                flex-shrink-0 px-4 py-2.5 rounded-xl text-xs font-medium border transition-all duration-150 cursor-pointer min-h-[44px]
                ${typeFilter === opt.value
                  ? 'bg-brand-tint border-brand/40 text-brand-text'
                  : 'bg-s3/50 border-line text-t3 hover:text-t2'
                }
              `}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<TrendingUp size={24} />}
          title="Nenhuma venda encontrada"
          description="Registre vendas para acompanhar seu desempenho."
          ctaLabel="Nova Venda"
          onCta={() => { setEditing(undefined); setFormOpen(true) }}
        />
      ) : (
        <>
          {/* ── Mobile cards ───────────────────────────────────────────── */}
          <div className="flex flex-col gap-3 lg:hidden">
            {filtered.map(s => {
              const client = contacts.find(c => c.id === s.clientId)
              const { label, variant } = TYPE_CONFIG[s.type]
              const { totalCommission: tc, brokerCommission: bc } = calcSaleCommissions(s)
              const hasComm = tc > 0
              const n = new Date()
              const sYear = Number(s.date.split('-')[0])
              const sMonth = Number(s.date.split('-')[1]) - 1
              const isRetro = sYear < n.getFullYear() || (sYear === n.getFullYear() && sMonth < n.getMonth())
              return (
                <Card key={s.id} className="!p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar name={client?.name ?? '?'} size="sm" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-100 truncate">{client?.name ?? '—'}</p>
                        {isRetro && (
                          <span className="text-[11px] font-semibold text-amber-500/80 uppercase tracking-wide">retroativo</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => { setEditing(s); setFormOpen(true) }}
                        className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-s3/70 text-t3 hover:text-t2 transition-colors cursor-pointer"
                      ><Pencil size={15} /></button>
                      <button
                        onClick={() => setDeleteTarget(s)}
                        className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-red-500/10 text-t3 hover:text-red-400 transition-colors cursor-pointer"
                      ><Trash2 size={15} /></button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-t3 truncate flex-1 mr-2">{s.propertyName}</p>
                      <Badge variant={variant}>{label}</Badge>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-line">
                      <span className="text-xs text-t3">{formatDateShort(s.date)}</span>
                      <span className="text-sm font-bold text-green-400 tabular-nums">{formatCurrencyFull(s.value)}</span>
                    </div>
                    {hasComm && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-t4">Comissão</span>
                        <div className="text-right">
                          <p className="text-xs text-brand-text tabular-nums font-medium">{formatCurrencyFull(tc)}</p>
                          <p className="text-xs text-emerald-400 tabular-nums">Corretor: {formatCurrencyFull(bc)}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              )
            })}
            {/* Mobile footer */}
            <div className="flex items-center justify-between px-4 py-3 bg-s2/50 rounded-xl border border-line">
              <p className="text-xs text-t3">{filtered.length} venda{filtered.length !== 1 ? 's' : ''}</p>
              <div className="text-right">
                <p className="text-sm font-bold text-slate-100 tabular-nums">
                  {formatCurrencyFull(filtered.reduce((acc, s) => acc + s.value, 0))}
                </p>
                <p className="text-xs text-brand-text tabular-nums">
                  {formatCurrencyFull(filtered.reduce((acc, s) => acc + calcSaleCommissions(s).totalCommission, 0))}
                </p>
              </div>
            </div>
          </div>

          {/* ── Desktop table ──────────────────────────────────────────── */}
          <ListContainer className="hidden lg:block">
            <div className={`grid ${isAdmin ? 'grid-cols-[2fr_2fr_1fr_1fr_1fr_1fr_auto]' : 'grid-cols-[2fr_2fr_1fr_1fr_1fr_auto]'} gap-4 px-6 py-3 border-b border-line`}>
              {[
                'Cliente', 'Empreendimento', 'Data', 'Valor', 'Comissão',
                ...(isAdmin ? ['Corretor'] : []),
                '',
              ].map((h, i) => (
                <p key={i} className="text-xs font-medium text-t3 uppercase tracking-wider">{h}</p>
              ))}
            </div>
            {filtered.map((s, i) => {
              const client     = contacts.find(c => c.id === s.clientId)
              const brokerName = isAdmin ? (allProfiles.find(p => p.id === s.brokerId)?.name ?? '—') : null
              const { label, variant } = TYPE_CONFIG[s.type]
              const { totalCommission: tc, brokerCommission: bc } = calcSaleCommissions(s)
              const hasComm = tc > 0
              const n = new Date()
              const sYear = Number(s.date.split('-')[0])
              const sMonth = Number(s.date.split('-')[1]) - 1
              const isRetro = sYear < n.getFullYear() || (sYear === n.getFullYear() && sMonth < n.getMonth())
              return (
                <div
                  key={s.id}
                  className={`grid ${isAdmin ? 'grid-cols-[2fr_2fr_1fr_1fr_1fr_1fr_auto]' : 'grid-cols-[2fr_2fr_1fr_1fr_1fr_auto]'} gap-4 items-center px-6 py-4 hover:bg-s3/50 row-accent transition-colors ${i < filtered.length - 1 ? 'border-b border-line' : ''}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={client?.name ?? '?'} size="sm" />
                    <div className="min-w-0">
                      <span className="text-sm text-t1 truncate block">{client?.name ?? '—'}</span>
                      {isRetro && (
                        <span className="text-[11px] font-semibold text-amber-500/80 uppercase tracking-wide">retroativo</span>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-t2 truncate">{s.propertyName}</p>
                    <Badge variant={variant}>{label}</Badge>
                  </div>
                  <p className="text-sm text-t3">{formatDateShort(s.date)}</p>
                  <p className="text-sm font-semibold text-green-400 tabular-nums">{formatCurrencyFull(s.value)}</p>
                  <div className="min-w-0">
                    {hasComm ? (
                      <>
                        <p className="text-xs text-brand-text tabular-nums font-medium">{formatCurrencyFull(tc)}</p>
                        <p className="text-xs text-emerald-400 tabular-nums">Corretor: {formatCurrencyFull(bc)}</p>
                      </>
                    ) : (
                      <span className="text-xs text-t5">—</span>
                    )}
                  </div>
                  {isAdmin && (
                    <span className="text-xs text-t3 truncate">{brokerName}</span>
                  )}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setEditing(s); setFormOpen(true) }}
                      className="p-2 rounded-lg hover:bg-s3/70 text-t3 hover:text-t2 transition-colors cursor-pointer"
                    ><Pencil size={14} /></button>
                    <button
                      onClick={() => setDeleteTarget(s)}
                      className="p-2 rounded-lg hover:bg-red-500/10 text-t3 hover:text-red-400 transition-colors cursor-pointer"
                    ><Trash2 size={14} /></button>
                  </div>
                </div>
              )
            })}
            <div className="grid grid-cols-[2fr_2fr_1fr_1fr_1fr_auto] gap-4 items-center px-6 py-3 border-t border-line bg-s2/30">
              <p className="text-xs text-t3 col-span-3">
                {filtered.length} venda{filtered.length !== 1 ? 's' : ''}
              </p>
              <p className="text-sm font-bold text-slate-100 tabular-nums">
                {formatCurrencyFull(filtered.reduce((acc, s) => acc + s.value, 0))}
              </p>
              <div>
                <p className="text-xs font-bold text-brand-text tabular-nums">
                  {formatCurrencyFull(filtered.reduce((acc, s) => acc + calcSaleCommissions(s).totalCommission, 0))}
                </p>
                <p className="text-xs text-emerald-400 tabular-nums">
                  {formatCurrencyFull(filtered.reduce((acc, s) => acc + calcSaleCommissions(s).brokerCommission, 0))}
                </p>
              </div>
              <div />
            </div>
          </ListContainer>
        </>
      )}

      <SaleForm
        key={editing?.id ?? 'new'}
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        sale={editing}
      />

      <Modal isOpen={Boolean(deleteTarget)} onClose={() => setDeleteTarget(undefined)} title="Excluir venda" size="sm">
        <p className="text-sm text-t3 mb-6">
          Tem certeza que deseja excluir esta venda? Esta ação não pode ser desfeita.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setDeleteTarget(undefined)}>Cancelar</Button>
          <Button variant="danger"    className="flex-1" onClick={handleDelete}>Excluir</Button>
        </div>
      </Modal>
    </PageLayout>
  )
}
