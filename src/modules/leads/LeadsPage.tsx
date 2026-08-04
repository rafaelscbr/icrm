import { useState, useEffect, useMemo } from 'react'
import { useIntelligenceStore } from '../../store/useIntelligenceStore'
import { TemperatureDot, FitBadge } from '../../components/shared/IntelBadges'
import { aoTeclarAbrir } from '../../components/shared/lista'
import {
  fitDeserveBadge, Temperature, Fit,
  TEMPERATURE_LABEL, TEMPERATURE_COLOR, FIT_LABEL, FIT_COLOR,
} from '../../lib/intelligence'
import { useSearchParams } from 'react-router-dom'
import {
  Plus, LayoutGrid, List, Search, BarChart3,
  MessageCircle, Users, UserCheck, Trash2, ChevronRight, RefreshCw, Settings2,
  Sparkles, Smartphone, Globe, Handshake, Megaphone, Percent,
  GitBranch, Filter, User, Home, X, Trophy, Flame, Target,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { EstadoTela } from '../../components/shared/EstadoTela'
import { Abas } from '../../components/shared/Abas'
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
import { FilterDropdown, FilterOption } from '../../components/shared/FilterDropdown'

const ORIGIN_CONFIG: Record<string, { label: string; icon: typeof Sparkles; color: string; bg: string; border: string }> = {
  felicita: { label: 'Felicità', icon: Sparkles,   color: 'text-brand-text',   bg: 'bg-brand-tint',   border: 'border-brand/25'   },
  meta_ads: { label: 'Meta ADS', icon: Smartphone, color: 'text-info',   bg: 'bg-s3/70',         border: 'border-info-line'   },
  portal:   { label: 'Portal',   icon: Globe,      color: 'text-info',   bg: 'bg-info-bg',   border: 'border-info-line'   },
  offline:  { label: 'Offline',  icon: Handshake,  color: 'text-amber-400',  bg: 'bg-amber-500/15',  border: 'border-amber-500/25'  },
  campanha: { label: 'Campanha', icon: Megaphone,  color: 'text-brand-text', bg: 'bg-brand-tint', border: 'border-brand/25' },
}

const ORIGINS: LeadOrigin[] = ['felicita', 'meta_ads', 'portal', 'offline', 'campanha']

const STAGES: LeadFunnelStage[] = ['lead', 'followup', 'atendimento', 'visita', 'proposta', 'venda']

// Chave única do produto de interesse: imóvel cadastrado (id:) ou nome livre (name:)
function productKeyOf(lead: Lead): string | null {
  if (lead.propertyId)   return `id:${lead.propertyId}`
  if (lead.propertyName) return `name:${lead.propertyName.trim().toLowerCase()}`
  return null
}

type Tab = 'leads' | 'kanban' | 'dashboard' | 'conversao' | 'configuracoes'

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
  const intel        = useIntelligenceStore(s => s.intel[lead.id])

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
      role="button"
      tabIndex={0}
      onKeyDown={aoTeclarAbrir(onClick)}
      aria-label={`Abrir lead ${displayName}`}
      className={`flex items-center gap-4 px-6 py-4 hover:bg-s3/50 transition-colors cursor-pointer border-b border-line last:border-0 group row-accent
        ${isDiscarded ? 'opacity-50' : ''}
      `}
    >
      <Avatar name={displayName} size="sm" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Ponto de temperatura antes do nome: na lista o olho desce pela
              coluna da esquerda, e é ali que a leitura em massa acontece. */}
          {intel && <TemperatureDot temp={intel.temperature} />}
          <span className="text-sm font-medium text-t1 truncate">{displayName}</span>
          {intel && fitDeserveBadge(intel.fitOrigin?.fit) && (
            <FitBadge fit={intel.fitOrigin!.fit} produto={intel.fitOrigin!.name} compact />
          )}
          <SlaBadge lead={lead} />
        </div>
        {/* Segunda linha: telefone, corretor e vínculo com o CRM viram TEXTO,
            não mais pílulas.

            A linha carregava sete elementos com moldura própria — temperatura,
            encaixe, SLA, corretor, CRM, origem e etapa — todos com borda, fundo
            e o mesmo peso visual. Quando tudo tem destaque, nada tem: o olho
            não achava por onde entrar. Só temperatura, encaixe e SLA (o que
            exige decisão) seguem com forma; o resto é contexto e lê como
            contexto. */}
        <div className="flex items-center gap-2 mt-0.5 text-xs text-t3 min-w-0">
          <span className="tabular-nums flex-shrink-0">{formatPhone(displayPhone)}</span>
          {brokerName && (
            <>
              <span className="text-t5" aria-hidden>·</span>
              <span className="truncate" title={`Corretor responsável: ${brokerName}`}>
                {brokerName.split(' ')[0]}
              </span>
            </>
          )}
          {lead.contactId && (
            <>
              <span className="text-t5" aria-hidden>·</span>
              <span className="inline-flex items-center gap-1 text-t4 flex-shrink-0" title="Lead vinculado a um contato do CRM">
                <UserCheck size={10} strokeWidth={1.6} aria-hidden /> no CRM
              </span>
            </>
          )}
        </div>
      </div>

      {/* Produto e valor eram a MESMA célula, num encadeamento de `else`: quem
          tinha produto nunca via o valor. São dois fatos diferentes e agora
          ocupam colunas diferentes. */}
      <div className="hidden md:block text-right flex-shrink-0 w-[130px] min-w-0">
        {property ? (
          <p className="text-xs text-t3 truncate">{property.name}</p>
        ) : lead.propertyName ? (
          <p className="text-xs text-t3 truncate flex items-center justify-end gap-1">
            <Home size={10} className="flex-shrink-0" aria-hidden /> {lead.propertyName}
          </p>
        ) : (
          <p className="text-xs text-t5">—</p>
        )}
      </div>

      <div className="hidden lg:block text-right flex-shrink-0 w-[92px]">
        {lead.averageTicket ? (
          <p className="font-heading text-[13px] font-bold text-t2 tabular-nums">
            {formatCurrency(lead.averageTicket)}
          </p>
        ) : (
          <p className="text-xs text-t5">—</p>
        )}
      </div>

      {/* Origem sem moldura: é procedência, não estado. A etapa continua a
          única pílula deste lado, porque é a que muda e a que se compara. */}
      <div className="hidden sm:flex items-center gap-1.5 text-xs text-t4 flex-shrink-0 w-[104px]">
        <originConf.icon size={11} strokeWidth={1.6} aria-hidden /> {originConf.label}
      </div>

      <div className="w-[92px] flex-shrink-0">
        <span className={`inline-flex text-xs font-medium px-2 py-1 rounded-lg border ${conf.bg} ${conf.color} ${conf.border}`}>
          {conf.label}
          {lead.funnelStage === 'followup' && lead.followupStep > 0 && ` · ${lead.followupStep}ª`}
        </span>
      </div>

      <div className="w-[52px] flex-shrink-0 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
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
  const { leads: allLeads, loading, erro, load, visitaSuggestLeadId, clearVisitaSuggest } = useLeadsStore()
  const { isAdmin, viewAsBrokerId, allProfiles } = useAuthStore()
  const visitaSuggestLead = visitaSuggestLeadId ? allLeads.find(l => l.id === visitaSuggestLeadId) : undefined
  const leads = isAdmin && viewAsBrokerId ? allLeads.filter(l => l.brokerId === viewAsBrokerId) : allLeads
  const { load: loadProps, properties } = usePropertiesStore()
  const { loadByIds: loadContactsByIds } = useContactsStore()
  const { load: loadConfig }   = useLeadConfigStore()
  const { load: loadIntel, intel } = useIntelligenceStore()

  // Filtro por corretor só faz sentido na visão admin global (sem corretor fixado)
  const showBrokerFilter = isAdmin && !viewAsBrokerId

  const [tab,           setTab]           = useState<Tab>('leads')
  const [search,        setSearch]        = useState('')
  const [filterStage,   setFilterStage]   = useState<LeadFunnelStage | null>(null)
  const [filterOrigin,  setFilterOrigin]  = useState<LeadOrigin | null>(null)
  const [filterBroker,  setFilterBroker]  = useState<string | null>(null)
  const [filterProduct, setFilterProduct] = useState<string | null>(null)
  const [filterTemp,    setFilterTemp]    = useState<Temperature | null>(null)
  const [filterFit,     setFilterFit]     = useState<Fit | null>(null)
  // Escopo da lista/kanban: funil ativo, descartados ou ganhos (vendas encerradas)
  const [listView,      setListView]      = useState<'active' | 'discarded' | 'won'>('active')
  const [showForm,      setShowForm]      = useState(false)
  const [searchParams,  setSearchParams]  = useSearchParams()

  // Painel do lead — derivado da URL, não de estado local (ver comentário abaixo).
  const openLeadId = searchParams.get('lead')
  const setSelectedLead = (l: Lead | null) => {
    const next = new URLSearchParams(searchParams)
    if (l) next.set('lead', l.id)
    else   next.delete('lead')
    setSearchParams(next, { replace: !l })
  }

  useEffect(() => { load(); loadProps(); loadConfig(); loadIntel() }, [])  // eslint-disable-line react-hooks/exhaustive-deps -- cargas de abertura da tela: rodam uma vez, não a cada render

  // Só os contatos vinculados aos leads — antes era o fetchAll de 12.543 linhas
  // (~7,7 MB) para exibir algumas dezenas de nomes.
  useEffect(() => {
    const ids = leads.map(l => l.contactId).filter((id): id is string => !!id)
    if (ids.length > 0) loadContactsByIds(ids)
  }, [leads]) // eslint-disable-line react-hooks/exhaustive-deps

  /*
   * A URL é a fonte de verdade do painel: `/leads?lead=<id>`.
   *
   * Antes o deep-link `?open=` era consumido e apagado assim que abria — o
   * painel ficava aberto com a URL limpa, então não dava para compartilhar o
   * lead nem usar o voltar do navegador. Agora o parâmetro permanece enquanto
   * o painel estiver aberto, e fechar é só removê-lo.
   *
   * `?open=` continua aceito para não quebrar links já enviados por aí.
   */
  useEffect(() => {
    const legacy = searchParams.get('open')
    if (!legacy) return
    const next = new URLSearchParams(searchParams)
    next.delete('open')
    next.set('lead', legacy)
    setSearchParams(next, { replace: true })
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  // Lead do painel — resolvido a partir do id na URL contra a base carregada.
  const selectedLead = openLeadId ? allLeads.find(l => l.id === openLeadId) ?? null : null

  // Funil ativo = aberto (nem descartado nem ganho/encerrado) — foto real do agora
  const active    = leads.filter(l => !l.discardReason && !l.closedAt)
  const discarded = leads.filter(l => !!l.discardReason)
  const won       = leads.filter(l => !!l.closedAt)

  // Conjunto base: respeita o escopo da view (contagens estáveis)
  const scoped = useMemo(() => {
    if (listView === 'discarded') return leads.filter(l => !!l.discardReason)
    if (listView === 'won')       return leads.filter(l => !!l.closedAt)
    return leads.filter(l => !l.discardReason && !l.closedAt)
  }, [leads, listView])

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
    if (filterTemp)    result = result.filter(l => intel[l.id]?.temperature === filterTemp)
    if (filterFit)     result = result.filter(l => (intel[l.id]?.fitOrigin?.fit ?? 'sem_dados') === filterFit)
    return result
  }, [scoped, search, filterStage, filterOrigin, filterBroker, filterProduct, filterTemp, filterFit, intel])

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

  const tempOptions: FilterOption[] = useMemo(() => {
    const ordem: Temperature[] = ['quente', 'reaquecendo', 'morno', 'novo', 'frio']
    return ordem
      .map(t => ({
        value: t,
        label: TEMPERATURE_LABEL[t],
        count: scoped.filter(l => intel[l.id]?.temperature === t).length,
        dot:   TEMPERATURE_COLOR[t],
      }))
      .filter(o => o.count > 0)
  }, [scoped, intel])

  const fitOptions: FilterOption[] = useMemo(() => {
    const ordem: Fit[] = ['ideal', 'possivel', 'dificil', 'sem_dados']
    return ordem
      .map(f => ({
        value: f,
        label: FIT_LABEL[f],
        count: scoped.filter(l => (intel[l.id]?.fitOrigin?.fit ?? 'sem_dados') === f).length,
        dot:   FIT_COLOR[f],
      }))
      .filter(o => o.count > 0)
  }, [scoped, intel])

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
    (filterStage ? 1 : 0) + (filterOrigin ? 1 : 0) + (filterTemp ? 1 : 0) + (filterFit ? 1 : 0) +
    (filterBroker != null ? 1 : 0) + (filterProduct ? 1 : 0)

  function clearAllFilters() {
    setFilterStage(null)
    setFilterOrigin(null)
    setFilterBroker(null)
    setFilterProduct(null)
    setSearch('')
  }

  const TABS: { value: Tab; label: string; icon: typeof List; badge?: number }[] = [
    { value: 'leads',          label: 'Leads',          icon: List,        badge: erro ? undefined : active.length },
    { value: 'kanban',         label: 'Kanban',          icon: LayoutGrid                        },
    { value: 'dashboard',      label: 'Dashboard',       icon: BarChart3                         },
    { value: 'conversao',      label: 'Conversão',       icon: Percent                           },
    { value: 'configuracoes',  label: 'Configurações',   icon: Settings2                         },
  ]

  const isListTab        = tab === 'leads'
  const isKanbanTab      = tab === 'kanban'
  const isDashTab        = tab === 'dashboard'
  const isConvTab        = tab === 'conversao'
  const isConfigTab      = tab === 'configuracoes'

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 sticky top-0 z-10 nav-bg-blur border-b border-line px-6 py-4">
        {/* Título + ações */}
        <div className="flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-t1 leading-none tracking-tight">Leads</h1>
            <p className="text-xs text-t3 mt-1">Funil de prospecção · <span className="text-t1 font-semibold">
              {erro ? 'não foi possível ler o funil' : `${active.length} ativos`}
            </span></p>
          </div>

          <Button onClick={() => setShowForm(true)} size="md" className="flex-shrink-0">
            <Plus size={15} />
            Novo Lead
          </Button>
        </div>

        {/* Tabs */}
        <Abas
          abas={TABS.map(t => ({ value: t.value, label: t.label, icon: t.icon, badge: t.badge }))}
          valor={tab}
          onChange={setTab}
          rotulo="Visões do funil"
          variante="sublinhado"
          className="mt-4"
        />
      </div>

      {/* ── Dashboard ─────────────────────────────────────────────────────────── */}
      {isDashTab && (
        <div className="flex-1 overflow-auto">
          <LeadsDashboard leads={leads} onOpenLead={setSelectedLead} />
        </div>
      )}

      {/* ── Conversão ─────────────────────────────────────────────────────────── */}
      {isConvTab && <LeadConversionTab />}

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
            {tempOptions.length > 0 && (
              <FilterDropdown
                label="Temperatura"
                icon={Flame}
                options={tempOptions}
                value={filterTemp}
                onChange={v => setFilterTemp(v as Temperature | null)}
                allLabel="Todas as temperaturas"
              />
            )}
            {fitOptions.length > 0 && (
              <FilterDropdown
                label="Encaixe"
                icon={Target}
                options={fitOptions}
                value={filterFit}
                onChange={v => setFilterFit(v as Fit | null)}
                allLabel="Todos os encaixes"
              />
            )}
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

            {/* Ganhos (vendas encerradas) + Descartados */}
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setListView(v => v === 'won' ? 'active' : 'won')}
                className={`flex items-center gap-1.5 h-9 px-3 rounded-[12px] border text-xs font-semibold transition-all
                  ${listView === 'won' ? 'bg-success-bg border-success-line text-success' : 'bg-surface border-line-input text-t3 hover:text-t2 hover:bg-s2'}`}
              >
                <Trophy size={13} strokeWidth={1.6} />
                <span className="hidden sm:inline">{listView === 'won' ? 'Ganhos' : 'Ver ganhos'}</span>
                {won.length > 0 && <span className="font-bold tabular-nums">{won.length}</span>}
              </button>
              <button
                onClick={() => setListView(v => v === 'discarded' ? 'active' : 'discarded')}
                className={`flex items-center gap-1.5 h-9 px-3 rounded-[12px] border text-xs font-semibold transition-all
                  ${listView === 'discarded' ? 'bg-error-bg border-error-line text-error' : 'bg-surface border-line-input text-t3 hover:text-t2 hover:bg-s2'}`}
              >
                <Trash2 size={13} strokeWidth={1.6} />
                <span className="hidden sm:inline">{listView === 'discarded' ? 'Descartados' : 'Ver descartados'}</span>
                {discarded.length > 0 && <span className="font-bold tabular-nums">{discarded.length}</span>}
              </button>
            </div>
          </div>

          {/* Conteúdo */}
          <div className="flex-1 overflow-auto">
            {/* Falha vence tudo: sem a leitura completa, "nenhum lead
                encontrado" seria uma afirmação falsa sobre o funil. */}
            {erro ? (
              <div className="p-4">
                <EstadoTela carregando={false} erro={erro} vazio={false}
                            onTentarDeNovo={() => { void load() }}>
                  <></>
                </EstadoTela>
              </div>
            ) : loading ? (
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
                    {listView === 'discarded' ? 'Nenhum lead descartado'
                      : listView === 'won' ? 'Nenhuma venda ganha ainda'
                      : 'Nenhum lead encontrado'}
                  </p>
                  <p className="text-xs text-t4 mt-1">
                    {search || activeFilterCount > 0 ? 'Tente ajustar os filtros' : 'Clique em "Novo Lead" para começar'}
                  </p>
                </div>
                {!search && activeFilterCount === 0 && listView === 'active' && (
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
                {/* O cabeçalho era `grid` e as linhas são `flex`: as colunas
                    nunca alinharam de verdade — os rótulos flutuavam sobre
                    conteúdo alinhado à direita. Agora espelha a linha. */}
                <div className="flex items-center gap-4 px-6 py-2.5 border-b border-line bg-s3/20 select-none">
                  <span className="w-8 flex-shrink-0" aria-hidden />
                  <span className="flex-1 min-w-0 font-label text-[11px] font-bold uppercase tracking-[0.12em] text-t4">Nome</span>
                  <span className="hidden md:block w-[130px] flex-shrink-0 text-right font-label text-[11px] font-bold uppercase tracking-[0.12em] text-t4">Produto</span>
                  <span className="hidden lg:block w-[92px] flex-shrink-0 text-right font-label text-[11px] font-bold uppercase tracking-[0.12em] text-t4">Valor</span>
                  <span className="hidden sm:block w-[104px] flex-shrink-0 font-label text-[11px] font-bold uppercase tracking-[0.12em] text-t4">Origem</span>
                  <span className="w-[92px] flex-shrink-0 font-label text-[11px] font-bold uppercase tracking-[0.12em] text-t4">Etapa</span>
                  <span className="w-[52px] flex-shrink-0" aria-hidden />
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
