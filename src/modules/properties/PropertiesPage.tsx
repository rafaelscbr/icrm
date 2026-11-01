import { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Search, Building2, Pencil, Trash2, ImageOff,
  MapPin, BadgePercent, ClipboardList, ListFilter,
  BedDouble, ShowerHead, Ruler,
  Plus,
} from 'lucide-react'
import { PageLayout } from '../../components/layout/PageLayout'
import { FaixaNumeros, Segmentado } from '../../components/shared/visual'
import { aoTeclarAbrir } from '../../components/shared/lista'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { EstadoTela } from '../../components/shared/EstadoTela'
import { Modal } from '../../components/ui/Modal'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { PropertyForm } from './PropertyForm'
import { PropertyModal } from './PropertyModal'
import { TasksLinkedModal } from '../../components/shared/TasksLinkedModal'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { useContactsStore } from '../../store/useContactsStore'
import { useTasksStore } from '../../store/useTasksStore'
import { useAuthStore } from '../../store/useAuthStore'
import { Property, PropertyStatus } from '../../types'
import { formatCurrency, formatCurrencyFull } from '../../lib/formatters'
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
    <div className="mb-5 flex flex-col gap-3">
      {/* v10: faixa de números no lugar de quatro cartões; a divisão por
          região fica recolhida — é consulta, não leitura diária. */}
      <FaixaNumeros
        itens={[
          { rotulo: 'Imóveis', valor: total.toLocaleString('pt-BR'), nota: 'no portfólio' },
          { rotulo: 'VGV total', valor: <span title={formatCurrencyFull(vgv)}>{formatCurrency(vgv)}</span>, destaque: true },
          { rotulo: 'Comissão estimada', valor: <span title={formatCurrencyFull(commission)}>{formatCurrency(commission)}</span>, nota: '10% do 5% do VGV' },
          { rotulo: 'Ticket médio', valor: <span title={formatCurrencyFull(avgTicket)}>{formatCurrency(avgTicket)}</span>, nota: 'por imóvel' },
        ]}
      />

      {byRegion.length > 0 && (
        <details className="group">
          <summary className="inline-flex items-center gap-1.5 text-[13px] font-medium text-t3 hover:text-t1 cursor-pointer select-none list-none">
            <MapPin size={13} aria-hidden /> Por região
            <span className="text-t4 group-open:hidden">· ver</span>
          </summary>
          <div className="bento px-5 py-4 mt-2 flex flex-col gap-2">
            {byRegion.map(({ region, count, vgv: regionVgv }) => {
              const maxVgv = byRegion[0].vgv
              const barPct = maxVgv > 0 ? Math.round((regionVgv / maxVgv) * 100) : 0
              return (
                <div key={region} className="flex items-center gap-3">
                  <p className="w-36 shrink-0 text-[13px] text-t2 truncate">{region}</p>
                  <div className="flex-1 h-1.5 bg-s2 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-[var(--area,var(--info))]" style={{ width: `${barPct}%` }} />
                  </div>
                  <span className="text-[12.5px] tabular-nums text-t4 w-8 text-right">{count}</span>
                  <span className="text-[12.5px] tabular-nums text-t2 font-semibold w-24 text-right" title={formatCurrencyFull(regionVgv)}>{formatCurrency(regionVgv)}</span>
                </div>
              )
            })}
          </div>
        </details>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function PropertiesPage() {
  const { properties, loading, erro, load, remove, search, filterByStatus, backfillThumbnails } = usePropertiesStore()
  const { loadByIds: loadContactsByIds, getById } = useContactsStore()
  const { tasks } = useTasksStore()
  const { isAdmin, profile } = useAuthStore()
  const canEdit   = (p: Property) => isAdmin || p.createdById === profile?.id
  const canDelete = () => isAdmin
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [activeStatus, setActiveStatus] = useState<PropertyStatus | null>(null)
  const [onlyWithTasks, setOnlyWithTasks] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Property | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<Property | undefined>()
  const [tasksProperty, setTasksProperty] = useState<Property | undefined>()
  const [viewProperty, setViewProperty] = useState<Property | undefined>()

  useEffect(() => { load() }, [load])

  // Só os contatos proprietários dos imóveis — antes era o fetchAll de 12.543 linhas
  // (~7,7 MB) para exibir algumas dezenas de nomes.
  useEffect(() => {
    const ids = properties.map(p => p.ownerId).filter((id): id is string => !!id)
    if (ids.length > 0) loadContactsByIds(ids)
  }, [properties]) // eslint-disable-line react-hooks/exhaustive-deps

  // Migração one-shot: imóveis anteriores à coluna thumbnail ganham miniatura
  // gerada aqui no navegador (apenas admin — RLS de UPDATE). Sem candidatos,
  // não faz nenhuma requisição.
  useEffect(() => {
    if (!isAdmin || properties.length === 0) return
    backfillThumbnails()
  }, [isAdmin, properties.length, backfillThumbnails])

  // Abre modal automaticamente se vier ?open=<id> na URL
  useEffect(() => {
    const openId = searchParams.get('open')
    if (openId && properties.length > 0) {
      const found = properties.find(p => p.id === openId)
      if (found) {
        setViewProperty(found)
        setSearchParams({}, { replace: true })
      }
    }
  }, [searchParams, properties, setSearchParams])

  const filtered = (() => {
    let result = query.trim() ? search(query) : filterByStatus(activeStatus)
    if (onlyWithTasks) {
      result = result.filter(p => tasks.some(t => t.propertyId === p.id && t.status !== 'done'))
    }
    return result
  })()

  const [excluindo, setExcluindo] = useState(false)
  async function handleDelete() {
    if (!deleteTarget) return
    setExcluindo(true)
    try {
      await remove(deleteTarget.id)
      toast.success('Imóvel excluído')
      setDeleteTarget(undefined)
    } catch {
      // deleteOne já mostrou o erro; o imóvel continua na lista.
    } finally {
      setExcluindo(false)
    }
  }

  return (
    <PageLayout
      icon={Building2}
      iconTom="neutro"
      title="Imóveis"
      subtitle={erro
        ? 'não foi possível ler o portfólio'
        : `${properties.length} imóveis cadastrados`}
      ctaLabel="Novo Imóvel"
      onCta={() => { setEditing(undefined); setFormOpen(true) }}
    >
      {/* Dashboard */}
      <PropertiesDashboard properties={properties} />

      {/* Busca, situação e "com tarefas" numa linha */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-5">
        <div className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-t4" aria-hidden />
          <input
            value={query}
            onChange={e => { setQuery(e.target.value) }}
            placeholder="Buscar imóvel ou bairro"
            aria-label="Buscar imóvel ou bairro"
            className="campo w-full h-9 pl-9 pr-3 text-[13.5px]"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto">
          <Segmentado
            rotulo="Situação do imóvel"
            valor={query ? null : activeStatus}
            onChange={(v: PropertyStatus | null) => { setActiveStatus(v); setQuery('') }}
            opcoes={FILTER_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
          />
          <button
            onClick={() => setOnlyWithTasks(v => !v)}
            aria-pressed={onlyWithTasks}
            className={`flex items-center gap-1.5 h-9 px-2.5 rounded-[10px] text-[13px] font-medium transition-colors cursor-pointer flex-shrink-0
              ${onlyWithTasks ? 'bg-warning-bg text-warning' : 'text-t3 hover:bg-s2 hover:text-t1'}`}
          >
            <ListFilter size={14} aria-hidden /> Com tarefas
          </button>
        </div>
      </div>

      <EstadoTela
        carregando={loading && properties.length === 0}
        erro={erro}
        vazio={filtered.length === 0}
        onTentarDeNovo={() => { void load() }}
        icone={Building2}
        titulo="Nenhum imóvel encontrado"
        descricao="Cadastre imóveis para gerenciar seu portfólio."
        acao={
          <Button onClick={() => { setEditing(undefined); setFormOpen(true) }} className="gap-2">
            <Plus size={14} /> Novo imóvel
          </Button>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 stagger-children">
          {filtered.map(p => {
            const owner      = p.ownerId ? getById(p.ownerId) : undefined
            const commission = calcCommission(p.value)
            return (
              <Card key={p.id} hover className="group !p-0 overflow-hidden flex flex-col">
                {/* A foto é atalho de mouse para o mesmo destino do corpo do
                    cartão. Marcada como decorativa para o teclado não parar
                    duas vezes no mesmo lugar — quem tabula chega pelo corpo. */}
                <div
                  onClick={() => setViewProperty(p)}
                  aria-hidden
                  className="h-36 bg-s2/50 flex items-center justify-center flex-shrink-0 cursor-pointer"
                >
                  {p.thumbnail ? (
                    <img src={p.thumbnail} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <ImageOff size={24} className="text-t5" />
                  )}
                </div>

                {/* Content (clicável exceto botões) */}
                <div
                  onClick={() => setViewProperty(p)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={aoTeclarAbrir(() => setViewProperty(p))}
                  aria-label={`Abrir ${p.name}`}
                  className="p-5 flex flex-col gap-3 flex-1 cursor-pointer"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-100 mb-0.5">
                      {p.name}
                      {p.unit && (
                        <span className="ml-2 text-xs font-normal text-brand bg-indigo-500/10 px-1.5 py-0.5 rounded-md">
                          {p.unit}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-t3">{TYPE_LABELS[p.type]} · {p.neighborhood}{p.city ? ` · ${p.city}` : ''}</p>
                    {p.address && (
                      <p className="text-xs text-t4 mt-0.5 truncate">
                        {p.address}{p.complement ? `, ${p.complement}` : ''}
                      </p>
                    )}
                  </div>

                  {/* Specs */}
                  {(p.bedrooms || p.suites || p.areaSqm) && (
                    <div className="flex items-center gap-3 text-xs text-t3">
                      {p.bedrooms && <span className="flex items-center gap-1"><BedDouble size={12} /> {p.bedrooms} dorm{p.bedrooms > 1 ? 's' : '.'}</span>}
                      {p.suites   && <span className="flex items-center gap-1"><ShowerHead size={12} /> {p.suites} suíte{p.suites > 1 ? 's' : ''}</span>}
                      {p.areaSqm  && <span className="flex items-center gap-1"><Ruler size={12} /> {p.areaSqm} m²</span>}
                    </div>
                  )}

                  {/* Valor + condomínio + comissão */}
                  <div>
                    <p className="text-lg font-bold text-t1 tabular-nums">{formatCurrencyFull(p.value)}</p>
                    {p.condoFee && (
                      <p className="text-xs text-t3 mt-0.5">
                        Cond: <span className="text-t3">{formatCurrencyFull(p.condoFee)}/mês</span>
                      </p>
                    )}
                    <p className="text-xs text-brand-text mt-0.5 flex items-center gap-1">
                      <BadgePercent size={10} />
                      Comissão: <span className="font-semibold">{formatCurrencyFull(commission)}</span>
                    </p>
                  </div>

                  <StatusBadge status={p.status} />
                  {isAdmin && owner && (
                    <p className="text-xs text-t3">
                      Prop: <span className="text-t2">{owner.name}</span>
                    </p>
                  )}
                  {p.notes && (
                    <p className="text-xs text-t4 italic line-clamp-2">"{p.notes}"</p>
                  )}

                  {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- invólucro que só contém a propagação do clique — quem age são os botões dentro */}
                  <div className="flex gap-2 mt-auto pt-2 border-t border-line" onClick={e => e.stopPropagation()}>
                    {/* Botão tarefas com badge de contagem */}
                    {(() => {
                      const count = tasks.filter(t => t.propertyId === p.id).length
                      return (
                        <button
                          onClick={() => setTasksProperty(p)}
                          className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-indigo-500/10 text-t3 hover:text-brand transition-colors cursor-pointer text-xs font-medium border border-line hover:border-brand/30"
                          title="Ver tarefas vinculadas"
                        >
                          <ClipboardList size={13} />
                          {count > 0
                            ? <span className="text-brand font-bold">{count}</span>
                            : <span>Tarefas</span>
                          }
                        </button>
                      )
                    })()}
                    {canEdit(p) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="flex-1 justify-center"
                        onClick={() => { setEditing(p); setFormOpen(true) }}
                      >
                        <Pencil size={13} /> Editar
                      </Button>
                    )}
                    {/* Excluir estava sempre visível, em vermelho, no mesmo
                        peso de "Editar". Ação destrutiva e rara não disputa
                        atenção com ação rotineira: aparece no hover e no foco,
                        e continua alcançável por teclado e no toque. */}
                    {canDelete() && (
                      <button
                        onClick={() => setDeleteTarget(p)}
                        aria-label={`Excluir ${p.name}`}
                        title="Excluir imóvel"
                        className="w-9 h-9 flex items-center justify-center rounded-lg border border-line text-t4
                                   hover:text-error hover:bg-error-bg hover:border-error-line transition-all cursor-pointer
                                   opacity-0 group-hover:opacity-100 focus-visible:opacity-100
                                   [@media(hover:none)]:opacity-100
                                   focus:outline-none focus-visible:ring-2 focus-visible:ring-error/40"
                      >
                        <Trash2 size={13} strokeWidth={1.7} aria-hidden />
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      </EstadoTela>

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
        <p className="text-sm text-t3 mb-6">
          Tem certeza que deseja excluir <span className="text-t1 font-medium">{deleteTarget?.name}</span>? Esta ação não pode ser desfeita.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setDeleteTarget(undefined)}>Cancelar</Button>
          <Button variant="danger" className="flex-1" onClick={handleDelete} carregando={excluindo}>Excluir</Button>
        </div>
      </Modal>
    </PageLayout>
  )
}
