import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
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
  Sparkles, Smartphone, Globe, Handshake, Megaphone, Loader2,
  Wifi, WifiOff, Trophy, Rows2, Rows3, DollarSign,
} from 'lucide-react'
import { Lead, LeadFunnelStage } from '../../types'
import { STAGE_THEME, FUNNEL_STAGES } from '../../lib/stageTheme'
import { useLeadsStore } from '../../store/useLeadsStore'
import { useAuthStore } from '../../store/useAuthStore'
import { useContactsStore } from '../../store/useContactsStore'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { useLeadInteractionsStore } from '../../store/useLeadInteractionsStore'
import { useRealtimeStatusStore } from '../../store/useRealtimeStatusStore'
import { useTasksStore } from '../../store/useTasksStore'
import { formatPhone, formatCurrency, whatsappUrl } from '../../lib/formatters'
import { computeNextAction, URGENCY_STYLE, STAGE_CTA } from './nextAction'
import { useKanbanPrefs, SORT_LABEL, KanbanSort } from '../../store/useKanbanPrefs'
import { LeadModal } from './LeadModal'
import { ConcludeSaleModal } from './ConcludeSaleModal'
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

const COOLING_DAYS = 2

function daysWithoutInteraction(lastInteractionAt?: string, createdAt?: string): number {
  const ref = lastInteractionAt ?? createdAt ?? new Date().toISOString()
  return (Date.now() - new Date(ref).getTime()) / 86_400_000
}

function daysInStage(stageChangedAt?: string, createdAt?: string): number {
  const ref = stageChangedAt ?? createdAt ?? new Date().toISOString()
  return Math.floor((Date.now() - new Date(ref).getTime()) / 86_400_000)
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
  lead, onClick, isOverlay = false, isSaving = false, dense = false, financeMode = false,
}: {
  lead: Lead; onClick: () => void
  isOverlay?: boolean; isSaving?: boolean
  /** Densidade compacta — esconde o contexto comercial e aperta o espaçamento. */
  dense?: boolean
  /** Modo financeiro — mostra comissão em todas as etapas, não só nas finais. */
  financeMode?: boolean
}) {
  const { advanceFollowup, toggleFlag, update } = useLeadsStore()
  const { isAdmin, viewAsBrokerId, allProfiles } = useAuthStore()
  const { getById } = useContactsStore()
  const { properties } = usePropertiesStore()
  const { tasks } = useTasksStore()
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
  const stageDays = isOverlay ? 0 : daysInStage(lead.stageChangedAt, lead.createdAt)
  const originMeta = ORIGIN_META[lead.origin]

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

  // ── Próxima ação — o dado de decisão do card ──────────────────────────────
  // Vínculo direto (tasks.lead_id, migração 058). O casamento por contactId
  // continua como fallback para tarefas antigas que o backfill não conseguiu
  // desambiguar — dois leads do mesmo contato ficaram sem lead_id de propósito.
  const leadTasks = tasks.filter(t =>
    t.leadId === lead.id || (!t.leadId && !!lead.contactId && t.contactId === lead.contactId)
  )
  const next = isOverlay ? null : computeNextAction(lead, leadTasks, lastInteraction)
  const nextStyle = next ? URGENCY_STYLE[next.urgency] : null

  // Comissão só onde ajuda a priorizar: etapas finais ou modo financeiro.
  const showCommission = financeMode || lead.funnelStage === 'proposta' || lead.funnelStage === 'venda'

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      className={`group relative border rounded-[14px] cursor-pointer kanban-card shadow-card
        transition-all duration-200 hover:translate-y-[-1px] hover:shadow-dropdown
        ${dense ? 'p-2.5' : 'p-3'}
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

      {/* ── NÍVEL 1 — Identidade ─────────────────────────────────────────── */}
      <div className="flex items-start gap-2.5 pr-12">
        <div className="w-8 h-8 rounded-[10px] bg-s2 border border-line flex items-center justify-center font-heading text-sm font-bold text-t2 flex-shrink-0">
          {displayName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-[13px] font-bold text-t1 truncate leading-tight tracking-[-0.02em]">
            {displayName}
          </p>
          {/* Só o que qualifica a identidade: prioridade e responsável.
              Origem, produto e telefone desceram para o nível 3. */}
          <div className="flex items-center gap-1.5 mt-1 min-w-0">
            {lead.flagged && (
              <span className="font-label text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-text flex-shrink-0">
                Prioridade
              </span>
            )}
            {brokerName && (
              <span className="font-label text-[11px] text-t4 truncate" title={`Corretor responsável: ${brokerName}`}>
                {brokerName.split(' ')[0]}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── NÍVEL 2 — Decisão ────────────────────────────────────────────── */}
      {/* A linha mais importante do card. Risco chama atenção pela FRASE,
          não só pela cor — o ponto colorido é reforço, nunca o único sinal. */}
      {next && (
        <div className="flex items-start gap-2 mt-2.5" title={next.hint}>
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-[5px] ${nextStyle!.dot}`} aria-hidden />
          <p className={`text-xs font-semibold leading-snug min-w-0 ${nextStyle!.text}`}>
            {next.text}
          </p>
          {!isOverlay && (
            <span
              className="ml-auto flex-shrink-0 font-label text-[11px] text-t4 tabular-nums"
              title={`${stageDays} ${stageDays === 1 ? 'dia' : 'dias'} nesta etapa`}
            >
              {stageDays}d
            </span>
          )}
        </div>
      )}

      {/* Tentativas de followup — só onde a cadência existe */}
      {lead.funnelStage === 'followup' && !dense && (
        <div className="mt-2.5">
          <div className="flex items-center gap-1" role="group" aria-label={`${lead.followupStep} de 5 tentativas`}>
            {[1, 2, 3, 4, 5].map(step => (
              <button
                key={step}
                type="button"
                onClick={async e => {
                  e.stopPropagation()
                  const next = lead.followupStep === step ? step - 1 : step
                  try {
                    await update(lead.id, { followupStep: next })
                    toast.success(`${next}ª tentativa marcada`)
                  } catch { /* erro já toastado */ }
                }}
                title={`Marcar ${step}ª tentativa`}
                aria-label={`Marcar ${step}ª tentativa`}
                className={`flex-1 h-1.5 rounded-full transition-all duration-150 cursor-pointer active:scale-95
                  ${step <= lead.followupStep ? 'bg-brand hover:opacity-80' : 'bg-s3 hover:bg-brand-tint'}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── NÍVEL 3 — Contexto comercial ─────────────────────────────────── */}
      {/* Uma linha discreta, não um empilhamento de badges. Some no modo compacto. */}
      {!dense && (
        <div className="flex items-center gap-1.5 mt-2.5 min-w-0 text-[11px] text-t4">
          {originMeta && (
            <originMeta.icon size={11} strokeWidth={1.6} className="flex-shrink-0" aria-label={originMeta.label} />
          )}
          {(property || lead.propertyName) && (
            <span className="truncate">{property ? property.name : lead.propertyName}</span>
          )}
          {lead.averageTicket && (
            <>
              <span className="flex-shrink-0" aria-hidden>·</span>
              <span className="font-semibold text-t2 tabular-nums flex-shrink-0">
                {formatCurrency(lead.averageTicket)}
              </span>
            </>
          )}
          {/* Comissão só nas etapas finais ou no modo financeiro */}
          {lead.averageTicket && showCommission && (
            <span className="ml-auto flex-shrink-0 text-success tabular-nums" title="Comissão estimada (2%)">
              {formatCurrency(lead.averageTicket * 0.02)}
            </span>
          )}
          {isLinked && !lead.averageTicket && (
            <span className="ml-auto flex-shrink-0 inline-flex items-center gap-1" title="Lead vinculado a um contato do CRM">
              <UserCheck size={10} strokeWidth={1.6} /> CRM
            </span>
          )}
        </div>
      )}

      {/* ── NÍVEL 4 — Ações ──────────────────────────────────────────────── */}
      {/* Etapa Venda troca o CTA: lá o que avança o negócio é concluir a venda. */}
      <div className="mt-2.5 pt-2.5 border-t border-line flex items-center gap-1.5">
        {!isOverlay && lead.funnelStage === 'venda' && !lead.closedAt ? (
          <button
            onClick={e => { e.stopPropagation(); setShowConclude(true) }}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 font-heading text-xs font-bold text-[var(--brand-btn-text)] bg-brand hover:bg-brand-dark rounded-[10px] transition-all duration-150 active:scale-[0.98]"
            title="Concluir a venda e registrar no faturamento"
          >
            <Trophy size={12} strokeWidth={1.8} />
            Concluir venda
          </button>
        ) : (
          <button
            onClick={handleWhatsApp}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 font-heading text-xs font-bold text-success bg-success-bg hover:bg-success hover:text-white border border-success-line rounded-[10px] transition-all duration-150 active:scale-[0.98]"
            title="Abrir WhatsApp e registrar o contato na timeline"
          >
            <MessageCircle size={12} strokeWidth={1.6} />
            {STAGE_CTA[lead.funnelStage] ?? 'Registrar contato'}
            {lead.funnelStage === 'followup' && lead.followupStep > 0 && (
              <span className="opacity-60">· {lead.followupStep}ª</span>
            )}
          </button>
        )}
        <button
          onClick={handleWhatsAppOpen}
          className="w-7 h-7 flex items-center justify-center text-t3 hover:text-success bg-s2 hover:bg-success-bg border border-line hover:border-success-line rounded-[10px] transition-all duration-150 flex-shrink-0"
          title="Só abrir WhatsApp, sem registrar"
          aria-label={`Abrir WhatsApp de ${displayName} sem registrar contato`}
        >
          <MessageCircle size={12} strokeWidth={1.6} />
        </button>
        <a
          href={`tel:${displayPhone}`}
          onClick={e => e.stopPropagation()}
          className="w-7 h-7 flex items-center justify-center text-t3 hover:text-t1 bg-s2 hover:bg-s3 border border-line rounded-[10px] transition-all duration-150 flex-shrink-0"
          title={`Ligar — ${formatPhone(displayPhone)}`}
          aria-label={`Ligar para ${displayName}, ${formatPhone(displayPhone)}`}
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
  stage, leads, onCardClick, isActiveDragTarget, savingId, dense, financeMode,
}: {
  stage: LeadFunnelStage
  leads: Lead[]
  onCardClick: (lead: Lead) => void
  isActiveDragTarget: boolean
  savingId: string | null
  dense: boolean
  financeMode: boolean
}) {
  const conf = STAGE_CONFIG[stage]
  const { isOver, setNodeRef } = useDroppable({ id: stage })
  const { byLead } = useLeadInteractionsStore()
  const ids = leads.map(l => l.id)

  const totalPipeline   = leads.reduce((s, l) => s + (l.averageTicket ?? 0), 0)
  const totalCommission = totalPipeline * 0.02
  // Risco da coluna: leads sem contato além da janela de esfriamento.
  const coldCount = leads.filter(l => {
    const last = (byLead[l.id] ?? [])[0]
    return daysWithoutInteraction(last?.interactedAt, l.createdAt) > COOLING_DAYS
  }).length
  const riskPct = leads.length > 0 ? Math.round((coldCount / leads.length) * 100) : 0

  return (
    <div className="flex flex-col w-[19rem] flex-shrink-0">
      <div className={`flex flex-col flex-1 rounded-[18px] kanban-col transition-shadow duration-200
        ${isOver || isActiveDragTarget ? 'ring-1 ring-inset ring-brand/40' : ''}
      `}>
        {/* Cabeçalho fixo — acompanha a rolagem vertical da coluna */}
        <div className="sticky top-0 z-10 flex flex-col px-4 pt-3.5 pb-2.5 rounded-t-[18px] kanban-col">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${conf.dot}`} aria-hidden />
            <h3 className="font-label text-xs font-semibold uppercase tracking-[0.12em] text-t2">
              {conf.columnLabel}
            </h3>
            <span className="ml-auto font-label text-xs font-bold text-t1 tabular-nums">
              {leads.length}
            </span>
          </div>

          {/* VGV + comissão da etapa */}
          {totalPipeline > 0 && (
            <div className="flex items-center gap-1.5 mt-1.5 pl-4">
              <span className="font-label text-[11px] text-t2 font-semibold tabular-nums">{formatCurrency(totalPipeline)}</span>
              {financeMode && (
                <>
                  <span className="text-[11px] text-t5" aria-hidden>·</span>
                  <span className="font-label text-[11px] text-success tabular-nums" title="Comissão estimada (2%)">
                    {formatCurrency(totalCommission)}
                  </span>
                </>
              )}
            </div>
          )}

          {/* Indicador de risco — texto + proporção, nunca só cor */}
          {coldCount > 0 && (
            <div className="mt-2 pl-4">
              <p className="flex items-center gap-1 font-label text-[11px] text-warning tabular-nums">
                <Snowflake size={10} strokeWidth={1.6} aria-hidden />
                {coldCount} sem contato há +{COOLING_DAYS}d
              </p>
              <div
                className="mt-1 h-1 rounded-full bg-s3 overflow-hidden"
                role="progressbar" aria-valuenow={riskPct} aria-valuemin={0} aria-valuemax={100}
                aria-label={`${riskPct}% dos leads desta etapa estão sem contato`}
              >
                <div className="h-full rounded-full bg-warning" style={{ width: `${riskPct}%` }} />
              </div>
            </div>
          )}
        </div>

        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div
            ref={setNodeRef}
            className={`flex-1 min-h-[420px] rounded-b-[18px] px-2.5 pb-2.5 flex flex-col transition-colors duration-200
              ${dense ? 'gap-1.5' : 'gap-2.5'}
              ${isOver || isActiveDragTarget ? 'bg-brand-tint' : ''}
            `}
          >
            {leads.length === 0 && (
              <div className="flex-1 flex items-center justify-center rounded-[14px] border border-dashed border-line m-0.5">
                <p className="text-xs text-t4 text-center px-3">
                  Nenhum lead em {conf.label.toLowerCase()}.<br />
                  <span className="text-t5">Arraste um card para cá.</span>
                </p>
              </div>
            )}
            {leads.map(lead => (
              <LeadCard
                key={lead.id} lead={lead}
                onClick={() => onCardClick(lead)}
                isSaving={savingId === lead.id}
                dense={dense} financeMode={financeMode}
              />
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
  // Painel do lead vem da URL (?lead=<id>), igual à aba de lista — assim o
  // link é compartilhável e o voltar do navegador fecha o painel.
  const [searchParams, setSearchParams] = useSearchParams()
  const openLeadId = searchParams.get('lead')
  const selectedLead = openLeadId ? leads.find(l => l.id === openLeadId) ?? null : null
  const setSelectedLead = (l: Lead | null) => {
    const next = new URLSearchParams(searchParams)
    if (l) next.set('lead', l.id)
    else   next.delete('lead')
    setSearchParams(next, { replace: !l })
  }
  const [savingId, setSavingId] = useState<string | null>(null)
  const { dense, financeMode, sort, setDense, setFinanceMode, setSort } = useKanbanPrefs()

  useEffect(() => { loadAllInteractions() }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    // Acessibilidade: mover cards por teclado (Espaço pega/solta, setas movem)
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const sortedByStage = useMemo(() => {
    // `manual` preserva a ordenação arrastada (kanbanOrder). Os demais critérios
    // são visualizações — arrastar continua gravando a ordem manual no banco,
    // ela só volta a aparecer quando a ordenação retorna para "manual".
    const comparators: Record<KanbanSort, (a: Lead, b: Lead) => number> = {
      manual:    (a, b) => effectiveOrder(b) - effectiveOrder(a),
      prioridade:(a, b) => Number(!!b.flagged) - Number(!!a.flagged) || effectiveOrder(b) - effectiveOrder(a),
      valor:     (a, b) => (b.averageTicket ?? 0) - (a.averageTicket ?? 0),
      etapa:     (a, b) => new Date(a.stageChangedAt ?? a.createdAt).getTime()
                         - new Date(b.stageChangedAt ?? b.createdAt).getTime(),
      criacao:   (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    }
    const cmp = comparators[sort] ?? comparators.manual
    return STAGES.reduce((acc, stage) => {
      acc[stage] = leads.filter(l => l.funnelStage === stage).sort(cmp)
      return acc
    }, {} as Record<LeadFunnelStage, Lead[]>)
  }, [leads, sort])

  // Resumo do funil — compacto e derivado do que já está em tela.
  const resumo = useMemo(() => {
    const ativos = leads.filter(l => l.funnelStage !== 'venda')
    return {
      ativos: ativos.length,
      vgv: ativos.reduce((s, l) => s + (l.averageTicket ?? 0), 0),
      visitas: leads.filter(l => l.funnelStage === 'visita').length,
      propostas: leads.filter(l => l.funnelStage === 'proposta').length,
      vendas: leads.filter(l => l.funnelStage === 'venda').length,
    }
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
      {/* ── Resumo do funil + controles de visualização ────────────────────
          Compacto de propósito: é uma régua para decidir, não um segundo
          dashboard. Os números saem dos mesmos leads já renderizados. */}
      <div className="flex items-center gap-x-5 gap-y-2 flex-wrap px-1 pb-3">
        <span className="flex items-baseline gap-1.5">
          <span className="font-heading text-sm font-bold text-t1 tabular-nums">{resumo.ativos}</span>
          <span className="text-[11px] text-t4">ativos</span>
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className="font-heading text-sm font-bold text-t1 tabular-nums">{formatCurrency(resumo.vgv)}</span>
          <span className="text-[11px] text-t4">em pipeline</span>
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className="font-heading text-sm font-bold text-t2 tabular-nums">{resumo.visitas}</span>
          <span className="text-[11px] text-t4">visitas</span>
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className="font-heading text-sm font-bold text-t2 tabular-nums">{resumo.propostas}</span>
          <span className="text-[11px] text-t4">propostas</span>
        </span>

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {/* Ordenação */}
          <label className="flex items-center gap-1.5">
            <span className="sr-only">Ordenar cards por</span>
            <select
              value={sort}
              onChange={e => setSort(e.target.value as KanbanSort)}
              className="text-[11px] text-t2 bg-s2 border border-line rounded-lg px-2 py-1 cursor-pointer focus:outline-none focus:border-brand"
              title="Ordenar os cards de cada coluna"
            >
              {(Object.keys(SORT_LABEL) as KanbanSort[]).map(k => (
                <option key={k} value={k}>{SORT_LABEL[k]}</option>
              ))}
            </select>
          </label>

          {/* Densidade */}
          <button
            onClick={() => setDense(!dense)}
            aria-pressed={dense}
            title={dense ? 'Mostrar contexto comercial nos cards' : 'Compactar cards'}
            className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg border transition-colors cursor-pointer
              ${dense ? 'text-t1 bg-s3 border-line-strong' : 'text-t3 bg-s2 border-line hover:text-t1'}`}
          >
            {dense ? <Rows2 size={12} strokeWidth={1.6} /> : <Rows3 size={12} strokeWidth={1.6} />}
            {dense ? 'Compacto' : 'Completo'}
          </button>

          {/* Modo financeiro */}
          <button
            onClick={() => setFinanceMode(!financeMode)}
            aria-pressed={financeMode}
            title="Exibir comissão estimada em todos os cards e colunas"
            className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg border transition-colors cursor-pointer
              ${financeMode ? 'text-success bg-success-bg border-success-line' : 'text-t3 bg-s2 border-line hover:text-t1'}`}
          >
            <DollarSign size={12} strokeWidth={1.6} />
            Comissão
          </button>

          {/* Sincronização — discreto, como pede o briefing */}
          <span className="flex items-center gap-1.5" title={connected ? 'Sincronizado em tempo real' : 'Reconectando ao servidor'}>
            {connected
              ? <Wifi size={12} strokeWidth={1.6} className="text-success" aria-label="Tempo real ativo" />
              : <WifiOff size={12} strokeWidth={1.6} className="text-warning" aria-label="Reconectando" />}
          </span>
        </div>
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
              dense={dense} financeMode={financeMode}
              isActiveDragTarget={overStage === stage && !!activeId}
              savingId={savingId}
            />
          ))}
        </div>

        <DragOverlay>
          {activeLead ? <LeadCard lead={activeLead} onClick={() => {}} isOverlay dense={dense} /> : null}
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
