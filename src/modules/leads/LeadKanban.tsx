import { useState, useEffect, useMemo } from 'react'
import {
  DndContext, DragOverlay, closestCenter,
  DragEndEvent, DragOverEvent, DragStartEvent,
  PointerSensor, useSensor, useSensors,
  useDroppable,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { MessageCircle, UserCheck, GripVertical, Phone, Flame, Snowflake } from 'lucide-react'
import { Lead, LeadFunnelStage } from '../../types'
import { useLeadsStore } from '../../store/useLeadsStore'
import { useContactsStore } from '../../store/useContactsStore'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { useLeadInteractionsStore } from '../../store/useLeadInteractionsStore'
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

const ORIGIN_EMOJI: Record<string, string> = {
  felicita: '✨', meta_ads: '📱', portal: '🌐', offline: '🤝', campanha: '📣',
}

const COOLING_DAYS = 2

function daysWithoutInteraction(lastInteractionAt?: string, createdAt?: string): number {
  const ref = lastInteractionAt ?? createdAt ?? new Date().toISOString()
  return (Date.now() - new Date(ref).getTime()) / 86_400_000
}

function daysInStage(stageChangedAt?: string, createdAt?: string): number {
  const ref = stageChangedAt ?? createdAt ?? new Date().toISOString()
  return Math.floor((Date.now() - new Date(ref).getTime()) / 86_400_000)
}

function stageDaysColor(days: number): string {
  if (days <= 3)  return 'text-slate-500 bg-slate-500/10 border-slate-500/20'
  if (days <= 7)  return 'text-amber-400 bg-amber-500/10 border-amber-500/25'
  return 'text-red-400 bg-red-500/10 border-red-500/25'
}

function effectiveOrder(lead: Lead): number {
  return lead.kanbanOrder ?? new Date(lead.updatedAt).getTime()
}

function orderBetween(above: Lead | null, below: Lead | null): number {
  const a = above ? effectiveOrder(above) : Date.now() + 1_000_000
  const b = below ? effectiveOrder(below) : 0
  return (a + b) / 2
}

// ─── Card sortável ────────────────────────────────────────────────────────────

function LeadCard({
  lead, onClick, isOverlay = false,
}: {
  lead: Lead; onClick: () => void; isOverlay?: boolean
}) {
  const { advanceFollowup, toggleFlag } = useLeadsStore()
  const { getById } = useContactsStore()
  const { properties } = usePropertiesStore()
  const { add: addInteraction, getForLead } = useLeadInteractionsStore()

  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: lead.id })

  const style = isOverlay ? {} : {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const property = lead.propertyId ? properties.find(p => p.id === lead.propertyId) : undefined
  const contact = lead.contactId ? getById(lead.contactId) : undefined
  const displayName = contact?.name ?? lead.name
  const displayPhone = contact?.phone ?? lead.phone
  const interactions = getForLead(lead.id)
  const lastInteraction = interactions[0] ?? null
  const isCooling = !isOverlay && daysWithoutInteraction(lastInteraction?.interactedAt, lead.createdAt) > COOLING_DAYS
  const stageDays = isOverlay ? 0 : daysInStage(lead.stageChangedAt, lead.createdAt)
  const stageDaysClass = stageDaysColor(stageDays)

  function handleWhatsApp(e: React.MouseEvent) {
    e.stopPropagation()
    window.open(whatsappUrl(displayPhone), '_blank')
    advanceFollowup(lead.id)
    const nextStep = lead.funnelStage === 'lead' ? 1 : Math.min(lead.followupStep + 1, 5)
    addInteraction({
      leadId: lead.id,
      type: 'whatsapp',
      description: 'Interagiu via WhatsApp',
      interactedAt: new Date().toISOString(),
    })
    toast.success(`WhatsApp · ${nextStep}ª msg registrada`)
  }

  function handleWhatsAppOpen(e: React.MouseEvent) {
    e.stopPropagation()
    window.open(whatsappUrl(displayPhone), '_blank')
  }

  const isLinked = !!lead.contactId

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      className={`group relative border rounded-xl p-3 cursor-pointer transition-all duration-150 hover:translate-y-[-1px] active:scale-[0.98]
        ${isDragging && !isOverlay ? 'opacity-30 scale-95' : ''}
        ${isOverlay ? 'rotate-1 shadow-2xl shadow-amber-500/15 border-amber-500/40' : ''}
        ${lead.flagged
          ? 'bg-gradient-to-br from-orange-500/10 to-red-500/5 border-orange-500/50 shadow-lg shadow-orange-500/10 hover:border-orange-500/70 hover:shadow-orange-500/20'
          : lead.funnelStage === 'venda'
            ? 'bg-green-500/5 border-green-500/25 hover:border-white/20 hover:shadow-lg hover:shadow-black/20'
            : isLinked
              ? 'bg-[#0E1420] border-violet-500/25 hover:border-white/20 hover:shadow-lg hover:shadow-black/30'
              : 'bg-[#0E1420] border-white/10 hover:border-white/20 hover:shadow-lg hover:shadow-black/30'
        }
      `}
    >
      {lead.flagged && (
        <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/50 z-10">
          <Flame size={10} className="text-white" />
        </div>
      )}
      {isCooling && (
        <div className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-sky-500 flex items-center justify-center shadow-lg shadow-sky-500/50 z-10" title="Sem interação há +2 dias">
          <Snowflake size={10} className="text-white" />
        </div>
      )}

      <div className="absolute top-2 right-2 flex items-center gap-0.5">
        <button
          onClick={e => { e.stopPropagation(); toggleFlag(lead.id) }}
          className={`w-5 h-5 flex items-center justify-center rounded transition-all ${
            lead.flagged
              ? 'text-orange-400 hover:text-orange-300'
              : 'text-slate-700 opacity-0 group-hover:opacity-100 hover:text-orange-400'
          }`}
          title={lead.flagged ? 'Remover prioridade' : 'Marcar prioridade máxima'}
        >
          <Flame size={11} />
        </button>
        <div
          {...listeners}
          {...attributes}
          onClick={e => e.stopPropagation()}
          className="w-5 h-5 flex items-center justify-center text-slate-700 hover:text-slate-400 cursor-grab active:cursor-grabbing transition-colors"
        >
          <GripVertical size={12} />
        </div>
      </div>

      <div className="flex items-start gap-2 pr-12 mb-2">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-slate-600/40 to-slate-700/20 border border-white/10 flex items-center justify-center text-sm font-black text-slate-300 flex-shrink-0">
          {displayName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-white truncate leading-tight">{displayName}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px] text-slate-600">{ORIGIN_EMOJI[lead.origin]}</span>
            <span className="text-[10px] text-slate-600 tabular-nums">{formatPhone(displayPhone)}</span>
            {!isOverlay && (
              <span className={`ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded border tabular-nums ${stageDaysClass}`}>
                {stageDays}d
              </span>
            )}
          </div>
        </div>
      </div>

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

      {(property || lead.propertyName) && (
        <p className={`text-[11px] mb-2 truncate flex items-center gap-1 ${lead.propertyName && !property ? 'text-amber-400/70' : 'text-slate-500'}`}>
          🏠 <span className="truncate">{property ? property.name : lead.propertyName}</span>
        </p>
      )}

      {lead.averageTicket && (
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-semibold text-violet-400">
            {formatCurrency(lead.averageTicket)}
          </span>
          <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/15 font-medium tabular-nums">
            💰 {formatCurrency(lead.averageTicket * 0.02)}
          </span>
        </div>
      )}

      {lastInteraction && (
        <p className="text-[10px] text-slate-600 mb-2 truncate leading-snug">
          {lastInteraction.type === 'ligacao' ? '📞' : lastInteraction.type === 'whatsapp' ? '💬' : lastInteraction.type === 'visita' ? '🏠' : lastInteraction.type === 'reuniao' ? '🤝' : lastInteraction.type === 'email' ? '📧' : '📝'}{' '}
          {lastInteraction.description ?? lastInteraction.type}
        </p>
      )}

      {isLinked && (
        <div className="flex items-center gap-1 flex-wrap mb-1">
          <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/20">
            <UserCheck size={8} /> No CRM
          </span>
        </div>
      )}

      <div className="mt-2 pt-2 border-t border-white/5 flex items-center gap-1.5">
        <button
          onClick={handleWhatsApp}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium text-green-300 hover:text-white bg-green-500/10 hover:bg-green-500 border border-green-500/20 hover:border-green-500 rounded-lg transition-all active:scale-95"
          title="Registrar e abrir WhatsApp"
        >
          <MessageCircle size={11} />
          Registrar
          {lead.funnelStage === 'followup' && lead.followupStep > 0 && (
            <span className="opacity-60">· {lead.followupStep}ª</span>
          )}
        </button>
        <button
          onClick={handleWhatsAppOpen}
          className="w-7 h-7 flex items-center justify-center text-green-500/70 hover:text-green-300 bg-white/3 hover:bg-green-500/10 border border-white/10 hover:border-green-500/20 rounded-lg transition-all"
          title="Só abrir WhatsApp"
        >
          <MessageCircle size={11} />
        </button>
        <a
          href={`tel:${displayPhone}`}
          onClick={e => e.stopPropagation()}
          className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-200 bg-white/3 hover:bg-white/8 border border-white/10 rounded-lg transition-all"
        >
          <Phone size={11} />
        </a>
      </div>
    </div>
  )
}

// ─── Coluna do kanban ─────────────────────────────────────────────────────────

function KanbanColumn({
  stage, leads, onCardClick, isActiveDragTarget,
}: {
  stage: LeadFunnelStage
  leads: Lead[]
  onCardClick: (lead: Lead) => void
  isActiveDragTarget: boolean
}) {
  const conf = STAGE_CONFIG[stage]
  const { isOver, setNodeRef } = useDroppable({ id: stage })
  const ids = leads.map(l => l.id)

  const totalPipeline  = leads.reduce((s, l) => s + (l.averageTicket ?? 0), 0)
  const totalCommission = totalPipeline * 0.02

  return (
    <div className="flex flex-col w-72 flex-shrink-0">
      <div className={`flex flex-col px-3 py-2.5 rounded-t-xl border border-b-0 ${conf.headerBg} ${conf.border}`}>
        <div className="flex items-center gap-2.5">
          <div className={`w-2 h-2 rounded-full ${conf.dot} shadow-sm flex-shrink-0`} />
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Etapa</p>
            <span className={`text-sm font-bold leading-tight ${conf.headerText}`}>{conf.label}</span>
          </div>
          <span className={`text-xs font-black px-2.5 py-1 rounded-lg ${conf.bg} ${conf.color} border ${conf.border} tabular-nums`}>
            {leads.length}
          </span>
        </div>
        {totalPipeline > 0 && (
          <div className="flex items-center gap-1.5 mt-1.5 pl-4">
            <span className="text-[10px] text-violet-400 font-semibold tabular-nums">{formatCurrency(totalPipeline)}</span>
            <span className="text-[10px] text-slate-600">·</span>
            <span className="text-[10px] text-emerald-400 font-semibold tabular-nums">💰 {formatCurrency(totalCommission)}</span>
          </div>
        )}
      </div>

      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={`flex-1 min-h-[420px] rounded-b-xl border ${conf.border} page-bg p-2 flex flex-col gap-2 transition-all duration-150
            ${isOver || isActiveDragTarget ? 'ring-1 ring-inset ring-white/15 bg-white/3' : ''}
          `}
        >
          {leads.length === 0 && (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-[11px] text-slate-700 text-center">Arraste cards aqui</p>
            </div>
          )}
          {leads.map(lead => (
            <LeadCard key={lead.id} lead={lead} onClick={() => onCardClick(lead)} />
          ))}
        </div>
      </SortableContext>
    </div>
  )
}

// ─── Kanban principal ─────────────────────────────────────────────────────────

interface LeadKanbanProps {
  leads: Lead[]
}

export function LeadKanban({ leads }: LeadKanbanProps) {
  const { setStage, reorder } = useLeadsStore()
  const { loadAll: loadAllInteractions } = useLeadInteractionsStore()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<LeadFunnelStage | null>(null)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)

  useEffect(() => { loadAllInteractions() }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  // Ordena cada coluna por kanbanOrder desc (ou updatedAt como fallback)
  const sortedByStage = useMemo(() => {
    return STAGES.reduce((acc, stage) => {
      acc[stage] = leads
        .filter(l => l.funnelStage === stage)
        .sort((a, b) => effectiveOrder(b) - effectiveOrder(a))
      return acc
    }, {} as Record<LeadFunnelStage, Lead[]>)
  }, [leads])

  const activeLead = activeId ? leads.find(l => l.id === activeId) : null

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function handleDragOver(event: DragOverEvent) {
    const { over } = event
    if (!over) { setOverStage(null); return }
    const overId = String(over.id)
    if (STAGES.includes(overId as LeadFunnelStage)) {
      setOverStage(overId as LeadFunnelStage)
    } else {
      const overLead = leads.find(l => l.id === overId)
      setOverStage(overLead?.funnelStage ?? null)
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    setOverStage(null)
    if (!over) return

    const leadId = String(active.id)
    const overId = String(over.id)
    const draggedLead = leads.find(l => l.id === leadId)
    if (!draggedLead) return

    // Dropped on a stage column (empty area)
    if (STAGES.includes(overId as LeadFunnelStage)) {
      const newStage = overId as LeadFunnelStage
      if (draggedLead.funnelStage !== newStage) {
        setStage(leadId, newStage)
        toast.success(`Lead movido para ${STAGE_CONFIG[newStage].label}`)
      }
      return
    }

    // Dropped on another card
    if (overId === leadId) return
    const overLead = leads.find(l => l.id === overId)
    if (!overLead) return

    const targetStage = overLead.funnelStage
    const stageLeads = sortedByStage[targetStage]

    // Cross-column: change stage first
    if (draggedLead.funnelStage !== targetStage) {
      setStage(leadId, targetStage)
      toast.success(`Lead movido para ${STAGE_CONFIG[targetStage].label}`)
    }

    // Compute new order based on neighbors in target column
    const activeIndex = stageLeads.findIndex(l => l.id === leadId)
    const overIndex = stageLeads.findIndex(l => l.id === overId)

    let newArr: Lead[]
    if (activeIndex === -1) {
      // Cross-column: insert at overIndex
      newArr = [
        ...stageLeads.slice(0, overIndex),
        draggedLead,
        ...stageLeads.slice(overIndex),
      ]
    } else {
      newArr = arrayMove(stageLeads, activeIndex, overIndex)
    }

    const newIndex = newArr.findIndex(l => l.id === leadId)
    const above = newIndex > 0 ? newArr[newIndex - 1] : null
    const below = newIndex < newArr.length - 1 ? newArr[newIndex + 1] : null
    reorder(leadId, orderBetween(above, below))
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-3 overflow-x-auto pb-4 px-1">
          {STAGES.map(stage => (
            <KanbanColumn
              key={stage}
              stage={stage}
              leads={sortedByStage[stage]}
              onCardClick={setSelectedLead}
              isActiveDragTarget={overStage === stage && !!activeId}
            />
          ))}
        </div>

        <DragOverlay>
          {activeLead ? <LeadCard lead={activeLead} onClick={() => {}} isOverlay /> : null}
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
