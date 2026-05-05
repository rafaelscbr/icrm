import { useEffect, useState, useMemo } from 'react'
import {
  Search, Building2, Pencil, Trash2, ImageOff,
  TrendingUp, Landmark, MapPin, BadgePercent, ClipboardList, ListFilter,
} from 'lucide-react'
import { PageLayout } from '../../components/layout/PageLayout'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { PropertyForm } from './PropertyForm'
import { PropertyModal } from './PropertyModal'
import { TasksLinkedModal } from '../../components/shared/TasksLinkedModal'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { useContactsStore } from '../../store/useContactsStore'
import { useTasksStore } from '../../store/useTasksStore'
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
  apartment:          'Apartamento',
  apartment_duplex:   'Apartamento Duplex',
  penthouse_duplex:   'Cobertura Duplex',
  house:              'Casa',
  commercial:         'Comercial',
  land:               'Terreno',
}

// Comissão: 10% do 5% do valor = 0,5% do valor
function calcCommission(value: number) { return value * 0.05 * 0.10 }

// ─── Dashboard ────────────────────────────────────────────────────────────────

function PropertiesDashboard({ properties }: { properties: Property[] }) {
  const total      = properties.length
  const vgv        = properties.reduce((s, p) => s + p.value, 0)
  const commission = properties.reduce((s, p) => s + calcCommission(p.value), 0)
  const avgTicket  = total > 0 ? vgv / total : 0

  // Agrupa por região (bairro + cidade)
  const byRegion = useMemo(() => {
    const map = new Map<string, { count: number; vgv: number }>()
    properties.forEach(p => {
      const key = p.city ? `${p.neighborhood} · ${p.city}` : p.neighborhood
      const cur = map.get(key) ?? { count: 0, vgv: 0 }
      map.set(key, { count: cur.count + 1, vgv: cur.vgv + p.value })
    })
    return [...map.entries()]
      .map(([region, data]) => ({ region, ...data }))
      .sort((a, b) => b.vgv - a.vgv)
      .slice(0, 6)
  }, [properties])

  if (total === 0) return null

  return (
    <div className="mb-8 flex flex-col gap-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Total de imóveis',
            value: total.toString(),
            sub: 'no portfólio',
            icon: <Building2 size={15} />,
            color: 'text-indigo-400',
            bg: 'bg-indigo-500/10',
          },
          {
            label: 'VGV total',
            value: formatCurrencyFull(vgv),
            sub: 'valor geral de vendas',
            icon: <Landmark size={15} />,
            color: 'text-emerald-400',
            bg: 'bg-emerald-500/10',
          },
          {
            label: 'Comissão estimada',
            value: formatCurrencyFull(commission),
            sub: '10% do 5% do VGV',
            icon: <BadgePercent size={15} />,
            color: 'text-violet-400',
            bg: 'bg-violet-500/10',
          },
          {
            label: 'Ticket médio',
            value: formatCurrencyFull(avgTicket),
            sub: 'por imóvel',
            icon: <TrendingUp size={15} />,
            color: 'text-cyan-400',
            bg: 'bg-cyan-500/10',
          },
        ].map(kpi => (
          <Card key={kpi.label} className="!py-4">
            <div className="flex items-center gap-2 mb-2">
              <span className={`${kpi.color} ${kpi.bg} p-1.5 rounded-lg`}>{kpi.icon}</span>
              <span className="text-xs text-slate-500">{kpi.label}</span>
            </div>
            <p className={`text-xl font-bold tabular-nums ${kpi.color}`}>{kpi.value}</p>
            <p className="text-[10px] text-slate-600 mt-0.5">{kpi.sub}</p>
          </Card>
        ))}
      </div>

      {/* Por região */}
      {byRegion.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <MapPin size={13} className="text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-300">Imóveis por região</h2>
          </div>
          <div className="flex flex-col gap-2">
            {byRegion.map(({ region, count, vgv: regionVgv }) => {
              const pct = total > 0 ? Math.round((count / total) * 100) : 0
              const maxVgv = byRegion[0].vgv
              const barPct = maxVgv > 0 ? Math.round((regionVgv / maxVgv) * 100) : 0
              return (
                <div key={region} className="flex items-center gap-3">
                  <div className="w-32 shrink-0">
                    <p className="text-xs text-slate-300 truncate">{region}</p>
                  </div>
                  <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                  <span className="text-xs tabular-nums text-slate-400 w-5 text-right">{count}</span>
                  <span className="text-[10px] text-slate-600 w-10 text-right">{pct}%</span>
                  <span className="text-xs tabular-nums text-emerald-400 w-28 text-right">{formatCurrencyFull(regionVgv)}</span>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function PropertiesPage() {
  const { properties, load, remove, search, filterByStatus } = usePropertiesStore()
  const { load: loadContacts, getById } = useContactsStore()
  const { tasks } = useTasksStore()
  const [query, setQuery] = useState('')
  const [activeStatus, setActiveStatus] = useState<PropertyStatus | null>(null)
  const [onlyWithTasks, setOnlyWithTasks] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Property | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<Property | undefined>()
  const [tasksProperty, setTasksProperty] = useState<Property | undefined>()
  const [viewProperty, setViewProperty] = useState<Property | undefined>()

  useEffect(() => { load(); loadContacts() }, [load, loadContacts])

  const filtered = (() => {
    let result = query.trim() ? search(query) : filterByStatus(activeStatus)
    if (onlyWithTasks) {
      result = result.filter(p => tasks.some(t => t.propertyId === p.id && t.status !== 'done'))
    }
    return result
  })()

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
      {/* Dashboard */}
      <PropertiesDashboard properties={properties} />

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
        <div className="flex gap-2 flex-wrap">
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
          <button
            onClick={() => setOnlyWithTasks(v => !v)}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all duration-150 cursor-pointer
              ${onlyWithTasks
                ? 'bg-orange-500/20 border-orange-500/40 text-orange-300'
                : 'bg-white/5 border-white/10 text-slate-500 hover:text-slate-300'
              }
            `}
          >
            <ListFilter size={12} /> Com tarefas
          </button>
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
            const owner      = p.ownerId ? getById(p.ownerId) : undefined
            const commission = calcCommission(p.value)
            return (
              <Card key={p.id} hover className="!p-0 overflow-hidden flex flex-col">
                {/* Image (clicável) */}
                <div
                  onClick={() => setViewProperty(p)}
                  className="h-36 bg-white/3 flex items-center justify-center flex-shrink-0 cursor-pointer"
                >
                  {p.images[0] ? (
                    <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <ImageOff size={24} className="text-slate-700" />
                  )}
                </div>

                {/* Content (clicável exceto botões) */}
                <div
                  onClick={() => setViewProperty(p)}
                  className="p-5 flex flex-col gap-3 flex-1 cursor-pointer"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-100 mb-0.5">
                      {p.name}
                      {p.unit && (
                        <span className="ml-2 text-xs font-normal text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded-md">
                          {p.unit}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">{TYPE_LABELS[p.type]} · {p.neighborhood}{p.city ? ` · ${p.city}` : ''}</p>
                    {p.address && (
                      <p className="text-xs text-slate-600 mt-0.5 truncate">
                        {p.address}{p.complement ? `, ${p.complement}` : ''}
                      </p>
                    )}
                  </div>

                  {/* Specs */}
                  {(p.bedrooms || p.suites || p.areaSqm) && (
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      {p.bedrooms && <span>🛏 {p.bedrooms} dorm{p.bedrooms > 1 ? 's' : '.'}</span>}
                      {p.suites   && <span>🚿 {p.suites} suíte{p.suites > 1 ? 's' : ''}</span>}
                      {p.areaSqm  && <span>📐 {p.areaSqm} m²</span>}
                    </div>
                  )}

                  {/* Valor + condomínio + comissão */}
                  <div>
                    <p className="text-lg font-bold text-emerald-400">{formatCurrencyFull(p.value)}</p>
                    {p.condoFee && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        Cond: <span className="text-slate-400">{formatCurrencyFull(p.condoFee)}/mês</span>
                      </p>
                    )}
                    <p className="text-xs text-violet-400 mt-0.5 flex items-center gap-1">
                      <BadgePercent size={10} />
                      Comissão: <span className="font-semibold">{formatCurrencyFull(commission)}</span>
                    </p>
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

                  <div className="flex gap-2 mt-auto pt-2 border-t border-white/5" onClick={e => e.stopPropagation()}>
                    {/* Botão tarefas com badge de contagem */}
                    {(() => {
                      const count = tasks.filter(t => t.propertyId === p.id).length
                      return (
                        <button
                          onClick={() => setTasksProperty(p)}
                          className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-indigo-500/10 text-slate-500 hover:text-indigo-400 transition-colors cursor-pointer text-xs font-medium border border-white/8 hover:border-indigo-500/30"
                          title="Ver tarefas vinculadas"
                        >
                          <ClipboardList size={13} />
                          {count > 0
                            ? <span className="text-indigo-400 font-bold">{count}</span>
                            : <span>Tarefas</span>
                          }
                        </button>
                      )
                    })()}
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

      {/* Modal de detalhes do imóvel */}
      <PropertyModal
        isOpen={Boolean(viewProperty)}
        onClose={() => setViewProperty(undefined)}
        property={viewProperty}
      />

      <PropertyForm
        key={editing?.id ?? 'new'}
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        property={editing}
      />

      {/* Modal de tarefas vinculadas */}
      <TasksLinkedModal
        isOpen={Boolean(tasksProperty)}
        onClose={() => setTasksProperty(undefined)}
        title={tasksProperty?.name ?? ''}
        subtitle={[tasksProperty?.neighborhood, tasksProperty?.city].filter(Boolean).join(' · ')}
        propertyId={tasksProperty?.id}
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
