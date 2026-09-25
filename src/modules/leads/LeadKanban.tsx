import { useState, useMemo } from 'react'
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
  MessageCircle, UserCheck, GripVertical, Phone, Star, Snowflake, Loader2,
  Wifi, WifiOff, Trophy, Rows2, Rows3, DollarSign,
  Inbox, RefreshCw, BadgeCheck, X,
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
import { formatPhone, formatCurrency, whatsappUrl, iniciais } from '../../lib/formatters'
import { computeNextAction, URGENCY_STYLE, STAGE_CTA } from './nextAction'
import { useIntelligenceStore } from '../../store/useIntelligenceStore'
import { IntelPair } from '../../components/shared/IntelBadges'
import { aoTeclarAbrir } from '../../components/shared/lista'
import { TEMPERATURE_COLOR } from '../../lib/intelligence'
import { avisoReentrada } from './reentrada'
import { useKanbanPrefs } from '../../store/useKanbanPrefs'
import { ORIGEM_META } from './origens'
import { semContatoHaMaisDe, ESFRIANDO_DIAS } from './contato'
import { ordenar, ordemEfetiva } from './leadFiltros'
import { ConcludeSaleModal } from './ConcludeSaleModal'
import toast from 'react-hot-toast'

// Re-export da fonte única — consumido por LeadsPage, LeadsDashboard,
// LeadsPerformance e TransferToFunnelModal. Cores vivem em lib/stageTheme.ts.
export const STAGE_CONFIG = STAGE_THEME

const STAGES = FUNNEL_STAGES

function daysInStage(stageChangedAt?: string, createdAt?: string): number {
  const ref = stageChangedAt ?? createdAt ?? new Date().toISOString()
  return Math.floor((Date.now() - new Date(ref).getTime()) / 86_400_000)
}

function orderBetween(above: Lead | null, below: Lead | null): number {
  const a = above ? ordemEfetiva(above) : Date.now() + 1_000_000
  const b = below ? ordemEfetiva(below) : 0
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
  const { add: addInteraction } = useLeadInteractionsStore()
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
  const stageDays = isOverlay ? 0 : daysInStage(lead.stageChangedAt, lead.createdAt)
  const originMeta = ORIGEM_META[lead.origin]

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
  const next = isOverlay ? null : computeNextAction(lead, leadTasks)
  const nextStyle = next ? URGENCY_STYLE[next.urgency] : null
  const NextIcon = nextStyle?.icon
  const urgente = next?.urgency === 'critical' || next?.urgency === 'attention'

  // Comissão só onde ajuda a priorizar: etapas finais ou modo financeiro.
  const showCommission = financeMode || lead.funnelStage === 'proposta' || lead.funnelStage === 'venda'

  const intel = useIntelligenceStore(s => s.intel[lead.id])

  // Reentrada ainda não vista pelo dono — o único destaque que pode competir
  // com a próxima ação, porque não é o sistema cobrando: é o lead chamando.
  const aviso = isOverlay ? null : avisoReentrada(lead)

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      role="button"
      tabIndex={isOverlay ? -1 : 0}
      onKeyDown={aoTeclarAbrir(onClick)}
      aria-label={`Abrir lead ${displayName}`}
      className={`kanban-card group relative border rounded-[14px] cursor-pointer overflow-hidden
        transition-[transform,box-shadow,background-color,border-color,opacity] duration-200
        hover:-translate-y-px hover:shadow-dropdown
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand
        ${/*
            Todo card tem superfície própria — é o que separa card de coluna.
            A versão "recolhida" (bg-s2/50) tinha a mesma cor da coluna e
            apagava a maioria dos leads. O peso da urgência agora vem de
            sombra mais funda + faixa tingida na linha de decisão (nível 2).
         */ ''}
        ${urgente ? 'kanban-card-alerta' : ''}
        ${dense ? 'p-2.5' : 'p-3'}
        ${isDragging && !isOverlay ? 'opacity-30 scale-95' : ''}
        ${isOverlay ? '!shadow-modal kanban-card-prioridade' : ''}
        ${isSaving ? 'opacity-60 pointer-events-none' : ''}
        ${lead.flagged ? 'kanban-card-prioridade' : ''}
        ${/* Reentrada ganha anel: é o card que tem de ser visto primeiro na
              coluna, e ele já sobe para o topo na ordenação. */ ''}
        ${aviso ? 'kanban-card-alerta ring-1 ring-inset ring-info-line !border-info-line' : ''}
      `}
    >
      {/*
        Temperatura como filete na borda esquerda, não como badge.
        É a mesma linguagem do Salesforce e do Pipedrive: o olho lê a coluna
        inteira de uma vez, sem ler texto nenhum. Badge em todo card obrigaria
        a processar 113 etiquetas para achar as duas que importam.
      */}
      {intel && (
        <span
          className="absolute left-0 top-0 bottom-0 w-[3px]"
          style={{ background: TEMPERATURE_COLOR[intel.temperature] }}
          aria-hidden
        />
      )}
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
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- invólucro que só contém a propagação do clique — quem age são os botões dentro */}
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

      {/* ── NÍVEL 0 — O lead chamou ──────────────────────────────────────────
          Fica acima do nome porque é o motivo de olhar este card antes dos
          outros. Ícone + frase: a cor sozinha nunca diz o que houve, e quem usa
          o funil de vez em quando não decora legenda de cor. */}
      {aviso && (
        <p
          className="flex items-center gap-1.5 mb-2 pr-12 font-label text-[11px] font-bold
                     uppercase tracking-[0.08em] text-info"
          title={aviso.detalhe}
        >
          {aviso.tipo === 'cliente'
            ? <BadgeCheck size={12} strokeWidth={1.8} className="flex-shrink-0" aria-hidden />
            : <RefreshCw  size={12} strokeWidth={1.8} className="flex-shrink-0" aria-hidden />}
          <span className="truncate">{aviso.texto}</span>
        </p>
      )}

      {/* ── NÍVEL 1 — Identidade ─────────────────────────────────────────── */}
      <div className="flex items-start gap-2.5 pr-12">
        <div className="w-8 h-8 rounded-[10px] bg-s3 border border-line-strong flex items-center justify-center font-heading text-sm font-bold text-t2 flex-shrink-0">
          {iniciais(displayName) || '?'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="font-heading text-[14px] font-bold text-t1 truncate leading-tight tracking-[-0.02em]">
              {displayName}
            </p>
            {/* O valor decide prioridade tanto quanto o nome. Estava em 11px
                perdido na terceira linha, ao lado do produto. */}
            {lead.averageTicket && (
              <span className="ml-auto flex-shrink-0 font-heading text-[13px] font-bold text-t1 tabular-nums leading-tight">
                {formatCurrency(lead.averageTicket)}
              </span>
            )}
          </div>
          {/* Só o que qualifica a identidade: prioridade e responsável.
              Origem, produto e telefone desceram para o nível 3. */}
          <div className="flex items-center gap-1.5 mt-1 min-w-0">
            {/* Encaixe só aparece quando é Ideal ou Difícil — ver IntelPair */}
            <IntelPair
              temp={intel?.temperature}
              fit={intel?.fitOrigin?.fit}
              produto={intel?.fitOrigin?.name}
            />
            {lead.flagged && (
              <span className="font-label text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-text flex-shrink-0">
                Prioridade
              </span>
            )}
            {brokerName && (
              <span className="font-label text-[11px] text-t3 truncate" title={`Corretor responsável: ${brokerName}`}>
                {brokerName.split(' ')[0]}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── NÍVEL 2 — Decisão ────────────────────────────────────────────── */}
      {/* A linha mais importante do card. Risco chama atenção pela FRASE,
          não só pela cor — o ponto colorido é reforço, nunca o único sinal. */}
      {next && NextIcon && (
        <div
          className={`flex items-start gap-2 mt-2.5
            ${nextStyle!.chip ? `-mx-1 px-2 py-1.5 rounded-[10px] border ${nextStyle!.chip}` : ''}`}
          title={next.hint}
        >
          <NextIcon size={13} strokeWidth={1.8} className={`flex-shrink-0 mt-px ${nextStyle!.iconColor}`} aria-hidden />
          <p className={`flex-1 text-xs font-semibold leading-snug min-w-0 ${nextStyle!.text}`}>
            {next.text}
          </p>
          {!isOverlay && (
            <span
              className="ml-auto flex-shrink-0 font-label text-[11px] text-t3 tabular-nums"
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
                  ${step <= lead.followupStep ? 'bg-brand hover:opacity-80' : 'bg-line-strong hover:bg-brand-tint'}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── NÍVEL 3 — Contexto comercial ─────────────────────────────────── */}
      {/* Uma linha discreta, não um empilhamento de badges. Some no modo compacto. */}
      {!dense && (
        <div className="flex items-center gap-1.5 mt-2.5 min-w-0 text-[11px] text-t3">
          {originMeta && (
            <originMeta.icon size={11} strokeWidth={1.6} className="flex-shrink-0" aria-label={originMeta.label} />
          )}
          {(property || lead.propertyName) && (
            <span className="truncate">{property ? property.name : lead.propertyName}</span>
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
      {/* Etapa Venda troca o CTA: lá o que avança o negócio é concluir a venda.

          O botão principal era VERDE CHEIO em todo card. Com dez cards por
          coluna, eram trinta retângulos verdes disputando a tela ao mesmo
          tempo — e um destaque que se repete em tudo deixa de ser destaque.
          Agora ele é um botão fantasma que se enche de cor ao passar o mouse
          ou receber foco: continua visível e descobrível (esconder no hover
          seria pior, some no toque e no teclado), só parou de gritar. */}
      <div className="mt-2.5 pt-2.5 border-t border-line flex items-center gap-1.5">
        {!isOverlay && lead.funnelStage === 'venda' && !lead.closedAt ? (
          <button
            onClick={e => { e.stopPropagation(); setShowConclude(true) }}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 font-heading text-xs font-bold text-brand-fill-text bg-brand-fill hover:bg-brand-fill-hover rounded-[10px] transition-all duration-150 active:scale-[0.98]"
            title="Concluir a venda e registrar no faturamento"
          >
            <Trophy size={12} strokeWidth={1.8} />
            Concluir venda
          </button>
        ) : (
          <button
            onClick={handleWhatsApp}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 min-h-[32px] font-heading text-xs font-bold
                       text-t2 bg-transparent border border-line-strong rounded-[10px] transition-all duration-150 active:scale-[0.98]
                       group-hover:text-success group-hover:bg-success-bg group-hover:border-success-line
                       hover:!bg-success hover:!text-[var(--grad-call-text,#0F1730)] hover:!border-success
                       focus-visible:text-success focus-visible:bg-success-bg focus-visible:border-success-line
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-success/40"
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
          className="w-8 h-8 flex items-center justify-center text-t3 hover:text-success bg-transparent hover:bg-success-bg border border-line-strong hover:border-success-line rounded-[10px] transition-all duration-150 flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          title="Só abrir WhatsApp, sem registrar"
          aria-label={`Abrir WhatsApp de ${displayName} sem registrar contato`}
        >
          <MessageCircle size={12} strokeWidth={1.6} />
        </button>
        <a
          href={`tel:${displayPhone}`}
          onClick={e => e.stopPropagation()}
          className="w-8 h-8 flex items-center justify-center text-t3 hover:text-t1 bg-transparent hover:bg-s3 border border-line-strong rounded-[10px] transition-all duration-150 flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          title={`Ligar — ${formatPhone(displayPhone)}`}
          aria-label={`Ligar para ${displayName}, ${formatPhone(displayPhone)}`}
        >
          <Phone size={12} strokeWidth={1.6} />
        </a>
      </div>

      {showConclude && (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- invólucro que só contém a propagação do clique — quem age são os botões dentro
        <div onClick={e => e.stopPropagation()}>
          <ConcludeSaleModal lead={lead} onClose={() => setShowConclude(false)} />
        </div>
      )}
    </div>
  )
}

// ─── Coluna do kanban ─────────────────────────────────────────────────────────

function KanbanColumn({
  stage, leads, total, onCardClick, isActiveDragTarget, savingId, dense, financeMode,
  onFiltrarSemContato, filtroSemContatoAtivo,
}: {
  stage: LeadFunnelStage
  leads: Lead[]
  /** total da etapa sem filtro — só vem quando há recorte aplicado */
  total?: number
  onCardClick: (lead: Lead) => void
  isActiveDragTarget: boolean
  savingId: string | null
  dense: boolean
  financeMode: boolean
  onFiltrarSemContato?: () => void
  filtroSemContatoAtivo: boolean
}) {
  const conf = STAGE_CONFIG[stage]
  const { isOver, setNodeRef } = useDroppable({ id: stage })
  const ids = leads.map(l => l.id)

  const totalPipeline   = leads.reduce((s, l) => s + (l.averageTicket ?? 0), 0)
  const totalCommission = totalPipeline * 0.02
  // Risco da coluna: leads em aberto sem contato além da janela de
  // esfriamento. Mesma régua do filtro e da linha do card (contato.ts).
  const coldCount = leads.filter(l =>
    !l.discardReason && !l.closedAt && semContatoHaMaisDe(l, ESFRIANDO_DIAS)
  ).length
  const riskPct = leads.length > 0 ? Math.round((coldCount / leads.length) * 100) : 0

  return (
    <div className="flex flex-col w-[19rem] flex-shrink-0">
      <div className={`flex flex-col flex-1 rounded-[18px] kanban-col transition-shadow duration-200
        ${isOver || isActiveDragTarget ? 'ring-1 ring-inset ring-brand/40' : ''}
      `}>
        {/* Cabeçalho fixo — acompanha a rolagem vertical da coluna */}
        <div className="sticky top-0 z-10 flex flex-col px-4 pt-3.5 pb-2.5 rounded-t-[18px] kanban-col-bg">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${conf.dot}`} aria-hidden />
            <h3 className="font-label text-xs font-semibold uppercase tracking-[0.12em] text-t2">
              {conf.columnLabel}
            </h3>
            {/* A contagem herda a cor da etapa: é o número que se lê primeiro ao
                varrer o funil, e em cinza ele some no meio do cabeçalho. */}
            <span className={`ml-auto font-heading text-[17px] font-extrabold tabular-nums
                              leading-none ${conf.color}`}>
              {leads.length}
            </span>
            {/* Com filtro, o total da etapa: sem ele a coluna encolhida parece
                funil vazio. */}
            {total !== undefined && total !== leads.length && (
              <span className="font-label text-[11px] text-t4 tabular-nums -ml-1" title={`${leads.length} de ${total} leads desta etapa`}>
                /{total}
              </span>
            )}
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

          {/* Indicador de risco — texto + proporção, nunca só cor. É também
              um atalho: tocar filtra o funil inteiro por quem esfriou, que é
              exatamente a pergunta que o número levanta. */}
          {coldCount > 0 && (
            <div className="mt-2 pl-4">
              {onFiltrarSemContato ? (
                <button
                  type="button"
                  onClick={onFiltrarSemContato}
                  aria-pressed={filtroSemContatoAtivo}
                  title={filtroSemContatoAtivo
                    ? 'Mostrar todos os leads de novo'
                    : `Mostrar só quem está há mais de ${ESFRIANDO_DIAS} dias sem contato, em todas as colunas`}
                  className={`-ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-label text-[11px] text-warning tabular-nums
                    transition-colors hover:bg-warning-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-warning/40
                    ${filtroSemContatoAtivo ? 'bg-warning-bg' : ''}`}
                >
                  <Snowflake size={10} strokeWidth={1.6} aria-hidden />
                  {coldCount} sem contato há +{ESFRIANDO_DIAS}d
                  {filtroSemContatoAtivo && <X size={10} strokeWidth={2} aria-hidden />}
                </button>
              ) : (
                <p className="flex items-center gap-1 font-label text-[11px] text-warning tabular-nums">
                  <Snowflake size={10} strokeWidth={1.6} aria-hidden />
                  {coldCount} sem contato há +{ESFRIANDO_DIAS}d
                </p>
              )}
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
              /* Ficava centralizado num flex-1 de 420px+ de altura: o texto
                 caía abaixo da dobra e a coluna vazia lia como um vão morto.
                 Agora a área de solta fica no topo, onde o card entraria. */
              <div className="flex flex-col items-center justify-center gap-1.5 rounded-[14px] border border-dashed
                              border-line-strong/60 bg-s3/20 px-3 py-7 m-0.5">
                <Inbox size={16} strokeWidth={1.5} className="text-t4" aria-hidden />
                <p className="text-xs text-t4 text-center leading-snug">
                  Nada em {conf.label.toLowerCase()}
                  <br />
                  <span className="text-t5">Arraste um card para cá</span>
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
  /** total por etapa sem filtro — só quando há recorte aplicado */
  totalPorEtapa?: Record<LeadFunnelStage, number>
  /** liga/desliga o filtro "sem contato há +2d" a partir do cabeçalho da coluna */
  onFiltrarSemContato?: () => void
  filtroSemContatoAtivo?: boolean
}

export function LeadKanban({ leads, totalPorEtapa, onFiltrarSemContato, filtroSemContatoAtivo = false }: LeadKanbanProps) {
  const { setStage, reorder } = useLeadsStore()
  const connected = useRealtimeStatusStore(s => s.connected)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<LeadFunnelStage | null>(null)
  // Painel do lead vem da URL (?lead=<id>), igual à aba de lista — assim o
  // link é compartilhável e o voltar do navegador fecha o painel.
  //
  // Quem MONTA o painel é a LeadsPage, não este componente. Antes os dois liam
  // o mesmo parâmetro e montavam um LeadModal cada, empilhados — invisível para
  // quem clica (um cobre o outro), mas era o painel inteiro renderizado em
  // dobro. E a busca daqui olha só os leads já filtrados: link recebido por
  // notificação para um lead que o filtro escondeu não abria nada. A LeadsPage
  // procura na base inteira.
  const [searchParams, setSearchParams] = useSearchParams()
  const setSelectedLead = (l: Lead | null) => {
    const next = new URLSearchParams(searchParams)
    if (l) next.set('lead', l.id)
    else   next.delete('lead')
    setSearchParams(next, { replace: !l })
  }
  const [savingId, setSavingId] = useState<string | null>(null)
  const { dense, financeMode, sort, setDense, setFinanceMode } = useKanbanPrefs()

  // O Kanban baixava a tabela inteira de interações (~5,4 MB, e ainda cortada
  // em 1.000 linhas) só para saber a data do último contato de cada card.
  // Essa data agora vem no próprio lead (`lastContactAt`, migração 074).

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    // Acessibilidade: mover cards por teclado (Espaço pega/solta, setas movem)
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const sortedByStage = useMemo(() => {
    // `manual` preserva a ordenação arrastada (kanbanOrder). Os demais critérios
    // são visualizações — arrastar continua gravando a ordem manual no banco,
    // ela só volta a aparecer quando a ordenação retorna para "manual".
    // Reentrada não vista vem antes de qualquer critério (ver leadFiltros.ts).
    return STAGES.reduce((acc, stage) => {
      acc[stage] = ordenar(leads.filter(l => l.funnelStage === stage), sort)
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

        {/* A ordenação subiu para a barra de filtros, no mesmo lugar da lista:
            a pergunta "em que ordem?" é a mesma nas duas visões. */}
        <div className="ml-auto flex items-center gap-2 flex-wrap">
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
              total={totalPorEtapa?.[stage]}
              onFiltrarSemContato={onFiltrarSemContato}
              filtroSemContatoAtivo={filtroSemContatoAtivo}
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
    </>
  )
}
