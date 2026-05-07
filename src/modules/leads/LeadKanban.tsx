import { useState } from 'react'
import {
  DndContext, DragOverlay, useDraggable, useDroppable,
  closestCenter, DragEndEvent, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import { MessageCircle, UserCheck, GripVertical, Phone } from 'lucide-react'
import { Lead, LeadFunnelStage } from '../../types'
import { useLeadsStore } from '../../store/useLeadsStore'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { formatPhone, formatCurrency, whatsappUrl } from '../../lib/formatters'
import { LeadModal } from './LeadModal'
import toast from 'react-hot-toast'

export const STAGE_CONFIG: Record<LeadFunnelStage, {
  label: string; color: string; bg: string; border: string;
  headerBg: string; headerText: string; dot: string;
}> = {
  lead:        { label: 'Leads',        color: 'text-slate-300',  bg: 'bg-slate-500/8',   border: 'border-slate-500/20', headerBg: 'bg-slate-500/15',  headerText: 'text-slate-200',  dot: 'bg-slate-400'   },
  followup:    { label: 'Followup',     color: 'text-blue-300',   bg: 'bg-blue-500/8',    border: 'border-blue-500/20',  headerBg: 'bg-blue-500/15',   headerText: 'text-blue-200',   dot: 'bg-blue-400'    },
  atendimento: { label: 'Atendimento',  color: 'text-violet-300', bg: 'bg-violet-500/8',  border: 'border-violet-500/20',headerBg: 'bg-violet-500/15', headerText: 'text-violet-200', dot: 'bg-violet-400'  },
  visita:      { label: 'Visita',       color: 'text-amber-300',  bg: 'bg-amber-500/8',   border: 'border-amber-500/20', headerBg: 'bg-amber-500/15',  headerText: 'text-amber-200',  dot: 'bg-amber-400'   },
  proposta:    { label: 'Proposta',     color: 'text-orange-300', bg: 'bg-orange-500/8',  border: 'border-orange-500/20',headerBg: 'bg-orange-500/15', headerText: 'text-orange-200', dot: 'bg-orange-400'  },
  venda:       { label: 'Venda',        color: 'text-green-300',  bg: 'bg-green-500/8',   border: 'border-green-500/20', headerBg: 'bg-green-500/15',  headerText: 'text-green-200',  dot: 'bg-green-400'   },
}

const STAGES: LeadFunnelStage[] = ['lead', 'followup', 'atendimento', 'visita', 'proposta', 'venda']

const FOLLOWUP_MESSAGES = [
  (name: string) => `Olá ${name}! Tudo bem? Sou o Rafael, da Souza Imobiliária. Vi que você tem interesse em imóveis. Posso te ajudar? 😊`,
  (name: string) => `Oi ${name}, tudo certo? Passando para ver se conseguiu ver minha mensagem anterior. Tenho ótimas opções que podem te interessar! 🏠`,
  (name: string) => `${name}, que tal conversarmos sobre o que você procura em um imóvel? Tenho algumas opções que podem ser perfeitas pra você! ✨`,
  (name: string) => `Oi ${name}! Ainda tenho aquelas opções incríveis para te mostrar. Tem um minutinho para conversarmos? 🌟`,
  (name: string) => `${name}, última tentativa de contato. Se ainda tiver interesse em encontrar seu imóvel ideal, me dá um sinal! Estarei à disposição 😊`,
]

const ORIGIN_EMOJI: Record<string, string> = {
  felicita: '✨', meta_ads: '📱', portal: '🌐', offline: '🤝',
}

// ─── Card draggável ───────────────────────────────────────────────────────────

function LeadCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const { advanceFollowup } = useLeadsStore()
  const { properties } = usePropertiesStore()
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id })

  const property = lead.propertyId ? properties.find(p => p.id === lead.propertyId) : undefined
  const firstName = lead.name.split(' ')[0]

  function getWhatsAppMessage() {
    if (lead.funnelStage === 'followup' && lead.followupStep >= 1 && lead.followupStep <= 5) {
      return FOLLOWUP_MESSAGES[lead.followupStep - 1](firstName)
    }
    return FOLLOWUP_MESSAGES[0](firstName)
  }

  function handleWhatsApp(e: React.MouseEvent) {
    e.stopPropagation()
    const msg = getWhatsAppMessage()
    const url = whatsappUrl(lead.phone, msg)
    window.open(url, '_blank')
    advanceFollowup(lead.id)
    const nextStep = lead.funnelStage === 'lead' ? 1 : Math.min(lead.followupStep + 1, 5)
    toast.success(`WhatsApp · ${nextStep}ª msg enviada`)
  }

  const isConverted = !!lead.contactId

  return (
    <div
      ref={setNodeRef}
      onClick={onClick}
      className={`group relative bg-[#1A1D27] border rounded-xl p-3 cursor-pointer transition-all duration-150 hover:border-white/20 hover:shadow-lg hover:shadow-black/20 hover:translate-y-[-1px] active:scale-[0.98]
        ${isDragging ? 'opacity-40 scale-95' : ''}
        ${lead.funnelStage === 'venda' ? 'border-green-500/25 bg-green-500/5' : 'border-white/10'}
        ${isConverted ? 'border-violet-500/25' : ''}
      `}
    >
      {/* Drag handle */}
      <div
        {...listeners}
        {...attributes}
        onClick={e => e.stopPropagation()}
        className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center text-slate-700 hover:text-slate-400 cursor-grab active:cursor-grabbing transition-colors"
      >
        <GripVertical size={12} />
      </div>

      {/* Name + origin */}
      <div className="flex items-start gap-2 pr-6 mb-2">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500/30 to-purple-500/20 flex items-center justify-center text-xs font-bold text-violet-200 flex-shrink-0">
          {lead.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-200 truncate leading-tight">{lead.name}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px] text-slate-600">{ORIGIN_EMOJI[lead.origin]}</span>
            <span className="text-[10px] text-slate-500">{formatPhone(lead.phone)}</span>
          </div>
        </div>
      </div>

      {/* Followup progress */}
      {lead.funnelStage === 'followup' && (
        <div className="mb-2">
          <div className="flex items-center gap-1 mb-1">
            {[1, 2, 3, 4, 5].map(step => (
              <div
                key={step}
                className={`flex-1 h-1 rounded-full transition-all ${step <= lead.followupStep ? 'bg-blue-400' : 'bg-white/10'}`}
              />
            ))}
          </div>
          <p className="text-[10px] text-blue-400/70">
            {lead.followupStep === 0 ? 'Aguardando 1ª msg' : `${lead.followupStep}ª de 5 msgs`}
          </p>
        </div>
      )}

      {/* Property */}
      {property && (
        <p className="text-[11px] text-slate-500 mb-2 truncate flex items-center gap-1">
          🏠 <span className="truncate">{property.name}</span>
        </p>
      )}

      {/* Ticket */}
      {lead.averageTicket && (
        <p className="text-[11px] font-semibold text-violet-400 mb-2">
          {formatCurrency(lead.averageTicket)}
        </p>
      )}

      {/* Badges */}
      <div className="flex items-center gap-1 flex-wrap">
        {isConverted && (
          <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-300 border border-green-500/20">
            <UserCheck size={8} /> Contato
          </span>
        )}
      </div>

      {/* WhatsApp button */}
      <div className="mt-2 pt-2 border-t border-white/5 flex items-center gap-1.5">
        <button
          onClick={handleWhatsApp}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium text-green-300 hover:text-white bg-green-500/10 hover:bg-green-500 border border-green-500/20 hover:border-green-500 rounded-lg transition-all active:scale-95"
        >
          <MessageCircle size={11} />
          WhatsApp
          {lead.funnelStage === 'followup' && lead.followupStep > 0 && (
            <span className="opacity-60">· {lead.followupStep}ª</span>
          )}
        </button>
        <a
          href={`tel:${lead.phone}`}
          onClick={e => e.stopPropagation()}
          className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-200 bg-white/3 hover:bg-white/8 border border-white/8 rounded-lg transition-all"
        >
          <Phone size={11} />
        </a>
      </div>
    </div>
  )
}

// ─── Overlay card (durante drag) ──────────────────────────────────────────────

function DragCard({ lead }: { lead: Lead }) {
  return (
    <div className="bg-[#1A1D27] border border-violet-500/40 rounded-xl p-3 shadow-2xl shadow-violet-500/20 w-64 rotate-2 opacity-95">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500/30 to-purple-500/20 flex items-center justify-center text-xs font-bold text-violet-200">
          {lead.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-medium text-slate-200">{lead.name}</p>
          <p className="text-[10px] text-slate-500">{formatPhone(lead.phone)}</p>
        </div>
      </div>
    </div>
  )
}

// ─── Coluna do kanban ─────────────────────────────────────────────────────────

function KanbanColumn({
  stage, leads, onCardClick,
}: {
  stage: LeadFunnelStage
  leads: Lead[]
  onCardClick: (lead: Lead) => void
}) {
  const conf = STAGE_CONFIG[stage]
  const { isOver, setNodeRef } = useDroppable({ id: stage })

  return (
    <div className="flex flex-col w-72 flex-shrink-0">
      {/* Header */}
      <div className={`flex items-center gap-2 px-3 py-2.5 rounded-t-xl border border-b-0 ${conf.headerBg} ${conf.border}`}>
        <div className={`w-2 h-2 rounded-full ${conf.dot}`} />
        <span className={`text-sm font-semibold ${conf.headerText}`}>{conf.label}</span>
        <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${conf.bg} ${conf.color} border ${conf.border}`}>
          {leads.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[400px] rounded-b-xl border ${conf.border} ${conf.bg} p-2 flex flex-col gap-2 transition-all duration-150
          ${isOver ? 'ring-2 ring-inset ring-white/20 bg-white/5' : ''}
        `}
      >
        {leads.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-slate-600 text-center">Arraste cards aqui</p>
          </div>
        )}
        {leads.map(lead => (
          <LeadCard key={lead.id} lead={lead} onClick={() => onCardClick(lead)} />
        ))}
      </div>
    </div>
  )
}

// ─── Kanban principal ─────────────────────────────────────────────────────────

interface LeadKanbanProps {
  leads: Lead[]
}

export function LeadKanban({ leads }: LeadKanbanProps) {
  const { setStage } = useLeadsStore()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const activeLead = activeId ? leads.find(l => l.id === activeId) : null

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    if (!over) return
    const leadId = String(active.id)
    const newStage = String(over.id) as LeadFunnelStage
    const lead = leads.find(l => l.id === leadId)
    if (!lead || lead.funnelStage === newStage) return
    setStage(leadId, newStage)
    toast.success(`Lead movido para ${STAGE_CONFIG[newStage].label}`)
  }

  const byStage = STAGES.reduce((acc, stage) => {
    acc[stage] = leads.filter(l => l.funnelStage === stage)
    return acc
  }, {} as Record<LeadFunnelStage, Lead[]>)

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={e => setActiveId(String(e.active.id))}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-3 overflow-x-auto pb-4 px-1">
          {STAGES.map(stage => (
            <KanbanColumn
              key={stage}
              stage={stage}
              leads={byStage[stage]}
              onCardClick={setSelectedLead}
            />
          ))}
        </div>

        <DragOverlay>
          {activeLead ? <DragCard lead={activeLead} /> : null}
        </DragOverlay>
      </DndContext>

      {selectedLead && (
        <LeadModal
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
        />
      )}
    </>
  )
}
