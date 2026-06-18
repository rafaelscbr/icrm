import { useState, useEffect, useMemo } from 'react'
import {
  DndContext, DragOverlay, closestCenter,
  DragEndEvent, DragOverEvent, DragStartEvent,
  PointerSensor, KeyboardSensor, useSensor, useSensors,
  useDroppable,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  MessageCircle, UserCheck, GripVertical, Phone, Star, Snowflake,
  Home, Users, Mail, StickyNote, Sparkles, Smartphone, Globe, Handshake,
  Megaphone, Loader2, Wifi, WifiOff, CheckCircle2, Trophy,
} from 'lucide-react'
import { Lead, LeadFunnelStage, LeadInteractionType } from '../../types'
import { STAGE_THEME, FUNNEL_STAGES } from '../../lib/stageTheme'
import { useLeadsStore } from '../../store/useLeadsStore'
import { useAuthStore } from '../../store/useAuthStore'
import { useContactsStore } from '../../store/useContactsStore'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { useLeadInteractionsStore } from '../../store/useLeadInteractionsStore'
import { useRealtimeStatusStore } from '../../store/useRealtimeStatusStore'
import { formatPhone, formatCurrency, whatsappUrl } from '../../lib/formatters'
import { LeadModal } from './LeadModal'
import { ConcludeSaleModal } from './ConcludeSaleModal'
import { SlaBadge } from './SlaBadge'
import toast from 'react-hot-toast'

// Re-export da fonte única — consumido por LeadsPage, LeadsDashboard,
// LeadsPerformance e TransferToFunnelModal. Cores vivem em lib/stageTheme.ts.
export const STAGE_CONFIG = STAGE_THEME

const STAGES = FUNNEL_STAGES

const ORIGIN_META: Record<string, { icon: typeof Sparkles; label: string }> = {
  felicita: { icon: Sparkles,   label: 'Felicità' },
  meta_ads: { icon: Smartphone, label: 'Meta Ads' },
  portal:   { icon: Globe,      label: 'Portal' },
  offline:  { icon: Handshake,  label: 'Offline' },
  campanha: { icon: Megaphone,  label: 'Campanha' },
}

const INTERACTION_ICON: Record<string, typeof Phone> = {
  ligacao: Phone, whatsapp: MessageCircle, visita: Home,
  reuniao: Users, email: Mail, tarefa: CheckCircle2,
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

// Semântica única de cor: vermelho = precisa de ação, âmbar = atenção, neutro = ok.
// Lead contatado recentemente nunca aparece vermelho, mesmo parado na etapa.
function stageDaysColor(days: number, recentContact: boolean): string {
  if (days <= 3 || recentContact) return 'text-t4 bg-s2 border-line'
  if (days <= 7)  return 'text-warning bg-warning-bg border-warning-line'
  return 'text-error bg-error-bg border-error-line'
}

function contactLabel(days: number, hasInteraction: boolean): { text: string; cls: string } {
  const d = Math.floor(days)
  if (!hasInteraction) {
    if (d <= COOLING_DAYS) return { text: 'Sem contato registrado', cls: 'text-t4' }
    if (d <= 7)  return { text: `${d}d sem contato`, cls: 'text-warning' }
    return { text: `${d}d sem contato`, cls: 'text-error' }
  }
  if (d <= 0)  return { text: 'Contato hoje',  cls: 'text-success' }
  if (d === 1) return { text: 'Contato ontem', cls: 'text-success' }
  if (d <= COOLING_DAYS) return { text: `${d}d sem contato`, cls: 'text-t4' }
  if (d <= 7)  return { text: `${d}d sem contato`, cls: 'text-warning' }
  return { text: `${d}d sem contato`, cls: 'text-error' }
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
  lead, onClick, isOverlay = false, isSaving = false,
}: {
  lead: Lead; onClick: () => void; isOverlay?: boolean; isSaving?: boolean
}) {
  const { advanceFollowup, toggleFlag, update } = useLeadsStore()
  const { isAdmin, viewAsBrokerId, allProfiles } = useAuthStore()
  const { getById } = useContactsStore()
  const { properties } = usePropertiesStore()
  const { add: addInteraction, getForLead } = useLeadInteractionsStore()
  const [showConclude, setShowConclude] = useState(false)

  // Visão admin global: identifica o corretor responsável em cada card
  const brokerName = isAdmin && !viewAsBrokerId && lead.brokerId
    ? allProfiles.find(p => p.id === lead.brokerId)?.name
    : undefined

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
  const noContactDays = isOverlay ? 0 : daysWithoutInteraction(lastInteraction?.interactedAt, lead.createdAt)
  const stageDays = isOverlay ? 0 : daysInStage(lead.stageChangedAt, lead.createdAt)
  const stageDaysClass = stageDaysColor(stageDays, noContactDays <= COOLING_DAYS)
  const contactInfo = !isOverlay ? contactLabel(noContactDays, !!lastInteraction) : null
  const originMeta = ORIGIN_META[lead.origin]
  const LastIcon = lastInteraction ? (INTERACTION_ICON[lastInteraction.type as LeadInteractionType] ?? StickyNote) : StickyNote

  // Registra no banco e só então confirma — sem otimismo
  async function handleWhatsApp(e: React.MouseEvent) {
    e.stopPropagation()
    window.open(whatsappUrl(displayPhone), '_blank')
    const nextStep = lead.funnelStage === 'lead' ? 1 : Math.min(lead.followupStep + 1, 5)
    try {
      await advanceFollowup(lead.id)
      await addInteraction({
        leadId: lead.id,
        type: 'whatsapp',
        description: 'Interagiu via WhatsApp',
        interactedAt: new Date().toISOString(),
      })
      toast.success(`WhatsApp · ${nextStep}ª msg registrada`)
    } catch { /* erro já toastado pela camada db */ }
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
      className={`group relative border rounded-[14px] p-3 cursor-pointer kanban-card shadow-card
        transition-all duration-200 hover:translate-y-[-1px] hover:shadow-dropdown
        ${isDragging && !isOverlay ? 'opacity-30 scale-95' : ''}
        ${isOverlay ? 'shadow-modal border-brand/40' : ''}
        ${isSaving ? 'opacity-60 pointer-events-none' : ''}
        ${lead.flagged ? 'border-brand/40' : ''}
      `}
    >
      {isSaving && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[14px] bg-black/20" role="status" aria-label="Salvando">
          <Loader2 size={16} className="animate-spin text-brand" strokeWidth={1.6} />
        </div>
      )}

      <div className="absolute top-2.5 right-2.5 flex items-center gap-0.5">
        <button
          onClick={async e => {
            e.stopPropagation()
            try { await toggleFlag(lead.id) } catch { /* erro já toastado */ }
          }}
          className={`w-6 h-6 flex items-center justify-center rounded transition-all duration-150 ${
            lead.flagged
              ? 'text-brand'
              : 'text-t5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 hover:text-brand'
          }`}
          title={lead.flagged ? 'Remover prioridade' : 'Marcar prioridade máxima'}
          aria-label={lead.flagged ? 'Remover prioridade' : 'Marcar prioridade máxima'}
          aria-pressed={!!lead.flagged}
        >
          <Star size={13} strokeWidth={1.6} fill={lead.flagged ? 'currentColor' : 'none'} />
        </button>
        <div
          {...listeners}
          {...attributes}
          onClick={e => e.stopPropagation()}
          aria-label="Arrastar lead"
          className="w-6 h-6 flex items-center justify-center text-t5 hover:text-t3 cursor-grab active:cursor-grabbing transition-colors"
        >
          <GripVertical size={13} strokeWidth={1.6} />
        </div>
      </div>

      {/* SLA Meta Ads — registrar 1º contato no prazo ou o lead transfere */}
      {!isOverlay && (
        <div className="empty:hidden mb-2">
          <SlaBadge lead={lead} />
        </div>
      )}

      {/* Nome + telefone + origem */}
      <div className="flex items-start gap-2.5 pr-12 mb-2">
        <div className="w-8 h-8 rounded-[10px] bg-s2 border border-line flex items-center justify-center font-heading text-sm font-bold text-t2 flex-shrink-0">
          {displayName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-[13px] font-bold text-t1 truncate leading-tight tracking-[-0.01em]">
            {displayName}
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            {originMeta && (
              <originMeta.icon size={11} strokeWidth={1.6} className="text-t4 flex-shrink-0" aria-label={originMeta.label} />
            )}
            <span className="font-label text-[11px] text-t4 tabular-nums tracking-wide">{formatPhone(displayPhone)}</span>
            {brokerName && (
              <span
                title={`Corretor responsável: ${brokerName}`}
                className="font-label text-[11px] font-medium uppercase tracking-[0.08em] text-brand-text bg-brand-tint border border-brand/25 px-1.5 py-px rounded-full truncate max-w-[80px] flex-shrink-0"
              >
                {brokerName.split(' ')[0]}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Recência de contato — a informação de ação do corretor */}
      {contactInfo && (
        <div className="flex items-center gap-1.5 mb-2 min-w-0">
          <span className={`text-xs font-semibold flex-shrink-0 ${contactInfo.cls}`}>{contactInfo.text}</span>
          {lastInteraction && (
            <span className="flex items-center gap-1 text-[11px] text-t4 truncate min-w-0">
              <span className="flex-shrink-0">·</span>
              <LastIcon size={10} strokeWidth={1.6} className="flex-shrink-0" />
              <span className="truncate">{lastInteraction.description ?? lastInteraction.type}</span>
            </span>
          )}
          {!isOverlay && (
            <span
              title={`${stageDays} ${stageDays === 1 ? 'dia' : 'dias'} nesta etapa`}
              className={`ml-auto flex-shrink-0 font-label text-[11px] font-medium uppercase tracking-[0.08em] px-1.5 py-0.5 rounded-full border tabular-nums ${stageDaysClass}`}
            >
              {stageDays}d na etapa
            </span>
          )}
        </div>
      )}

      {/* Tentativas de followup */}
      {lead.funnelStage === 'followup' && (
        <div className="mb-2">
          <div className="flex items-center gap-1 mb-1">
            {[1, 2, 3, 4, 5].map(step => (
              <div
                key={step}
                onClick={async e => {
                  e.stopPropagation()
                  const next = lead.followupStep === step ? step - 1 : step
                  try {
                    await update(lead.id, { followupStep: next })
                    toast.success(`${next}ª tentativa marcada`)
                  } catch { /* erro já toastado */ }
                }}
                title={`Marcar ${step}ª tentativa`}
                className={`flex-1 h-2 rounded-full transition-all duration-150 cursor-pointer active:scale-95
                  ${step <= lead.followupStep
                    ? 'bg-info hover:opacity-80'
                    : 'bg-s3 hover:bg-info-bg'
                  }`}
              />
            ))}
          </div>
          <p className="font-label text-[11px] uppercase tracking-[0.08em] text-t4">
            {lead.followupStep === 0 ? 'Marcar tentativas' : `${lead.followupStep}ª de 5 tentativas`}
          </p>
        </div>
      )}

      {/* Imóvel de interesse */}
      {(property || lead.propertyName) && (
        <p className="flex items-center gap-1.5 text-xs text-t3 mb-2 min-w-0">
          <Home size={11} strokeWidth={1.6} className="text-brand flex-shrink-0" />
          <span className="truncate">{property ? property.name : lead.propertyName}</span>
        </p>
      )}

      {/* Ticket + comissão */}
      {lead.averageTicket && (
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="font-label text-xs font-semibold text-t1 tabular-nums">
            {formatCurrency(lead.averageTicket)}
          </span>
          <span className="font-label text-[11px] uppercase tracking-[0.08em] text-success bg-success-bg border border-success-line px-2 py-0.5 rounded-full tabular-nums">
            Com. {formatCurrency(lead.averageTicket * 0.02)}
          </span>
        </div>
      )}

      {isLinked && (
        <span className="inline-flex items-center gap-1 font-label text-[11px] uppercase tracking-[0.08em] text-t3 px-2 py-0.5 rounded-full border border-line mb-1">
          <UserCheck size={9} strokeWidth={1.6} /> No CRM
        </span>
      )}

      {/* Concluir venda — só na etapa Venda; tira o lead do funil e cria a venda */}
      {!isOverlay && lead.funnelStage === 'venda' && (
        <button
          onClick={e => { e.stopPropagation(); setShowConclude(true) }}
          className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 font-heading text-xs font-bold text-[#0F1730] bg-brand hover:bg-brand-dark rounded-[10px] transition-all duration-150 active:scale-[0.98]"
          title="Concluir a venda e registrar no faturamento"
        >
          <Trophy size={12} strokeWidth={1.8} />
          Concluir venda
        </button>
      )}

      {/* Ações */}
      <div className="mt-2 pt-2 border-t border-line flex items-center gap-1.5">
        <button
          onClick={handleWhatsApp}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 font-heading text-xs font-bold text-success bg-success-bg hover:bg-success hover:text-white border border-success-line rounded-[10px] transition-all duration-150 active:scale-[0.98]"
          title="Registrar contato e abrir WhatsApp"
        >
          <MessageCircle size={12} strokeWidth={1.6} />
          Registrar contato
          {lead.funnelStage === 'followup' && lead.followupStep > 0 && (
            <span className="opacity-60">· {lead.followupStep}ª</span>
          )}
        </button>
        <button
          onClick={handleWhatsAppOpen}
          className="w-7 h-7 flex items-center justify-center text-t3 hover:text-success bg-s2 hover:bg-success-bg border border-line hover:border-success-line rounded-[10px] transition-all duration-150"
          title="Só abrir WhatsApp"
          aria-label="Abrir WhatsApp sem registrar"
        >
          <MessageCircle size={12} strokeWidth={1.6} />
        </button>
        <a
          href={`tel:${displayPhone}`}
          onClick={e => e.stopPropagation()}
          className="w-7 h-7 flex items-center justify-center text-t3 hover:text-t1 bg-s2 hover:bg-s3 border border-line rounded-[10px] transition-all duration-150"
          title="Ligar"
          aria-label={`Ligar para ${displayName}`}
        >
          <Phone size={12} strokeWidth={1.6} />
        </a>
      </div>

      {showConclude && (
        <div onClick={e => e.stopPropagation()}>
          <ConcludeSaleModal lead={lead} onClose={() => setShowConclude(false)} />
        </div>
      )}
    </div>
  )
}

// ─── Coluna do kanban ─────────────────────────────────────────────────────────

function KanbanColumn({
  stage, leads, onCardClick, isActiveDragTarget, savingId,
}: {
  stage: LeadFunnelStage
  leads: Lead[]
  onCardClick: (lead: Lead) => void
  isActiveDragTarget: boolean
  savingId: string | null
}) {
  const conf = STAGE_CONFIG[stage]
  const { isOver, setNodeRef } = useDroppable({ id: stage })
  const { byLead } = useLeadInteractionsStore()
  const ids = leads.map(l => l.id)

  const totalPipeline   = leads.reduce((s, l) => s + (l.averageTicket ?? 0), 0)
  const totalCommission = totalPipeline * 0.02
  const coldCount = leads.filter(l => {
    const last = (byLead[l.id] ?? [])[0]
    return daysWithoutInteraction(last?.interactedAt, l.createdAt) > COOLING_DAYS
  }).length

  return (
    <div className="flex flex-col w-[19rem] flex-shrink-0">
      {/* Painel único preenchido — sem bordas, header integrado */}
      <div className={`flex flex-col flex-1 rounded-[18px] kanban-col transition-shadow duration-200
        ${isOver || isActiveDragTarget ? 'ring-1 ring-inset ring-brand/40' : ''}
      `}>
        <div className="flex flex-col px-4 pt-3.5 pb-2.5">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${conf.dot}`} />
            <span className="font-label text-xs font-medium uppercase tracking-[0.12em] text-t2">
              {conf.columnLabel}
            </span>
            {coldCount > 0 && (
              <span
                className="flex items-center gap-0.5 font-label text-[11px] text-info bg-info-bg px-1.5 py-px rounded-full tabular-nums"
                title={`${coldCount} ${coldCount === 1 ? 'lead' : 'leads'} sem contato há mais de ${COOLING_DAYS} dias`}
              >
                <Snowflake size={9} strokeWidth={1.6} /> {coldCount}
              </span>
            )}
            <span className="ml-auto font-label text-xs font-semibold text-t3 tabular-nums">
              {leads.length}
            </span>
          </div>
          {totalPipeline > 0 && (
            <div className="flex items-center gap-1.5 mt-1 pl-4">
              <span className="font-label text-[11px] text-t3 font-medium tabular-nums">{formatCurrency(totalPipeline)}</span>
              <span className="text-[11px] text-t5">·</span>
              <span className="font-label text-[11px] text-success tabular-nums" title="Comissão estimada (2%)">
                {formatCurrency(totalCommission)}
              </span>
            </div>
          )}
        </div>

        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div
            ref={setNodeRef}
            className={`flex-1 min-h-[420px] rounded-b-[18px] px-2.5 pb-2.5 flex flex-col gap-2.5 transition-colors duration-200
              ${isOver || isActiveDragTarget ? 'bg-[rgba(228,178,60,0.05)]' : ''}
            `}
          >
            {leads.length === 0 && (
              <div className="flex-1 flex items-center justify-center rounded-[14px] border border-dashed border-line m-0.5">
                <p className="text-xs text-t4 text-center">Arraste cards aqui</p>
              </div>
            )}
            {leads.map(lead => (
              <LeadCard key={lead.id} lead={lead} onClick={() => onCardClick(lead)} isSaving={savingId === lead.id} />
            ))}
          </div>
        </SortableContext>
      </div>
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
  const connected = useRealtimeStatusStore(s => s.connected)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<LeadFunnelStage | null>(null)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => { loadAllInteractions() }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    // Acessibilidade: mover cards por teclado (Espaço pega/solta, setas movem)
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
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

  // Banco primeiro: o card fica em "salvando" até o banco confirmar.
  // Sucesso → toast; falha → o card permanece onde estava (estado nunca mudou).
  async function handleDragEnd(event: DragEndEvent) {
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
        setSavingId(leadId)
        try {
          await setStage(leadId, newStage)
          toast.success(`Lead movido para ${STAGE_CONFIG[newStage].label}`)
        } catch { /* erro já toastado — card permanece na etapa original */ }
        finally { setSavingId(null) }
      }
      return
    }

    // Dropped on another card
    if (overId === leadId) return
    const overLead = leads.find(l => l.id === overId)
    if (!overLead) return

    const targetStage = overLead.funnelStage
    const stageLeads = sortedByStage[targetStage]

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

    setSavingId(leadId)
    try {
      // Cross-column: muda a etapa primeiro, depois a posição
      if (draggedLead.funnelStage !== targetStage) {
        await setStage(leadId, targetStage)
        toast.success(`Lead movido para ${STAGE_CONFIG[targetStage].label}`)
      }
      await reorder(leadId, orderBetween(above, below))
    } catch { /* erro já toastado — posição original mantida */ }
    finally { setSavingId(null) }
  }

  return (
    <>
      {/* Status da conexão realtime */}
      <div className="flex items-center justify-end gap-1.5 px-1 pb-2">
        {connected ? (
          <>
            <Wifi size={11} strokeWidth={1.6} className="text-success" />
            <span className="font-label text-[11px] uppercase tracking-[0.12em] text-t4">Tempo real ativo</span>
          </>
        ) : (
          <>
            <WifiOff size={11} strokeWidth={1.6} className="text-warning" />
            <span className="font-label text-[11px] uppercase tracking-[0.12em] text-warning">Reconectando…</span>
          </>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4 px-1">
          {STAGES.map(stage => (
            <KanbanColumn
              key={stage}
              stage={stage}
              leads={sortedByStage[stage]}
              onCardClick={setSelectedLead}
              isActiveDragTarget={overStage === stage && !!activeId}
              savingId={savingId}
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
