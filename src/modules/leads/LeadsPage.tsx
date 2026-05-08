import { useState, useEffect, useMemo } from 'react'
import {
  Plus, LayoutGrid, List, Search, BarChart3,
  MessageCircle, Users, UserCheck, Trash2, ChevronRight, RefreshCw,
} from 'lucide-react'
import { Lead, LeadFunnelStage, LeadOrigin } from '../../types'
import { useLeadsStore } from '../../store/useLeadsStore'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { useContactsStore } from '../../store/useContactsStore'
import { formatPhone, formatCurrency, whatsappUrl } from '../../lib/formatters'
import { LeadForm } from './LeadForm'
import { LeadModal } from './LeadModal'
import { LeadKanban, STAGE_CONFIG } from './LeadKanban'
import { LeadsDashboard } from './LeadsDashboard'
import toast from 'react-hot-toast'

const ORIGIN_CONFIG: Record<string, { label: string; emoji: string; color: string; bg: string; border: string }> = {
  felicita: { label: 'Felicità', emoji: '✨', color: 'text-rose-400',   bg: 'bg-rose-500/15',   border: 'border-rose-500/25'   },
  meta_ads: { label: 'Meta ADS', emoji: '📱', color: 'text-blue-400',   bg: 'bg-blue-500/15',   border: 'border-blue-500/25'   },
  portal:   { label: 'Portal',   emoji: '🌐', color: 'text-cyan-400',   bg: 'bg-cyan-500/15',   border: 'border-cyan-500/25'   },
  offline:  { label: 'Offline',  emoji: '🤝', color: 'text-amber-400',  bg: 'bg-amber-500/15',  border: 'border-amber-500/25'  },
  campanha: { label: 'Campanha', emoji: '📣', color: 'text-violet-400', bg: 'bg-violet-500/15', border: 'border-violet-500/25' },
}

const STAGES: LeadFunnelStage[] = ['lead', 'followup', 'atendimento', 'visita', 'proposta', 'venda']

const FOLLOWUP_MESSAGES = [
  (name: string) => `Olá ${name}! Tudo bem? Sou o Rafael, da Souza Imobiliária. Vi que você tem interesse em imóveis. Posso te ajudar? 😊`,
  (name: string) => `Oi ${name}, tudo certo? Passando para ver se conseguiu ver minha mensagem anterior. Tenho ótimas opções que podem te interessar! 🏠`,
  (name: string) => `${name}, que tal conversarmos sobre o que você procura em um imóvel? Tenho algumas opções que podem ser perfeitas pra você! ✨`,
  (name: string) => `Oi ${name}! Ainda tenho aquelas opções incríveis para te mostrar. Tem um minutinho para conversarmos? 🌟`,
  (name: string) => `${name}, última tentativa de contato. Se ainda tiver interesse em encontrar seu imóvel ideal, me dá um sinal! Estarei à disposição 😊`,
]

type Tab = 'leads' | 'kanban' | 'dashboard'

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
    const firstName = displayName.split(' ')[0]
    let msg = FOLLOWUP_MESSAGES[0](firstName)
    if (lead.funnelStage === 'followup' && lead.followupStep >= 1 && lead.followupStep <= 5) {
      msg = FOLLOWUP_MESSAGES[lead.followupStep - 1](firstName)
    }
    window.open(whatsappUrl(displayPhone, msg), '_blank')
    advanceFollowup(lead.id)
    const nextStep = lead.funnelStage === 'lead' ? 1 : Math.min(lead.followupStep + 1, 5)
    toast.success(`WhatsApp · ${nextStep}ª msg`)
  }

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-4 px-4 py-3.5 hover:bg-white/3 transition-all cursor-pointer border-b border-white/5 last:border-0 group
        ${isDiscarded ? 'opacity-50' : ''}
      `}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0
        ${isDiscarded ? 'bg-slate-500/20 text-slate-500' : 'bg-blue-600 text-white'}`}>
        {displayName.charAt(0).toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-200 truncate">{displayName}</span>
          {lead.contactId && (
            <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/20 flex-shrink-0">
              <UserCheck size={8} /> No CRM
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-0.5">{formatPhone(displayPhone)}</p>
      </div>

      <div className={`hidden md:flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border ${originConf.bg} ${originConf.color} ${originConf.border}`}>
        {originConf.emoji} {originConf.label}
      </div>

      <div className="hidden lg:block w-36 text-right">
        {property ? (
          <p className="text-xs text-slate-400 truncate">{property.name}</p>
        ) : lead.propertyName ? (
          <p className="text-xs text-amber-400/80 truncate">🏠 {lead.propertyName}</p>
        ) : lead.averageTicket ? (
          <p className="text-xs font-semibold text-violet-400">{formatCurrency(lead.averageTicket)}</p>
        ) : (
          <p className="text-xs text-slate-600">—</p>
        )}
      </div>

      {lead.funnelStage === 'followup' && (
        <div className="hidden sm:flex items-center gap-1">
          {[1, 2, 3, 4, 5].map(s => (
            <div key={s} className={`w-1.5 h-1.5 rounded-full ${s <= lead.followupStep ? 'bg-blue-400' : 'bg-white/10'}`} />
          ))}
        </div>
      )}

      <span className={`hidden sm:inline-flex text-[11px] font-medium px-2 py-1 rounded-lg border ${conf.bg} ${conf.color} ${conf.border}`}>
        {conf.label}
        {lead.funnelStage === 'followup' && lead.followupStep > 0 && ` · ${lead.followupStep}ª`}
      </span>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {!isDiscarded && (
          <button
            onClick={handleWhatsApp}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-green-400 hover:text-white hover:bg-green-500 border border-green-500/20 hover:border-green-500 transition-all"
            title="Abrir WhatsApp"
          >
            <MessageCircle size={13} />
          </button>
        )}
        <ChevronRight size={14} className="text-slate-600" />
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function LeadsPage() {
  const { leads, loading, load } = useLeadsStore()
  const { load: loadProps }    = usePropertiesStore()
  const { load: loadContacts } = useContactsStore()

  const [tab,           setTab]           = useState<Tab>('leads')
  const [search,        setSearch]        = useState('')
  const [filterStage,   setFilterStage]   = useState<LeadFunnelStage | null>(null)
  const [filterOrigin]                    = useState<LeadOrigin | null>(null)
  const [showDiscarded, setShowDiscarded] = useState(false)
  const [showForm,      setShowForm]      = useState(false)
  const [selectedLead,  setSelectedLead]  = useState<Lead | null>(null)

  useEffect(() => { load(); loadProps(); loadContacts() }, [])

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
    { value: 'leads',     label: 'Leads',     icon: List,       badge: active.length },
    { value: 'kanban',    label: 'Kanban',     icon: LayoutGrid                       },
    { value: 'dashboard', label: 'Dashboard',  icon: BarChart3                        },
  ]

  const isListTab   = tab === 'leads'
  const isKanbanTab = tab === 'kanban'
  const isDashTab   = tab === 'dashboard'

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 sticky top-0 z-10 backdrop-blur border-b border-white/7 px-6 py-4" style={{ backgroundColor: 'rgba(7,9,15,0.97)' }}>
        {/* Título + ações */}
        <div className="flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-white leading-none tracking-tight">Leads</h1>
            <p className="text-xs text-slate-500 mt-1">Funil de prospecção · <span className="text-slate-300 font-semibold">{active.length} ativos</span></p>
          </div>

          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all shadow-lg shadow-blue-600/30 active:scale-95 flex-shrink-0"
          >
            <Plus size={15} />
            Novo Lead
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4">
          {TABS.map(({ value, label, icon: Icon, badge }) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer
                ${tab === value
                  ? 'bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-600/30'
                  : 'bg-transparent border-white/8 text-slate-500 hover:text-slate-300 hover:border-white/15'
                }`}
            >
              <Icon size={12} />
              {label}
              {badge !== undefined && (
                <span className={`ml-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full
                  ${tab === value ? 'bg-white/20 text-white' : 'bg-white/8 text-slate-500'}`}>
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

      {/* ── Lista / Kanban ────────────────────────────────────────────────────── */}
      {(isListTab || isKanbanTab) && (
        <>
          {/* Toolbar filtros */}
          <div className="flex-shrink-0 px-6 py-3 border-b border-white/7 flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar lead..."
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-4 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/40 transition-all"
              />
            </div>

            {/* Filtro por etapa */}
            <div className="flex items-center gap-1 flex-wrap">
              <button
                onClick={() => setFilterStage(null)}
                className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all
                  ${!filterStage ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white/3 border-white/8 text-slate-500 hover:text-slate-300'}`}
              >
                Todas
              </button>
              {STAGES.map(s => {
                const conf = STAGE_CONFIG[s]
                return (
                  <button
                    key={s}
                    onClick={() => setFilterStage(filterStage === s ? null : s)}
                    className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all
                      ${filterStage === s ? `${conf.bg} ${conf.border} ${conf.color}` : 'bg-white/3 border-white/8 text-slate-500 hover:text-slate-300'}`}
                  >
                    {conf.label}
                  </button>
                )
              })}
            </div>

            {/* Descartados */}
            <button
              onClick={() => setShowDiscarded(v => !v)}
              className={`ml-auto flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all
                ${showDiscarded ? 'bg-red-500/15 border-red-500/25 text-red-300' : 'bg-white/3 border-white/8 text-slate-500 hover:text-slate-300'}`}
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
                  <RefreshCw size={20} className="text-blue-400 animate-spin" />
                  <p className="text-sm text-slate-500">Carregando leads...</p>
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 gap-4">
                <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                  <Users size={28} className="text-blue-400/60" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-400">
                    {showDiscarded ? 'Nenhum lead descartado' : 'Nenhum lead encontrado'}
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    {search || filterStage ? 'Tente ajustar os filtros' : 'Clique em "Novo Lead" para começar'}
                  </p>
                </div>
                {!search && !filterStage && !showDiscarded && (
                  <button
                    onClick={() => setShowForm(true)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all shadow-lg shadow-blue-600/30"
                  >
                    <Plus size={14} /> Criar primeiro lead
                  </button>
                )}
              </div>
            ) : isKanbanTab ? (
              <div className="p-4">
                <LeadKanban leads={filtered} />
              </div>
            ) : (
              <div className="bg-[#0D1117] mx-4 my-4 rounded-2xl border border-white/8 overflow-hidden">
                <div className="grid grid-cols-[32px_1fr_auto_auto_auto_auto] gap-4 px-4 py-2.5 border-b border-white/8 bg-white/2">
                  <div />
                  <span className="text-xs font-semibold text-slate-500">Nome</span>
                  <span className="text-xs font-semibold text-slate-500 hidden md:block">Origem</span>
                  <span className="text-xs font-semibold text-slate-500 hidden lg:block">Produto</span>
                  <span className="text-xs font-semibold text-slate-500 hidden sm:block">Etapa</span>
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
