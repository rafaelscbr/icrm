import { useState } from 'react'
import {
  MessageCircle, FileText, Pencil, Trash2, Search, ChevronDown, UserPlus
} from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { EmptyState } from '../../components/ui/EmptyState'
import { LeadParecerModal } from './LeadParecerModal'
import { LeadEditModal } from './LeadEditModal'
import { CampaignLead, FunnelStage, Campaign } from '../../types'
import { useCampaignLeadsStore } from '../../store/useCampaignLeadsStore'
import { useContactsStore } from '../../store/useContactsStore'
import { FUNNEL_STAGES, SITUATION_CONFIG } from './config'
import { formatPhone, whatsappUrl } from '../../lib/formatters'
import toast from 'react-hot-toast'

interface LeadsTabProps {
  leads:    CampaignLead[]
  campaign: Campaign
}

const stageFilterOptions = [{ value: 'all', label: 'Todas as etapas' }, ...FUNNEL_STAGES.map(s => ({ value: s.value, label: s.label }))]

function StageBadge({ stage }: { stage: FunnelStage }) {
  const cfg = FUNNEL_STAGES.find(s => s.value === stage)!
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-lg ${cfg.bg} ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.short}
    </span>
  )
}

function SituationBadge({ situation }: { situation: CampaignLead['situation'] }) {
  if (!situation) return null
  const cfg = SITUATION_CONFIG.find(s => s.value === situation)!
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-lg ${cfg.bg} ${cfg.color}`}>
      {cfg.label}
    </span>
  )
}

export function LeadsTab({ leads, campaign }: LeadsTabProps) {
  const { remove, markContacted } = useCampaignLeadsStore()
  const { contacts, add: addContact } = useContactsStore()
  const [search,       setSearch]       = useState('')
  const [stageFilter,  setStageFilter]  = useState<FunnelStage | 'all'>('all')
  const [parecerLead,  setParecerLead]  = useState<CampaignLead | undefined>()
  const [editLead,     setEditLead]     = useState<CampaignLead | undefined>()
  const [deleteLead,   setDeleteLead]   = useState<CampaignLead | undefined>()

  const filtered = leads.filter(l => {
    const matchSearch = !search.trim() || l.name.toLowerCase().includes(search.toLowerCase()) || l.phone.includes(search)
    const matchStage  = stageFilter === 'all' || l.funnelStage === stageFilter
    return matchSearch && matchStage
  })

  function handleWhatsApp(lead: CampaignLead) {
    const msg = campaign.message.replace(/\{nome\}/gi, lead.name)
    window.open(whatsappUrl(lead.phone, msg), '_blank')
    const wasNew = lead.funnelStage === 'new'
    markContacted(lead.id)
    if (wasNew) toast.success('1ª mensagem enviada e registrada no funil!')
  }

  function handleConvertToContact(lead: CampaignLead) {
    const digits = lead.phone.replace(/\D/g, '')
    const exists = contacts.some(c => c.phone.replace(/\D/g, '') === digits)
    if (exists) {
      toast.error('Já existe um contato com esse telefone.')
      return
    }
    addContact({
      name: lead.name,
      phone: lead.phone,
      tags: [],
      hasChildren: false,
      isMarried: false,
    })
    toast.success(`${lead.name} adicionado aos contatos!`)
  }

  function handleDelete() {
    if (!deleteLead) return
    remove(deleteLead.id)
    toast.success('Lead removido')
    setDeleteLead(undefined)
  }

  // Summary chips
  const total      = leads.length
  const contacted  = leads.filter(l => l.firstContactAt).length
  const attending  = leads.filter(l => ['attended', 'presentation', 'proposal', 'sale'].includes(l.funnelStage)).length
  const proposals  = leads.filter(l => l.funnelStage === 'proposal').length
  const sales      = leads.filter(l => l.funnelStage === 'sale').length

  return (
    <div className="flex flex-col gap-4">
      {/* Summary chips */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'Total',       value: total,     color: 'text-slate-400',  bg: 'bg-white/5'         },
          { label: 'Acionados',   value: contacted, color: 'text-blue-400',   bg: 'bg-blue-500/10'     },
          { label: 'Atendendo',   value: attending, color: 'text-cyan-400',   bg: 'bg-cyan-500/10'     },
          { label: 'Propostas',   value: proposals, color: 'text-amber-400',  bg: 'bg-amber-500/10'    },
          { label: 'Vendas',      value: sales,     color: 'text-green-400',  bg: 'bg-green-500/10'    },
        ].map(s => (
          <div key={s.label} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl ${s.bg} border border-white/8`}>
            <span className={`text-sm font-bold tabular-nums ${s.color}`}>{s.value}</span>
            <span className="text-xs text-slate-500">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome ou telefone..."
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />
        </div>
        <div className="relative">
          <select
            value={stageFilter}
            onChange={e => setStageFilter(e.target.value as FunnelStage | 'all')}
            className="appearance-none bg-white/5 border border-white/10 rounded-xl pl-3 pr-8 py-2.5 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
          >
            {stageFilterOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Search size={24} />}
          title={search || stageFilter !== 'all' ? 'Nenhum lead encontrado' : 'Nenhum lead importado'}
          description={search || stageFilter !== 'all' ? 'Tente ajustar os filtros.' : 'Importe uma lista XLSX para começar.'}
        />
      ) : (
        <Card className="!p-0 overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_140px_160px_160px_120px] gap-0 px-5 py-3 border-b border-white/8 text-xs text-slate-600 uppercase tracking-wider font-medium">
            <span>Nome</span>
            <span>Telefone</span>
            <span>Etapa</span>
            <span>Situação</span>
            <span className="text-right">Ações</span>
          </div>

          <div className="divide-y divide-white/5">
            {filtered.map(lead => (
              <div key={lead.id} className="grid grid-cols-[1fr_140px_160px_160px_120px] gap-0 px-5 py-3.5 items-center hover:bg-white/3 transition-colors group">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">{lead.name}</p>
                  {lead.email && <p className="text-xs text-slate-600 truncate">{lead.email}</p>}
                </div>
                <span className="text-sm text-slate-400 tabular-nums">{formatPhone(lead.phone)}</span>
                <span><StageBadge stage={lead.funnelStage} /></span>
                <span>{lead.situation ? <SituationBadge situation={lead.situation} /> : <span className="text-xs text-slate-700">—</span>}</span>
                <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleWhatsApp(lead)}
                    className="p-1.5 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-400 transition-colors cursor-pointer"
                    title="Abrir WhatsApp"
                  >
                    <MessageCircle size={13} />
                  </button>
                  <button
                    onClick={() => setParecerLead(lead)}
                    className="p-1.5 rounded-lg hover:bg-indigo-500/10 text-slate-600 hover:text-indigo-400 transition-colors cursor-pointer"
                    title="Parecer"
                  >
                    <FileText size={13} />
                  </button>
                  <button
                    onClick={() => setEditLead(lead)}
                    className="p-1.5 rounded-lg hover:bg-white/8 text-slate-600 hover:text-slate-300 transition-colors cursor-pointer"
                    title="Editar"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => handleConvertToContact(lead)}
                    className="p-1.5 rounded-lg hover:bg-indigo-500/10 text-slate-600 hover:text-indigo-400 transition-colors cursor-pointer"
                    title="Converter em contato"
                  >
                    <UserPlus size={13} />
                  </button>
                  <button
                    onClick={() => setDeleteLead(lead)}
                    className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-colors cursor-pointer"
                    title="Excluir"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <LeadParecerModal isOpen={Boolean(parecerLead)} onClose={() => setParecerLead(undefined)} lead={parecerLead} campaign={campaign} />
      <LeadEditModal    isOpen={Boolean(editLead)}    onClose={() => setEditLead(undefined)}    lead={editLead} />

      <Modal isOpen={Boolean(deleteLead)} onClose={() => setDeleteLead(undefined)} title="Remover lead" size="sm">
        <p className="text-sm text-slate-400 mb-6">
          Remover <span className="text-slate-200 font-medium">"{deleteLead?.name}"</span> desta campanha?
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setDeleteLead(undefined)}>Cancelar</Button>
          <Button variant="danger"    className="flex-1" onClick={handleDelete}>Remover</Button>
        </div>
      </Modal>
    </div>
  )
}
