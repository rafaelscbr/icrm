import { useEffect, useState } from 'react'
import { TrendingUp, Pencil, Trash2, Search, BadgePercent, DollarSign } from 'lucide-react'
import { PageLayout } from '../../components/layout/PageLayout'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Avatar } from '../../components/ui/Avatar'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { SaleForm } from './SaleForm'
import { useSalesStore } from '../../store/useSalesStore'
import { useContactsStore } from '../../store/useContactsStore'
import { Sale, SaleType, calcSaleCommissions } from '../../types'
import { formatCurrencyFull, formatDateShort } from '../../lib/formatters'
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
  const { sales, load, remove, getTotalValue, getThisMonth, getThisMonthValue } = useSalesStore()
  const { contacts, load: loadContacts } = useContactsStore()
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<SaleType | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Sale | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<Sale | undefined>()

  useEffect(() => {
    load(); loadContacts()
    const params = new URLSearchParams(window.location.search)
    if (params.get('new') === '1') {
      setFormOpen(true)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [load, loadContacts])

  const filtered = sales.filter(s => {
    const client = contacts.find(c => c.id === s.clientId)
    const matchQuery = !query.trim() ||
      (client?.name ?? '').toLowerCase().includes(query.toLowerCase()) ||
      s.propertyName.toLowerCase().includes(query.toLowerCase())
    const matchType = !typeFilter || s.type === typeFilter
    return matchQuery && matchType
  })

  // Totais de comissão
  const totalCommission = sales.reduce((acc, s) => acc + calcSaleCommissions(s).totalCommission, 0)
  const totalBroker     = sales.reduce((acc, s) => acc + calcSaleCommissions(s).brokerCommission, 0)

  function handleDelete() {
    if (!deleteTarget) return
    remove(deleteTarget.id)
    toast.success('Venda excluída')
    setDeleteTarget(undefined)
  }

  const thisMonth = getThisMonth()

  return (
    <PageLayout
      title="Vendas"
      subtitle={`${sales.length} vendas · ${formatCurrencyFull(getTotalValue())} total`}
      ctaLabel="Nova Venda"
      onCta={() => { setEditing(undefined); setFormOpen(true) }}
    >
      {/* Summary strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card accent="purple">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 bg-purple-500/15 rounded-lg flex items-center justify-center">
              <TrendingUp size={14} className="text-purple-400" />
            </div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Vendas no mês</p>
          </div>
          <p className="text-2xl font-bold text-purple-300 tabular-nums">{formatCurrencyFull(getThisMonthValue())}</p>
          <p className="text-xs text-slate-500 mt-1">{thisMonth.length} venda{thisMonth.length !== 1 ? 's' : ''}</p>
        </Card>

        <Card accent="green">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 bg-green-500/15 rounded-lg flex items-center justify-center">
              <TrendingUp size={14} className="text-green-400" />
            </div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total acumulado</p>
          </div>
          <p className="text-2xl font-bold text-green-300 tabular-nums">{formatCurrencyFull(getTotalValue())}</p>
          <p className="text-xs text-slate-500 mt-1">{sales.length} vendas no total</p>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 bg-violet-500/15 rounded-lg flex items-center justify-center">
              <BadgePercent size={14} className="text-violet-400" />
            </div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Comissão total gerada</p>
          </div>
          <p className="text-2xl font-bold text-violet-300 tabular-nums">{formatCurrencyFull(totalCommission)}</p>
          <p className="text-xs text-slate-500 mt-1">soma das comissões negociadas</p>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 bg-emerald-500/15 rounded-lg flex items-center justify-center">
              <DollarSign size={14} className="text-emerald-400" />
            </div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Comissão do corretor</p>
          </div>
          <p className="text-2xl font-bold text-emerald-300 tabular-nums">{formatCurrencyFull(totalBroker)}</p>
          <p className="text-xs text-slate-500 mt-1">sua parte acumulada</p>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar por cliente ou imóvel..."
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
          />
        </div>
        <div className="flex gap-2">
          {FILTER_OPTIONS.map(opt => (
            <button
              key={String(opt.value)}
              onClick={() => setTypeFilter(opt.value)}
              className={`
                px-3 py-1.5 rounded-xl text-xs font-medium border transition-all duration-150 cursor-pointer
                ${typeFilter === opt.value
                  ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                  : 'bg-white/5 border-white/10 text-slate-500 hover:text-slate-300'
                }
              `}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<TrendingUp size={24} />}
          title="Nenhuma venda encontrada"
          description="Registre vendas para acompanhar seu desempenho."
          ctaLabel="Nova Venda"
          onCta={() => { setEditing(undefined); setFormOpen(true) }}
        />
      ) : (
        <Card className="!p-0 overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[2fr_2fr_1fr_1fr_1fr_auto] gap-4 px-6 py-3 border-b border-white/8">
            {['Cliente', 'Empreendimento', 'Data', 'Valor', 'Comissão', ''].map((h, i) => (
              <p key={i} className="text-xs font-medium text-slate-500 uppercase tracking-wider">{h}</p>
            ))}
          </div>

          {filtered.map((s, i) => {
            const client = contacts.find(c => c.id === s.clientId)
            const { label, variant } = TYPE_CONFIG[s.type]
            const { totalCommission: tc, brokerCommission: bc } = calcSaleCommissions(s)
            const hasComm = tc > 0
            return (
              <div
                key={s.id}
                className={`grid grid-cols-[2fr_2fr_1fr_1fr_1fr_auto] gap-4 items-center px-6 py-4 hover:bg-white/3 transition-colors ${i < filtered.length - 1 ? 'border-b border-white/5' : ''}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={client?.name ?? '?'} size="sm" />
                  <span className="text-sm text-slate-200 truncate">{client?.name ?? '—'}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-slate-300 truncate">{s.propertyName}</p>
                  <Badge variant={variant}>{label}</Badge>
                </div>
                <p className="text-sm text-slate-400">{formatDateShort(s.date)}</p>
                <p className="text-sm font-semibold text-green-400 tabular-nums">{formatCurrencyFull(s.value)}</p>

                {/* Comissão */}
                <div className="min-w-0">
                  {hasComm ? (
                    <>
                      <p className="text-xs text-violet-400 tabular-nums font-medium">{formatCurrencyFull(tc)}</p>
                      <p className="text-[11px] text-emerald-400 tabular-nums">
                        Corretor: {formatCurrencyFull(bc)}
                      </p>
                    </>
                  ) : (
                    <span className="text-xs text-slate-700">—</span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { setEditing(s); setFormOpen(true) }}
                    className="p-2 rounded-lg hover:bg-white/8 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                  ><Pencil size={14} /></button>
                  <button
                    onClick={() => setDeleteTarget(s)}
                    className="p-2 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
                  ><Trash2 size={14} /></button>
                </div>
              </div>
            )
          })}

          {/* Footer totals */}
          <div className="grid grid-cols-[2fr_2fr_1fr_1fr_1fr_auto] gap-4 items-center px-6 py-3 border-t border-white/8 bg-white/2">
            <p className="text-xs text-slate-500 col-span-3">
              {filtered.length} venda{filtered.length !== 1 ? 's' : ''}
            </p>
            <p className="text-sm font-bold text-slate-100 tabular-nums">
              {formatCurrencyFull(filtered.reduce((acc, s) => acc + s.value, 0))}
            </p>
            <div>
              <p className="text-xs font-bold text-violet-400 tabular-nums">
                {formatCurrencyFull(filtered.reduce((acc, s) => acc + calcSaleCommissions(s).totalCommission, 0))}
              </p>
              <p className="text-[11px] text-emerald-400 tabular-nums">
                {formatCurrencyFull(filtered.reduce((acc, s) => acc + calcSaleCommissions(s).brokerCommission, 0))}
              </p>
            </div>
            <div />
          </div>
        </Card>
      )}

      <SaleForm
        key={editing?.id ?? 'new'}
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        sale={editing}
      />

      <Modal isOpen={Boolean(deleteTarget)} onClose={() => setDeleteTarget(undefined)} title="Excluir venda" size="sm">
        <p className="text-sm text-slate-400 mb-6">
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
