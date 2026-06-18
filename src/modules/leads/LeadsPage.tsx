import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Plus, LayoutGrid, List, Search, BarChart3,
  MessageCircle, Users, UserCheck, Trash2, ChevronRight, RefreshCw, Settings2, TrendingUp,
  Sparkles, Smartphone, Globe, Handshake, Megaphone, Percent,
  GitBranch, Filter, User, Home, X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '../../components/ui/Button'
import { Lead, LeadFunnelStage, LeadOrigin } from '../../types'
import { useLeadsStore } from '../../store/useLeadsStore'
import { useAuthStore } from '../../store/useAuthStore'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { useContactsStore } from '../../store/useContactsStore'
import { useLeadConfigStore } from '../../store/useLeadConfigStore'
import { formatPhone, formatCurrency, whatsappUrl } from '../../lib/formatters'
import { Avatar } from '../../components/ui/Avatar'
import { LeadForm } from './LeadForm'
import { LeadModal } from './LeadModal'
import { LeadKanban, STAGE_CONFIG } from './LeadKanban'
import { LeadVisitaTaskModal } from './LeadVisitaTaskModal'
import { LeadsDashboard } from './LeadsDashboard'
import { LeadConversionTab } from './LeadConversionTab'
import { SlaBadge } from './SlaBadge'
import { useLeadInteractionsStore } from '../../store/useLeadInteractionsStore'
import { LeadSettings } from './LeadSettings'
import { LeadsPerformance } from './LeadsPerformance'
import { FilterDropdown, FilterOption } from '../../components/shared/FilterDropdown'

const ORIGIN_CONFIG: Record<string, { label: string; icon: typeof Sparkles; color: string; bg: string; border: string }> = {
  felicita: { label: 'Felicità', icon: Sparkles,   color: 'text-rose-400',   bg: 'bg-rose-500/15',   border: 'border-rose-500/25'   },
  meta_ads: { label: 'Meta ADS', icon: Smartphone, color: 'text-blue-400',   bg: 'bg-s3/70',         border: 'border-blue-500/25'   },
  portal:   { label: 'Portal',   icon: Globe,      color: 'text-cyan-400',   bg: 'bg-cyan-500/15',   border: 'border-cyan-500/25'   },
  offline:  { label: 'Offline',  icon: Handshake,  color: 'text-amber-400',  bg: 'bg-amber-500/15',  border: 'border-amber-500/25'  },
  campanha: { label: 'Campanha', icon: Megaphone,  color: 'text-violet-400', bg: 'bg-violet-500/15', border: 'border-violet-500/25' },
}

const ORIGINS: LeadOrigin[] = ['felicita', 'meta_ads', 'portal', 'offline', 'campanha']

const STAGES: LeadFunnelStage[] = ['lead', 'followup', 'atendimento', 'visita', 'proposta', 'venda']

// Chave única do produto de interesse: imóvel cadastrado (id:) ou nome livre (name:)
function productKeyOf(lead: Lead): string | null {
  if (lead.propertyId)   return `id:${lead.propertyId}`
  if (lead.propertyName) return `name:${lead.propertyName.trim().toLowerCase()}`
  return null
}

type Tab = 'leads' | 'kanban' | 'dashboard' | 'conversao' | 'performance' | 'configuracoes'

// ─── LeadRow ──────────────────────────────────────────────────────────────────

function LeadRow({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const { advanceFollowup } = useLeadsStore()
  const { add: addInteraction } = useLeadInteractionsStore()
  const { isAdmin, viewAsBrokerId, allProfiles } = useAuthStore()
  const { getById } = useContactsStore()
  const { properties } = usePropertiesStore()

  // Visão admin global: identifica o corretor responsável
  const brokerName = isAdmin && !viewAsBrokerId && lead.brokerId
    ? allProfiles.find(p => p.id === lead.brokerId)?.name
    : undefined
  const property     = lead.propertyId ? properties.find(p => p.id === lead.propertyId) : undefined
  const contact      = lead.contactId  ? getById(lead.contactId) : undefined
  const displayName  = contact?.name   ?? lead.name
  const displayPhone = contact?.phone  ?? lead.phone
  const conf         = STAGE_CONFIG[lead.funnelStage]
  const originConf   = ORIGIN_CONFIG[lead.origin]
  const isDiscarded  = !!lead.discardReason

  // Mesmo comportamento do Kanban: registra a interação no banco (dispara o
  // trigger de 1º contato do SLA Meta Ads) e avança o followup.
  async function handleWhatsApp(e: React.MouseEvent) {
    e.stopPropagation()
    window.open(whatsappUrl(displayPhone), '_blank')
    try {
      await advanceFollowup(lead.id)
      await addInteraction({
        leadId: lead.id,
        type: 'whatsapp',
        description: 'Interagiu via WhatsApp',
        interactedAt: new Date().toISOString(),
      })
      toast.success('Contato registrado')
    } catch { /* erro já toastado pela camada db */ }
  }

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-4 px-6 py-4 hover:bg-s3/50 transition-colors cursor-pointer border-b border-line last:border-0 group row-accent
        ${isDiscarded ? 'opacity-50' : ''}
      `}
    >
      <Avatar name={displayName} size="sm" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-t1 truncate">{displayName}</span>
          <SlaBadge lead={lead} />
          {brokerName && (
            <span
              title={`Corretor responsável: ${brokerName}`}
              className="font-label text-[11px] font-medium uppercase tracking-[0.08em] text-brand-text bg-brand-tint border border-brand/25 px-1.5 py-px rounded-full flex-shrink-0"
            >
              {brokerName.split(' ')[0]}
            </span>
          )}
          {lead.contactId && (
            <span className="inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/20 flex-shrink-0">
              <UserCheck size={8} /> No CRM
            </span>
          )}
        </div>
        <p className="text-xs text-t3 mt-0.5">{formatPhone(displayPhone)}</p>
      </div>

      <div className="hidden md:block text-right flex-shrink-0 max-w-[120px]">
        {property ? (
          <p className="text-xs text-t2 truncate">{property.name}</p>
        ) : lead.propertyName ? (
          <p className="text-xs text-amber-400/80 truncate">🏠 {lead.propertyName}</p>
        ) : lead.averageTicket ? (
          <p className="text-xs font-semibold text-violet-400">{formatCurrency(lead.averageTicket)}</p>
        ) : (
          <p className="text-xs text-t4">—</p>
        )}
      </div>

      <div className={`hidden sm:flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border flex-shrink-0 ${originConf.bg} ${originConf.color} ${originConf.border}`}>
        <originConf.icon size={11} strokeWidth={1.6} /> {originConf.label}
      </div>

      <span className={`inline-flex text-xs font-medium px-2 py-1 rounded-lg border flex-shrink-0 ${conf.bg} ${conf.color} ${conf.border}`}>
        {conf.label}
        {lead.funnelStage === 'followup' && lead.followupStep > 0 && ` · ${lead.followupStep}ª`}
      </span>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        {!isDiscarded && (
          <button
            onClick={handleWhatsApp}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-green-400 hover:text-white hover:bg-green-500 border border-green-500/20 hover:border-green-500 transition-all"
            title="Abrir WhatsApp"
          >
            <MessageCircle size={13} />
          </button>
        )}
        <ChevronRight size={14} className="text-t4" />
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function LeadsPage() {
  const { leads: allLeads, loading, load, visitaSuggestLeadId, clearVisitaSuggest } = useLeadsStore()
  const { isAdmin, viewAsBrokerId, allProfiles } = useAuthStore()
  const visitaSuggestLead = visitaSuggestLeadId ? allLeads.find(l => l.id === visitaSuggestLeadId) : undefined
  const leads = isAdmin && viewAsBrokerId ? allLeads.filter(l => l.brokerId === viewAsBrokerId) : allLeads
  const { load: loadProps, properties } = usePropertiesStore()
  const { load: loadContacts } = useContactsStore()
  const { load: loadConfig }   = useLeadConfigStore()

  // Filtro por corretor só faz sentido na visão admin global (sem corretor fixado)
  const showBrokerFilter = isAdmin && !viewAsBrokerId

  const [tab,           setTab]           = useState<Tab>('leads')
  const [search,        setSearch]        = useState('')
  const [filterStage,   setFilterStage]   = useState<LeadFunnelStage | null>(null)
  const [filterOrigin,  setFilterOrigin]  = useState<LeadOrigin | null>(null)
  const [filterBroker,  setFilterBroker]  = useState<string | null>(null)
  const [filterProduct, setFilterProduct] = useState<string | null>(null)
  const [showDiscarded, setShowDiscarded] = useState(false)
  const [showForm,      setShowForm]      = useState(false)
  const [selectedLead,  setSelectedLead]  = useState<Lead | null>(null)
  const [searchParams,  setSearchParams]  = useSearchParams()

  useEffect(() => { load(); loadProps(); loadContacts(); loadConfig() }, [])

  // Deep-link da busca global: /leads?open=<id> abre o modal do lead
  useEffect(() => {
    const openId = searchParams.get('open')
    if (!openId || allLeads.length === 0) return
    const target = allLeads.find(l => l.id === openId)
    if (target) {
      setSelectedLead(target)
      searchParams.delete('open')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, allLeads]) // eslint-disable-line react-hooks/exhaustive-deps

  const active    = leads.filter(l => !l.discardReason)
  const discarded = leads.filter(l => !!l.discardReason)

  // Conjunto base: respeita apenas o escopo de descartados (contagens estáveis)
  const scoped = useMemo(
    () => leads.filter(l => showDiscarded ? !!l.discardReason : !l.discardReason),
    [leads, showDiscarded],
  )

  const filtered = useMemo(() => {
    let result = scoped
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(l =>
        l.name.toLowerCase().includes(q) ||
        l.phone.includes(q) ||
        (l.email ?? '').toLowerCase().includes(q)
      )
    }
    if (filterStage)   result = result.filter(l => l.funnelStage === filterStage)
    if (filterOrigin)  result = result.filter(l => l.origin === filterOrigin)
    if (filterBroker)  result = result.filter(l => (l.brokerId ?? '') === filterBroker)
    if (filterProduct) result = result.filter(l => productKeyOf(l) === filterProduct)
    return result
  }, [scoped, search, filterStage, filterOrigin, filterBroker, filterProduct])

  // ── Opções dos filtros (com contagem) ────────────────────────────────────────
  const stageOptions: FilterOption[] = useMemo(
    () => STAGES.map(s => ({
      value: s,
      label: STAGE_CONFIG[s].label,
      dot: STAGE_CONFIG[s].dot,
      count: scoped.filter(l => l.funnelStage === s).length,
    })),
    [scoped],
  )

  const originOptions: FilterOption[] = useMemo(
    () => ORIGINS.map(o => ({
      value: o,
      label: ORIGIN_CONFIG[o].label,
      icon: ORIGIN_CONFIG[o].icon,
      count: scoped.filter(l => l.origin === o).length,
    })).filter(o => o.count > 0),
    [scoped],
  )

  const brokerOptions: FilterOption[] = useMemo(() => {
    const counts = new Map<string, number>()
    for (const l of scoped) {
      const key = l.brokerId ?? '__none__'
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const opts: FilterOption[] = allProfiles
      .map(p => ({ value: p.id, label: p.name, icon: User, count: counts.get(p.id) ?? 0 }))
      .filter(o => o.count > 0)
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
    if (counts.get('__none__')) {
      opts.push({ value: '', label: 'Sem corretor', icon: User, count: counts.get('__none__') })
    }
    return opts
  }, [scoped, allProfiles])

  const productOptions: FilterOption[] = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>()
    for (const l of scoped) {
      const key = productKeyOf(l)
      if (!key) continue
      const label = l.propertyId
        ? (properties.find(p => p.id === l.propertyId)?.name ?? l.propertyName ?? 'Imóvel')
        : (l.propertyName ?? 'Imóvel')
      const cur = map.get(key)
      if (cur) cur.count++
      else map.set(key, { label, count: 1 })
    }
    return Array.from(map.entries())
      .map(([value, { label, count }]) => ({ value, label, icon: Home, count }))
      .sort((a, b) => b.count - a.count)
  }, [scoped, properties])

  const activeFilterCount =
    (filterStage ? 1 : 0) + (filterOrigin ? 1 : 0) +
    (filterBroker != null ? 1 : 0) + (filterProduct ? 1 : 0)

  function clearAllFilters() {
    setFilterStage(null)
    setFilterOrigin(null)
    setFilterBroker(null)
    setFilterProduct(null)
    setSearch('')
  }

  const TABS: { value: Tab; label: string; icon: typeof List; badge?: number }[] = [
    { value: 'leads',          label: 'Leads',          icon: List,        badge: active.length },
    { value: 'kanban',         label: 'Kanban',          icon: LayoutGrid                        },
    { value: 'dashboard',      label: 'Dashboard',       icon: BarChart3                         },
    { value: 'conversao',      label: 'Conversão',       icon: Percent                           },
    { value: 'performance',    label: 'Performance',     icon: TrendingUp                        },
    { value: 'configuracoes',  label: 'Configurações',   icon: Settings2                         },
  ]

  const isListTab        = tab === 'leads'
  const isKanbanTab      = tab === 'kanban'
  const isDashTab        = tab === 'dashboard'
  const isConvTab        = tab === 'conversao'
  const isPerformanceTab = tab === 'performance'
  const isConfigTab      = tab === 'configuracoes'

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 sticky top-0 z-10 nav-bg-blur border-b border-line px-6 py-4">
        {/* Título + ações */}
        <div className="flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-t1 leading-none tracking-tight">Leads</h1>
            <p className="text-xs text-t3 mt-1">Funil de prospecção · <span className="text-t1 font-semibold">{active.length} ativos</span></p>
          </div>

          <Button onClick={() => setShowForm(true)} size="md" className="flex-shrink-0">
            <Plus size={15} />
            Novo Lead
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 mt-4 border-b border-line">
          {TABS.map(({ value, label, icon: Icon, badge }) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 -mb-px transition-all cursor-pointer
                ${tab === value
                  ? 'border-brand text-t1'
                  : 'border-transparent text-t3 hover:text-t2 hover:border-line-strong'
                }`}
            >
              <Icon size={12} />
              {label}
              {badge !== undefined && (
                <span className={`ml-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full
                  ${tab === value ? 'bg-brand/15 text-brand' : 'bg-s3/50 text-t3'}`}>
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Dashboard ─────────────────────────────────────────────────────────── */}
      {isDashTab && (
        <div className="flex-1 overflow-auto">
          <LeadsDashboard leads={leads} onOpenLead={setSelectedLead} />
        </div>
      )}

      {/* ── Conversão ─────────────────────────────────────────────────────────── */}
      {isConvTab && <LeadConversionTab />}

      {/* ── Performance ───────────────────────────────────────────────────────── */}
      {isPerformanceTab && (
        <div className="flex-1 overflow-auto">
          <LeadsPerformance leads={active} />
        </div>
      )}

      {/* ── Configurações ──────────────────────────────────────────────────────── */}
      {isConfigTab && (
        <div className="flex-1 overflow-auto">
          <LeadSettings />
        </div>
      )}

      {/* ── Lista / Kanban ────────────────────────────────────────────────────── */}
      {(isListTab || isKanbanTab) && (
        <>
          {/* Toolbar filtros */}
          <div className="flex-shrink-0 px-6 py-3 border-b border-line flex items-center gap-2.5 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-t3" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nome, telefone ou e-mail..."
                className="w-full h-9 bg-surface border border-line-input rounded-[12px] pl-9 pr-8 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand/50 transition-all"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  aria-label="Limpar busca"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full text-t4 hover:text-t2 hover:bg-s2 transition-colors"
                >
                  <X size={13} strokeWidth={2} />
                </button>
              )}
            </div>

            {/* Divisória */}
            <span className="w-px h-6 bg-line hidden sm:block" aria-hidden="true" />

            {/* Filtros em dropdown */}
            <FilterDropdown
              label="Etapa"
              icon={GitBranch}
              options={stageOptions}
              value={filterStage}
              onChange={v => setFilterStage(v as LeadFunnelStage | null)}
              allLabel="Todas as etapas"
            />
            <FilterDropdown
              label="Origem"
              icon={Filter}
              options={originOptions}
              value={filterOrigin}
              onChange={v => setFilterOrigin(v as LeadOrigin | null)}
              allLabel="Todas as origens"
            />
            {showBrokerFilter && (
              <FilterDropdown
                label="Corretor"
                icon={User}
                options={brokerOptions}
                value={filterBroker}
                onChange={setFilterBroker}
                allLabel="Todos os corretores"
              />
            )}
            <FilterDropdown
              label="Produto"
              icon={Home}
              options={productOptions}
              value={filterProduct}
              onChange={setFilterProduct}
              allLabel="Todos os produtos"
              searchable
            />

            {activeFilterCount > 0 && (
              <button
                onClick={clearAllFilters}
                className="flex items-center gap-1.5 h-9 px-2.5 rounded-[12px] text-xs font-semibold text-t3 hover:text-t1 hover:bg-s2 transition-all"
                title="Limpar todos os filtros"
              >
                <X size={13} strokeWidth={1.8} />
                Limpar
                <span className="font-bold text-brand">{activeFilterCount}</span>
              </button>
            )}

            {/* Descartados */}
            <button
              onClick={() => setShowDiscarded(v => !v)}
              className={`ml-auto flex items-center gap-1.5 h-9 px-3 rounded-[12px] border text-xs font-semibold transition-all
                ${showDiscarded ? 'bg-error-bg border-error-line text-error' : 'bg-surface border-line-input text-t3 hover:text-t2 hover:bg-s2'}`}
            >
              <Trash2 size={13} strokeWidth={1.6} />
              <span className="hidden sm:inline">{showDiscarded ? 'Descartados' : 'Ver descartados'}</span>
              {discarded.length > 0 && <span className="font-bold tabular-nums">{discarded.length}</span>}
            </button>
          </div>

          {/* Conteúdo */}
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="flex flex-col items-center gap-3">
                  <RefreshCw size={20} className="text-brand animate-spin" />
                  <p className="text-sm text-t3">Carregando leads...</p>
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 gap-4">
                <div className="w-16 h-16 rounded-2xl bg-s3/60 flex items-center justify-center">
                  <Users size={28} className="text-t3" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-t2">
                    {showDiscarded ? 'Nenhum lead descartado' : 'Nenhum lead encontrado'}
                  </p>
                  <p className="text-xs text-t4 mt-1">
                    {search || activeFilterCount > 0 ? 'Tente ajustar os filtros' : 'Clique em "Novo Lead" para começar'}
                  </p>
                </div>
                {!search && activeFilterCount === 0 && !showDiscarded && (
                  <Button onClick={() => setShowForm(true)} size="md">
                    <Plus size={14} /> Criar primeiro lead
                  </Button>
                )}
              </div>
            ) : isKanbanTab ? (
              <div className="p-4">
                <LeadKanban leads={filtered} />
              </div>
            ) : (
              <div className="mx-4 my-4 rounded-xl border border-line overflow-hidden list-surface">
                <div className="grid grid-cols-[40px_1fr_auto_auto_auto_auto] gap-4 px-6 py-3 border-b border-line bg-s3/30">
                  <div />
                  <span className="text-xs font-semibold text-t3">Nome</span>
                  <span className="text-xs font-semibold text-t3 hidden md:block">Produto</span>
                  <span className="text-xs font-semibold text-t3 hidden sm:block">Origem</span>
                  <span className="text-xs font-semibold text-t3">Etapa</span>
                  <div />
                </div>
                {filtered.map(lead => (
                  <LeadRow key={lead.id} lead={lead} onClick={() => setSelectedLead(lead)} />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Modals */}
      <LeadForm isOpen={showForm} onClose={() => setShowForm(false)} />
      {selectedLead && (
        <LeadModal lead={selectedLead} onClose={() => setSelectedLead(null)} />
      )}

      {/* Sugestão de agendamento ao mover lead para a coluna Visita */}
      {visitaSuggestLead && (
        <LeadVisitaTaskModal lead={visitaSuggestLead} onClose={clearVisitaSuggest} />
      )}
    </div>
  )
}
