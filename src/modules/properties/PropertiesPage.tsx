import { useEffect, useState } from 'react'
import { Search, Building2, Pencil, Trash2, ImageOff } from 'lucide-react'
import { PageLayout } from '../../components/layout/PageLayout'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { PropertyForm } from './PropertyForm'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { useContactsStore } from '../../store/useContactsStore'
import { Property, PropertyStatus } from '../../types'
import { formatCurrencyFull } from '../../lib/formatters'
import toast from 'react-hot-toast'

const FILTER_OPTIONS: { value: PropertyStatus | null; label: string }[] = [
  { value: null, label: 'Todos' },
  { value: 'opportunity', label: 'Oportunidade' },
  { value: 'market_price', label: 'Preço de mercado' },
  { value: 'above_market', label: 'Acima do mercado' },
]

const TYPE_LABELS: Record<string, string> = {
  apartment: 'Apartamento',
  house: 'Casa',
  commercial: 'Comercial',
  land: 'Terreno',
}

export function PropertiesPage() {
  const { properties, load, remove, search, filterByStatus } = usePropertiesStore()
  const { load: loadContacts, getById } = useContactsStore()
  const [query, setQuery] = useState('')
  const [activeStatus, setActiveStatus] = useState<PropertyStatus | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Property | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<Property | undefined>()

  useEffect(() => { load(); loadContacts() }, [load, loadContacts])

  const filtered = query.trim() ? search(query) : filterByStatus(activeStatus)

  function handleDelete() {
    if (!deleteTarget) return
    remove(deleteTarget.id)
    toast.success('Imóvel excluído')
    setDeleteTarget(undefined)
  }

  return (
    <PageLayout
      title="Imóveis"
      subtitle={`${properties.length} imóveis cadastrados`}
      ctaLabel="Novo Imóvel"
      onCta={() => { setEditing(undefined); setFormOpen(true) }}
    >
      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={e => { setQuery(e.target.value) }}
            placeholder="Buscar imóvel ou bairro..."
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
          />
        </div>
        <div className="flex gap-2">
          {FILTER_OPTIONS.map(opt => (
            <button
              key={String(opt.value)}
              onClick={() => { setActiveStatus(opt.value); setQuery('') }}
              className={`
                px-3 py-1.5 rounded-xl text-xs font-medium border transition-all duration-150 cursor-pointer
                ${activeStatus === opt.value && !query
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

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Building2 size={24} />}
          title="Nenhum imóvel encontrado"
          description="Cadastre imóveis para gerenciar seu portfólio."
          ctaLabel="Novo Imóvel"
          onCta={() => { setEditing(undefined); setFormOpen(true) }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(p => {
            const owner = p.ownerId ? getById(p.ownerId) : undefined
            return (
              <Card key={p.id} hover className="!p-0 overflow-hidden flex flex-col">
                {/* Image */}
                <div className="h-36 bg-white/3 flex items-center justify-center flex-shrink-0">
                  {p.images[0] ? (
                    <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <ImageOff size={24} className="text-slate-700" />
                  )}
                </div>
                {/* Content */}
                <div className="p-5 flex flex-col gap-3 flex-1">
                  <div>
                    <p className="text-sm font-semibold text-slate-100 mb-0.5">
                      {p.name}
                      {p.unit && (
                        <span className="ml-2 text-xs font-normal text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded-md">
                          {p.unit}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">{TYPE_LABELS[p.type]} · {p.neighborhood}</p>
                    {p.address && (
                      <p className="text-xs text-slate-600 mt-0.5 truncate">
                        {p.address}{p.complement ? `, ${p.complement}` : ''}
                      </p>
                    )}
                  </div>
                  {/* Specs: quartos · suítes · m² */}
                  {(p.bedrooms || p.suites || p.areaSqm) && (
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      {p.bedrooms && (
                        <span className="flex items-center gap-1">🛏 {p.bedrooms} dorm{p.bedrooms > 1 ? 's' : '.'}</span>
                      )}
                      {p.suites && (
                        <span className="flex items-center gap-1">🚿 {p.suites} suíte{p.suites > 1 ? 's' : ''}</span>
                      )}
                      {p.areaSqm && (
                        <span className="flex items-center gap-1">📐 {p.areaSqm} m²</span>
                      )}
                    </div>
                  )}

                  {/* Valor + condomínio */}
                  <div>
                    <p className="text-lg font-bold text-emerald-400">{formatCurrencyFull(p.value)}</p>
                    {p.condoFee && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        Cond: <span className="text-slate-400">{formatCurrencyFull(p.condoFee)}/mês</span>
                      </p>
                    )}
                  </div>

                  <StatusBadge status={p.status} />
                  {owner && (
                    <p className="text-xs text-slate-500">
                      Prop: <span className="text-slate-300">{owner.name}</span>
                    </p>
                  )}
                  {p.notes && (
                    <p className="text-xs text-slate-600 italic line-clamp-2">"{p.notes}"</p>
                  )}
                  <div className="flex gap-2 mt-auto pt-2 border-t border-white/5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 justify-center"
                      onClick={() => { setEditing(p); setFormOpen(true) }}
                    >
                      <Pencil size={13} /> Editar
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => setDeleteTarget(p)}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <PropertyForm
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        property={editing}
      />

      <Modal isOpen={Boolean(deleteTarget)} onClose={() => setDeleteTarget(undefined)} title="Excluir imóvel" size="sm">
        <p className="text-sm text-slate-400 mb-6">
          Tem certeza que deseja excluir <span className="text-slate-200 font-medium">{deleteTarget?.name}</span>? Esta ação não pode ser desfeita.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setDeleteTarget(undefined)}>Cancelar</Button>
          <Button variant="danger" className="flex-1" onClick={handleDelete}>Excluir</Button>
        </div>
      </Modal>
    </PageLayout>
  )
}
