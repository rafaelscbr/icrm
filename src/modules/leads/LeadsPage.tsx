import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Plus, LayoutGrid, List, Search, MessageCircle,
  Users, TrendingUp, BarChart3, Phone,
  UserCheck, Trash2, ChevronRight, RefreshCw,
} from 'lucide-react'
import { Lead, LeadFunnelStage, LeadOrigin } from '../../types'
import { useLeadsStore } from '../../store/useLeadsStore'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { useContactsStore } from '../../store/useContactsStore'
import { formatPhone, formatCurrency, whatsappUrl } from '../../lib/formatters'
import { LeadForm } from './LeadForm'
import { LeadModal } from './LeadModal'
import { LeadKanban, STAGE_CONFIG } from './LeadKanban'
import toast from 'react-hot-toast'

const ORIGIN_CONFIG = {
  felicita:  { label: 'Felicità',  emoji: '✨', color: 'text-rose-400',   bg: 'bg-rose-500/15',   border: 'border-rose-500/25'   },
  meta_ads:  { label: 'Meta ADS',  emoji: '📱', color: 'text-blue-400',   bg: 'bg-blue-500/15',   border: 'border-blue-500/25'   },
  portal:    { label: 'Portal',    emoji: '🌐', color: 'text-cyan-400',   bg: 'bg-cyan-500/15',   border: 'border-cyan-500/25'   },
  offline:   { label: 'Offline',   emoji: '🤝', color: 'text-amber-400',  bg: 'bg-amber-500/15',  border: 'border-amber-500/25'  },
}

const STAGES: LeadFunnelStage[] = ['lead', 'followup', 'atendimento', 'visita', 'proposta', 'venda']

const FOLLOWUP_MESSAGES = [
  (name: string) => `Olá ${name}! Tudo bem? Sou o Rafael, da Souza Imobiliária. Vi que você tem interesse em imóveis. Posso te ajudar? 😊`,
  (name: string) => `Oi ${name}, tudo certo? Passando para ver se conseguiu ver minha mensagem anterior. Tenho ótimas opções que podem te interessar! 🏠`,
  (name: string) => `${name}, que tal conversarmos sobre o que você procura em um imóvel? Tenho algumas opções que podem ser perfeitas pra você! ✨`,
  (name: string) => `Oi ${name}! Ainda tenho aquelas opções incríveis para te mostrar. Tem um minutinho para conversarmos? 🌟`,
  (name: string) => `${name}, última tentativa de contato. Se ainda tiver interesse em encontrar seu imóvel ideal, me dá um sinal! Estarei à disposição 😊`,
]

type ViewMode = 'list' | 'kanban'

// ─── Lista row ─────────────────────────────────────────────────────────────────

function LeadRow({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const { advanceFollowup } = useLeadsStore()
  const { getById } = useContactsStore()
  const { properties } = usePropertiesStore()
  const property = lead.propertyId ? properties.find(p => p.id === lead.propertyId) : undefined
  const contact = lead.contactId ? getById(lead.contactId) : undefined
  const displayName = contact?.name ?? lead.name
  const displayPhone = contact?.phone ?? lead.phone
  const conf = STAGE_CONFIG[lead.funnelStage]
  const originConf = ORIGIN_CONFIG[lead.origin]
  const isDiscarded = !!lead.discardReason

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
      {/* Avatar */}
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${isDiscarded ? 'bg-slate-500/20 text-slate-500' : 'bg-gradient-to-br from-violet-500/30 to-purple-500/20 text-violet-200'}`}>
        {displayName.charAt(0).toUpperCase()}
      </div>

      {/* Name + phone */}
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

      {/* Origin */}
      <div className={`hidden md:flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border ${originConf.bg} ${originConf.color} ${originConf.border}`}>
        {originConf.emoji} {originConf.label}
      </div>

      {/* Property / Ticket */}
      <div className="hidden lg:block w-36 text-right">
        {property ? (
          <p className="text-xs text-slate-400 truncate">{property.name}</p>
        ) : lead.averageTicket ? (
          <p className="text-xs font-semibold text-violet-400">{formatCurrency(lead.averageTicket)}</p>
        ) : (
          <p className="text-xs text-slate-600">—</p>
        )}
      </div>

      {/* Followup step */}
      {lead.funnelStage === 'followup' && (
        <div className="hidden sm:flex items-center gap-1">
          {[1, 2, 3, 4, 5].map(s => (
            <div key={s} className={`w-1.5 h-1.5 rounded-full ${s <= lead.followupStep ? 'bg-blue-400' : 'bg-white/10'}`} />
          ))}
        </div>
      )}

      {/* Stage badge */}
      <span className={`hidden sm:inline-flex text-[11px] font-medium px-2 py-1 rounded-lg border ${conf.bg} ${conf.color} ${conf.border}`}>
        {conf.label}
        {lead.funnelStage === 'followup' && lead.followupStep > 0 && ` · ${lead.followupStep}ª`}
      </span>

      {/* Actions */}
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
  const { load: loadProps } = usePropertiesStore()
  const { load: loadContacts } = useContactsStore()

  const [view, setView] = useState<ViewMode>('kanban')
  const [search, setSearch] = useState('')
  const [filterStage, setFilterStage] = useState<LeadFunnelStage | null>(null)
  const [filterOrigin] = useState<LeadOrigin | null>(null)
  const [showDiscarded, setShowDiscarded] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)

  useEffect(() => {
    load()
    loadProps()
    loadContacts()
  }, [])

  const filtered = useMemo(() => {
    let result = leads

    if (!showDiscarded) result = result.filter(l => !l.discardReason)
    if (showDiscarded) result = result.filter(l => !!l.discardReason)

    if (search) {
      const q = search.toLowerCase()
      result = result.filter(l =>
        l.name.toLowerCase().includes(q) ||
        l.phone.includes(q) ||
        (l.email ?? '').toLowerCase().includes(q)
      )
    }

    if (filterStage) result = result.filter(l => l.funnelStage === filterStage)
    if (filterOrigin) result = result.filter(l => l.origin === filterOrigin)

    return result
  }, [leads, search, filterStage, filterOrigin, showDiscarded])

  const active = leads.filter(l => !l.discardReason)
  const discarded = leads.filter(l => !!l.discardReason)

  const kpis = [
    { label: 'Total Ativos', value: active.length, icon: Users, color: 'violet', gradient: 'from-violet-500/20 to-purple-500/10', border: 'border-violet-500/20', text: 'text-violet-300' },
    { label: 'Em Followup', value: active.filter(l => l.funnelStage === 'followup').length, icon: MessageCircle, color: 'blue', gradient: 'from-blue-500/20 to-sky-500/10', border: 'border-blue-500/20', text: 'text-blue-300' },
    { label: 'Em Atendimento', value: active.filter(l => l.funnelStage === 'atendimento').length, icon: Phone, color: 'violet', gradient: 'from-violet-500/20 to-purple-500/10', border: 'border-violet-500/20', text: 'text-violet-300' },
    { label: 'Vendas', value: active.filter(l => l.funnelStage === 'venda').length, icon: TrendingUp, color: 'green', gradient: 'from-green-500/20 to-emerald-500/10', border: 'border-green-500/20', text: 'text-green-300' },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-5 border-b border-white/7">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500/30 to-purple-500/20 flex items-center justify-center">
                <Users size={16} className="text-violet-300" />
              </div>
              <h1 className="text-xl font-bold text-slate-100">Leads</h1>
            </div>
            <p className="text-xs text-slate-500 mt-1 ml-10">Gerencie seu funil de prospecção</p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/leads/relatorios"
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-400 hover:text-violet-300 bg-white/3 hover:bg-violet-500/10 border border-white/8 hover:border-violet-500/25 rounded-xl transition-all"
            >
              <BarChart3 size={14} />
              <span className="hidden sm:inline">Relatórios</span>
            </Link>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-xl transition-all shadow-lg shadow-violet-500/20 active:scale-95"
            >
              <Plus size={15} />
              Novo Lead
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
          {kpis.map(kpi => (
            <div key={kpi.label} className={`bg-gradient-to-br ${kpi.gradient} border ${kpi.border} rounded-xl px-4 py-3 flex items-center gap-3`}>
              <div className={`w-8 h-8 rounded-lg bg-${kpi.color}-500/20 flex items-center justify-center flex-shrink-0`}>
                <kpi.icon size={15} className={kpi.text} />
              </div>
              <div>
                <p className={`text-xl font-bold ${kpi.text}`}>{kpi.value}</p>
                <p className="text-[11px] text-slate-500">{kpi.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex-shrink-0 px-6 py-3 border-b border-white/7 flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar lead..."
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-4 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-violet-500/40 transition-all"
          />
        </div>

        {/* Stage filter */}
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => setFilterStage(null)}
            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all ${!filterStage ? 'bg-violet-500/20 border-violet-500/30 text-violet-300' : 'bg-white/3 border-white/8 text-slate-500 hover:text-slate-300'}`}
          >
            Todas
          </button>
          {STAGES.map(s => {
            const conf = STAGE_CONFIG[s]
            return (
              <button
                key={s}
                onClick={() => setFilterStage(filterStage === s ? null : s)}
                className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all ${filterStage === s ? `${conf.bg} ${conf.border} ${conf.color}` : 'bg-white/3 border-white/8 text-slate-500 hover:text-slate-300'}`}
              >
                {conf.label}
              </button>
            )
          })}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Discard toggle */}
          <button
            onClick={() => setShowDiscarded(v => !v)}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all ${showDiscarded ? 'bg-red-500/15 border-red-500/25 text-red-300' : 'bg-white/3 border-white/8 text-slate-500 hover:text-slate-300'}`}
          >
            <Trash2 size={11} />
            <span className="hidden sm:inline">{showDiscarded ? 'Descartados' : 'Ver descartados'}</span>
            {discarded.length > 0 && <span className="font-bold">{discarded.length}</span>}
          </button>

          {/* View toggle */}
          <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-0.5">
            <button
              onClick={() => setView('list')}
              className={`p-1.5 rounded-lg transition-all ${view === 'list' ? 'bg-violet-500/20 text-violet-300' : 'text-slate-500 hover:text-slate-300'}`}
              title="Visualização em lista"
            >
              <List size={14} />
            </button>
            <button
              onClick={() => setView('kanban')}
              className={`p-1.5 rounded-lg transition-all ${view === 'kanban' ? 'bg-violet-500/20 text-violet-300' : 'text-slate-500 hover:text-slate-300'}`}
              title="Visualização Kanban"
            >
              <LayoutGrid size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <RefreshCw size={20} className="text-violet-400 animate-spin" />
              <p className="text-sm text-slate-500">Carregando leads...</p>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-violet-500/10 flex items-center justify-center">
              <Users size={28} className="text-violet-400/60" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-400">
                {showDiscarded ? 'Nenhum lead descartado' : 'Nenhum lead encontrado'}
              </p>
              <p className="text-xs text-slate-600 mt-1">
                {search || filterStage || filterOrigin ? 'Tente ajustar os filtros' : 'Clique em "Novo Lead" para começar'}
              </p>
            </div>
            {!search && !filterStage && !filterOrigin && !showDiscarded && (
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-xl transition-all shadow-lg shadow-violet-500/20"
              >
                <Plus size={14} /> Criar primeiro lead
              </button>
            )}
          </div>
        ) : view === 'kanban' ? (
          <div className="p-4">
            <LeadKanban leads={filtered} />
          </div>
        ) : (
          <div className="bg-[#1A1D27] mx-4 my-4 rounded-2xl border border-white/8 overflow-hidden">
            {/* List header */}
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

      {/* Modals */}
      <LeadForm isOpen={showForm} onClose={() => setShowForm(false)} />
      {selectedLead && (
        <LeadModal lead={selectedLead} onClose={() => setSelectedLead(null)} />
      )}
    </div>
  )
}
