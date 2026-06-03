import { useState, useEffect, useMemo } from 'react'
import {
  Plus, LayoutGrid, List, Search, BarChart3,
  MessageCircle, Users, UserCheck, Trash2, ChevronRight, RefreshCw, Settings2, TrendingUp,
} from 'lucide-react'
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
import { LeadsDashboard } from './LeadsDashboard'
import { LeadSettings } from './LeadSettings'
import { LeadsPerformance } from './LeadsPerformance'

const ORIGIN_CONFIG: Record<string, { label: string; emoji: string; color: string; bg: string; border: string }> = {
  felicita: { label: 'Felicità', emoji: '✨', color: 'text-rose-400',   bg: 'bg-rose-500/15',   border: 'border-rose-500/25'   },
  meta_ads: { label: 'Meta ADS', emoji: '📱', color: 'text-blue-400',   bg: 'bg-s3/70',   border: 'border-blue-500/25'   },
  portal:   { label: 'Portal',   emoji: '🌐', color: 'text-cyan-400',   bg: 'bg-cyan-500/15',   border: 'border-cyan-500/25'   },
  offline:  { label: 'Offline',  emoji: '🤝', color: 'text-amber-400',  bg: 'bg-amber-500/15',  border: 'border-amber-500/25'  },
  campanha: { label: 'Campanha', emoji: '📣', color: 'text-violet-400', bg: 'bg-violet-500/15', border: 'border-violet-500/25' },
}

const STAGES: LeadFunnelStage[] = ['lead', 'followup', 'atendimento', 'visita', 'proposta', 'venda']

type Tab = 'leads' | 'kanban' | 'dashboard' | 'performance' | 'configuracoes'

// ─── LeadRow ──────────────────────────────────────────────────────────────────

function LeadRow({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const { advanceFollowup } = useLeadsStore()
  const { getById } = useContactsStore()
  const { properties } = usePropertiesStore()
  const property     = lead.propertyId ? properties.find(p => p.id === lead.propertyId) : undefined
  const contact      = lead.contactId  ? getById(lead.contactId) : undefined
  const displayName  = contact?.name   ?? lead.name
  const displayPhone = contact?.phone  ?? lead.phone
  const conf         = STAGE_CONFIG[lead.funnelStage]
  const originConf   = ORIGIN_CONFIG[lead.origin]
  const isDiscarded  = !!lead.discardReason

  function handleWhatsApp(e: React.MouseEvent) {
    e.stopPropagation()
    window.open(whatsappUrl(displayPhone), '_blank')
    advanceFollowup(lead.id)
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
          {lead.contactId && (
            <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/20 flex-shrink-0">
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
        {originConf.emoji} {originConf.label}
      </div>

      <span className={`inline-flex text-[11px] font-medium px-2 py-1 rounded-lg border flex-shrink-0 ${conf.bg} ${conf.color} ${conf.border}`}>
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
  const { leads: allLeads, loading, load } = useLeadsStore()
  const { isAdmin, viewAsBrokerId } = useAuthStore()
  const leads = isAdmin && viewAsBrokerId ? allLeads.filter(l => l.brokerId === viewAsBrokerId) : allLeads
  const { load: loadProps }    = usePropertiesStore()
  const { load: loadContacts } = useContactsStore()
  const { load: loadConfig }   = useLeadConfigStore()

  const [tab,           setTab]           = useState<Tab>('leads')
  const [search,        setSearch]        = useState('')
  const [filterStage,   setFilterStage]   = useState<LeadFunnelStage | null>(null)
  const [filterOrigin]                    = useState<LeadOrigin | null>(null)
  const [showDiscarded, setShowDiscarded] = useState(false)
  const [showForm,      setShowForm]      = useState(false)
  const [selectedLead,  setSelectedLead]  = useState<Lead | null>(null)

  useEffect(() => { load(); loadProps(); loadContacts(); loadConfig() }, [])

  const active    = leads.filter(l => !l.discardReason)
  const discarded = leads.filter(l => !!l.discardReason)

  const filtered = useMemo(() => {
    let result = leads
    if (!showDiscarded) result = result.filter(l => !l.discardReason)
    if (showDiscarded)  result = result.filter(l => !!l.discardReason)
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(l =>
        l.name.toLowerCase().includes(q) ||
        l.phone.includes(q) ||
        (l.email ?? '').toLowerCase().includes(q)
      )
    }
    if (filterStage)  result = result.filter(l => l.funnelStage === filterStage)
    if (filterOrigin) result = result.filter(l => l.origin === filterOrigin)
    return result
  }, [leads, search, filterStage, filterOrigin, showDiscarded])

  const TABS: { value: Tab; label: string; icon: typeof List; badge?: number }[] = [
    { value: 'leads',          label: 'Leads',          icon: List,        badge: active.length },
    { value: 'kanban',         label: 'Kanban',          icon: LayoutGrid                        },
    { value: 'dashboard',      label: 'Dashboard',       icon: BarChart3                         },
    { value: 'performance',    label: 'Performance',     icon: TrendingUp                        },
    { value: 'configuracoes',  label: 'Configurações',   icon: Settings2                         },
  ]

  const isListTab        = tab === 'leads'
  const isKanbanTab      = tab === 'kanban'
  const isDashTab        = tab === 'dashboard'
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
                <span className={`ml-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full
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
          <div className="flex-shrink-0 px-6 py-3 border-b border-line flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-t3" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar lead..."
                className="w-full bg-s3/50 border border-line rounded-xl pl-8 pr-4 py-2.5 text-sm text-t1 placeholder:text-t3 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
              />
            </div>

            {/* Filtro por etapa */}
            <div className="flex items-center gap-1 flex-wrap">
              <button
                onClick={() => setFilterStage(null)}
                className={`text-xs px-2.5 py-1.5 rounded-xl border transition-all
                  ${!filterStage ? 'bg-brand-tint border-brand/40 text-brand-text font-semibold' : 'bg-s3/50 border-line text-t3 hover:text-t2'}`}
              >
                Todas
              </button>
              {STAGES.map(s => {
                const conf = STAGE_CONFIG[s]
                return (
                  <button
                    key={s}
                    onClick={() => setFilterStage(filterStage === s ? null : s)}
                    className={`text-xs px-2.5 py-1.5 rounded-xl border transition-all
                      ${filterStage === s ? `${conf.bg} ${conf.border} ${conf.color}` : 'bg-s3/50 border-line text-t3 hover:text-t2'}`}
                  >
                    {conf.label}
                  </button>
                )
              })}
            </div>

            {/* Descartados */}
            <button
              onClick={() => setShowDiscarded(v => !v)}
              className={`ml-auto flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-xl border transition-all
                ${showDiscarded ? 'bg-red-500/15 border-red-500/25 text-red-300' : 'bg-s3/50 border-line text-t3 hover:text-t2'}`}
            >
              <Trash2 size={11} />
              <span className="hidden sm:inline">{showDiscarded ? 'Descartados' : 'Ver descartados'}</span>
              {discarded.length > 0 && <span className="font-bold">{discarded.length}</span>}
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
                    {search || filterStage ? 'Tente ajustar os filtros' : 'Clique em "Novo Lead" para começar'}
                  </p>
                </div>
                {!search && !filterStage && !showDiscarded && (
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
              <div className="mx-4 my-4 rounded-2xl border border-line overflow-hidden bg-surface shadow-card">
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
    </div>
  )
}
