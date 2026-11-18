import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  DndContext, DragOverlay, closestCenter,
  DragEndEvent, DragOverEvent, DragStartEvent,
  MouseSensor, TouchSensor, KeyboardSensor, useSensor, useSensors,
  useDroppable,
} from '@dnd-kit/core'
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  MessageCircle, GripVertical, Phone, Star, Snowflake, Loader2,
  Wifi, WifiOff, Trophy, Rows2, Rows3, DollarSign,
  Inbox, RefreshCw, BadgeCheck, X,
} from 'lucide-react'
import { Lead, LeadFunnelStage, MAX_TENTATIVAS_FOLLOWUP } from '../../types'
import { STAGE_THEME, FUNNEL_STAGES } from '../../lib/stageTheme'
import { useLeadsStore } from '../../store/useLeadsStore'
import { useAuthStore } from '../../store/useAuthStore'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { useLeadInteractionsStore } from '../../store/useLeadInteractionsStore'
import { useRealtimeStatusStore } from '../../store/useRealtimeStatusStore'
import { useTasksStore } from '../../store/useTasksStore'
import { formatPhone, formatCurrency, whatsappUrl } from '../../lib/formatters'
import { computeNextAction, URGENCY_STYLE, STAGE_CTA } from './nextAction'
import { aoTeclarAbrir } from '../../components/shared/lista'
import { avisoReentrada } from './reentrada'
import { useKanbanPrefs } from '../../store/useKanbanPrefs'
import { ORIGEM_META } from './origens'
import { semContatoHaMaisDe, fraseContato, ESFRIANDO_DIAS } from './contato'
import { ordenar, ordemEfetiva } from './leadFiltros'
import { ConcludeSaleModal } from './ConcludeSaleModal'
import { SinalDeFluxo } from './fluxos/SinalDeFluxo'
import toast from 'react-hot-toast'

// Re-export da fonte única — consumido por LeadsPage, LeadsDashboard,
// LeadsPerformance e TransferToFunnelModal. Cores vivem em lib/stageTheme.ts.
export const STAGE_CONFIG = STAGE_THEME

const STAGES = FUNNEL_STAGES

function daysInStage(stageChangedAt?: string, createdAt?: string): number {
  const ref = stageChangedAt ?? createdAt ?? new Date().toISOString()
  return Math.floor((Date.now() - new Date(ref).getTime()) / 86_400_000)
}

/**
 * Colunas iguais e sempre abertas (16/11/2026, pedido do Rafael). As seis etapas
 * dividem a largura do quadro por igual, cheias ou vazias, e ficam sempre no
 * mesmo lugar. No computador a coluna encolhe até 16rem para as seis caberem
 * numa tela de notebook sem rolagem lateral; abaixo disso, e no celular (onde a
 * coluna fica mais larga para o cartão respirar), o quadro rola para o lado.
 *
 * Histórico, para não repetir: a versão de horas antes recolhia a coluna vazia
 * num trilho estreito e usava o espaço ganho para mostrar a coluna cheia em
 * duas ou mais faixas de cartões. Com todas as colunas abertas esse espaço não
 * existe mais, então as faixas saíram junto.
 */
const CLASSE_DA_COLUNA = 'flex flex-col flex-1 basis-[18.5rem] min-w-[18.5rem] lg:basis-[16rem] lg:min-w-[16rem] max-w-[22rem]'

function orderBetween(above: Lead | null, below: Lead | null): number {
  const a = above ? ordemEfetiva(above) : Date.now() + 1_000_000
  const b = below ? ordemEfetiva(below) : 0
  return (a + b) / 2
}

// ─── Card sortável ────────────────────────────────────────────────────────────

/**
 * Controles secundários do cartão (estrela, alça de arrastar, atalhos): somem
 * em repouso no computador e aparecem ao passar o mouse ou focar pelo teclado.
 * No toque não existe "passar o mouse", então ficam sempre à vista.
 */
const ATALHO_DO_CARD =
  'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100'

function LeadCard({
  lead, onClick, onConclude, isOverlay = false, isSaving = false, dense = false, financeMode = false,
}: {
  lead: Lead; onClick: () => void
  /** Abre o "Concluir venda" — o modal mora no Kanban, não no card */
  onConclude?: () => void
  isOverlay?: boolean; isSaving?: boolean
  /** Densidade compacta — esconde o contexto comercial e aperta o espaçamento. */
  dense?: boolean
  /** Modo financeiro — mostra comissão em todas as etapas, não só nas finais. */
  financeMode?: boolean
}) {
  const { advanceFollowup, toggleFlag, update } = useLeadsStore()
  const { isAdmin, viewAsBrokerId, allProfiles } = useAuthStore()
  const { properties } = usePropertiesStore()
  const { tasks } = useTasksStore()
  const { add: addInteraction } = useLeadInteractionsStore()

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
  // Nome e telefone do LEAD, como no modal, na lista, no push e nas notificações.
  // O card preferia o nome do contato vinculado: lead do Meta que casava por
  // telefone com um contato antigo aparecia com outro nome só aqui ("Junior" no
  // aviso, "Gilberto" no funil — 14/11/2026).
  const displayName = lead.name
  const displayPhone = lead.phone
  const stageDays = isOverlay ? 0 : daysInStage(lead.stageChangedAt, lead.createdAt)
  const originMeta = ORIGEM_META[lead.origin]

  // Registra no banco e só então confirma — sem otimismo
  async function handleWhatsApp(e: React.MouseEvent) {
    e.stopPropagation()
    window.open(whatsappUrl(displayPhone), '_blank')
    const nextStep = lead.funnelStage === 'lead' ? 1 : Math.min(lead.followupStep + 1, MAX_TENTATIVAS_FOLLOWUP)
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
        ${dense ? 'px-3 py-2.5' : 'px-3.5 py-3'}
        ${isDragging && !isOverlay ? 'opacity-30 scale-95' : ''}
        ${isOverlay ? '!shadow-modal kanban-card-prioridade' : ''}
        ${isSaving ? 'opacity-60 pointer-events-none' : ''}
        ${lead.flagged ? 'kanban-card-prioridade' : ''}
        ${/* Reentrada ganha anel: é o card que tem de ser visto primeiro na
              coluna, e ele já sobe para o topo na ordenação. */ ''}
        ${aviso ? 'kanban-card-alerta ring-1 ring-inset ring-info-line !border-info-line' : ''}
      `}
    >
      {/* Temperatura (frio, morno, quente) e encaixe com o produto (Ideal,
          Difícil) saíram do cartão em 16/11/2026, a pedido do Rafael: nem a
          palavra nem o filete de cor na borda. Continuam na lista de leads,
          nos filtros e na ficha do lead. */}
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
              : `text-t5 hover:text-brand ${ATALHO_DO_CARD}`
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
          className={`w-6 h-6 flex items-center justify-center text-t4 hover:text-t2 cursor-grab active:cursor-grabbing transition-all ${ATALHO_DO_CARD}`}
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

      {/* ── Redesenho de 16/11/2026 — quatro linhas, uma hierarquia ─────────
          1. nome (o título)   2. contexto, numa linha neutra
          3. a linha de decisão   4. ações
          Saíram do cartão: temperatura, "sem próxima ação", a etiqueta
          PRIORIDADE (a estrela já diz), o valor em negrito disputando com o
          nome e o fundo cinza do botão em repouso. Em repouso o cartão é texto
          sobre papel; cor só aparece onde há prazo, risco ou dinheiro. */}

      {/* 1 · Nome */}
      <div className="flex items-center gap-1.5 pr-12 min-w-0">
        <p className="font-heading text-[14px] font-bold text-t1 truncate leading-tight tracking-[-0.02em]">
          {displayName}
        </p>
        {lead.qualifiedAt && (
          <span className="flex-shrink-0 text-success" title="Lead qualificado">
            <BadgeCheck size={13} strokeWidth={2} aria-label="Lead qualificado" />
          </span>
        )}
        <SinalDeFluxo quantos={lead.fluxosCount} />
      </div>

      {/* 2 · Contexto: produto e responsável à esquerda, valor à direita.
             O valor alinha à direita em todos os cartões (tabular), para a
             coluna inteira se ler como uma lista de valores. */}
      <div className="flex items-baseline gap-2 mt-1 min-w-0 text-[12px] text-t3">
        <p className="flex-1 min-w-0 truncate">
          {originMeta && (
            <originMeta.icon size={11} strokeWidth={1.6} className="inline-block align-[-1px] mr-1 text-t4" aria-label={originMeta.label} />
          )}
          {property ? property.name : (lead.propertyName ?? '')}
          {brokerName && (
            <span className="text-t4" title={`Corretor responsável: ${brokerName}`}>
              {(property || lead.propertyName) ? ' · ' : ''}{brokerName.split(' ')[0]}
            </span>
          )}
        </p>
        {lead.averageTicket ? (
          <span className="flex-shrink-0 font-medium text-t2 tabular-nums">
            {formatCurrency(lead.averageTicket)}
          </span>
        ) : null}
        {/* Comissão só nas etapas finais ou no modo financeiro */}
        {lead.averageTicket && showCommission ? (
          <span className="flex-shrink-0 font-medium text-success tabular-nums" title="Comissão estimada (2%)">
            {formatCurrency(lead.averageTicket * 0.02)}
          </span>
        ) : null}
      </div>

      {/* 3 · Decisão — a linha que diz por que olhar este cartão.
             Risco chama atenção pela FRASE e pelo ícone, não só pela cor. Sem
             ação marcada, a linha diz o último contato, em tom neutro: assim
             só o que tem prazo ou risco ganha peso na coluna. */}
      {next && NextIcon && (
        <div className="flex items-center gap-1.5 mt-2.5 min-w-0" title={next.hint}>
          <NextIcon size={13} strokeWidth={1.8} className={`flex-shrink-0 ${nextStyle!.iconColor}`} aria-hidden />
          {next.urgency === 'none' ? (
            // O Rafael mandou tirar o aviso "sem próxima ação" do cartão
            // (16/11/2026) — não recolocar.
            <p className="flex-1 min-w-0 truncate text-[12px] text-t3">{fraseContato(lead)}</p>
          ) : (
            <p className={`flex-1 min-w-0 text-[12px] font-semibold leading-snug ${nextStyle!.text}`}>
              {next.text}
            </p>
          )}
          {!isOverlay && (
            <span
              className="flex-shrink-0 text-[11px] text-t4 tabular-nums"
              title={`${stageDays} ${stageDays === 1 ? 'dia' : 'dias'} nesta etapa`}
            >
              {stageDays}d
            </span>
          )}
        </div>
      )}

      {/* Toques do followup — só onde a cadência existe. Ficam à vista também
          no modo compacto: o Rafael pediu que os toques continuem no cartão
          (16/11/2026). Cada traço é um toque; clicar marca até ali. */}
      {lead.funnelStage === 'followup' && (
        <div className={`flex items-center gap-1 ${dense ? 'mt-1.5' : 'mt-2.5'}`} role="group" aria-label={`${lead.followupStep} de ${MAX_TENTATIVAS_FOLLOWUP} tentativas`}>
          {Array.from({ length: MAX_TENTATIVAS_FOLLOWUP }, (_, i) => i + 1).map(step => (
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
              // 4px de barra, mas 14px de área de clique (py transparente)
              className="group/passo flex-1 py-[5px] cursor-pointer focus:outline-none"
            >
              <span className={`block h-1 rounded-full transition-colors duration-150
                ${step <= lead.followupStep
                  ? 'bg-brand group-hover/passo:opacity-70'
                  : 'bg-line-strong group-hover/passo:bg-brand-tint'}
                group-focus-visible/passo:ring-2 group-focus-visible/passo:ring-brand/50`} />
            </button>
          ))}
          {/* A contagem mora aqui, junto dos traços — antes ia no botão ("· 2ª")
              e espremia o rótulo na coluna estreita. */}
          <span className="flex-shrink-0 ml-1 text-[11px] text-t4 tabular-nums"
                title={`${lead.followupStep} de ${MAX_TENTATIVAS_FOLLOWUP} toques`}>
            {lead.followupStep}/{MAX_TENTATIVAS_FOLLOWUP}
          </span>
        </div>
      )}

      {/* 4 · Ações
             Etapa Venda troca o CTA: lá o que avança o negócio é concluir a
             venda, e esse é o único botão cheio do quadro (ouro = dinheiro).

             Nas outras etapas a ação principal é texto, sem caixa: com cem
             cartões na tela, cem caixas cinza eram ruído. Ela se pinta ao
             passar o mouse ou receber foco. Os dois atalhos (só abrir o
             WhatsApp, ligar) aparecem junto — e ficam sempre à vista no toque,
             onde não existe "passar o mouse". */}
      <div className="mt-2 -mb-1 flex items-center gap-0.5">
        {!isOverlay && lead.funnelStage === 'venda' && !lead.closedAt ? (
          <button
            onClick={e => { e.stopPropagation(); onConclude?.() }}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 min-h-[32px] text-[12px] font-bold text-brand-fill-text bg-brand-fill hover:bg-brand-fill-hover rounded-[9px] transition-all duration-150 active:scale-[0.98]"
            title="Concluir a venda e registrar no faturamento"
          >
            <Trophy size={12} strokeWidth={1.8} />
            Concluir venda
          </button>
        ) : (
          <button
            onClick={handleWhatsApp}
            className="flex-1 min-w-0 -ml-1.5 flex items-center justify-start gap-1.5 px-1.5 min-h-[32px] text-[12px] font-semibold
                       text-t2 rounded-[8px] transition-colors duration-150 active:scale-[0.98]
                       group-hover:text-success
                       hover:!bg-success hover:!text-[var(--grad-call-text,#0F1730)]
                       focus-visible:text-success focus-visible:bg-success-bg
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-success/40"
            title="Abrir WhatsApp e registrar o contato na timeline"
          >
            <MessageCircle size={12} strokeWidth={1.7} className="flex-shrink-0" />
            <span className="truncate">{STAGE_CTA[lead.funnelStage] ?? 'Registrar contato'}</span>
          </button>
        )}
        <button
          onClick={handleWhatsAppOpen}
          className={`w-8 h-8 flex items-center justify-center text-t4 hover:text-success hover:bg-success-bg rounded-[8px] transition-all duration-150 flex-shrink-0
                      focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${ATALHO_DO_CARD}`}
          title="Só abrir WhatsApp, sem registrar"
          aria-label={`Abrir WhatsApp de ${displayName} sem registrar contato`}
        >
          <MessageCircle size={13} strokeWidth={1.6} />
        </button>
        <a
          href={`tel:${displayPhone}`}
          onClick={e => e.stopPropagation()}
          className={`w-8 h-8 flex items-center justify-center text-t4 hover:text-t1 hover:bg-s3 rounded-[8px] transition-all duration-150 flex-shrink-0
                      focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${ATALHO_DO_CARD}`}
          title={`Ligar — ${formatPhone(displayPhone)}`}
          aria-label={`Ligar para ${displayName}, ${formatPhone(displayPhone)}`}
        >
          <Phone size={13} strokeWidth={1.6} />
        </a>
      </div>
    </div>
  )
}

// ─── Coluna do kanban ─────────────────────────────────────────────────────────

function KanbanColumn({
  stage, leads, total, onCardClick, onConclude, isActiveDragTarget, savingId, dense, financeMode,
  onFiltrarSemContato, filtroSemContatoAtivo, arrastando,
}: {
  /** há um card sendo arrastado — a coluna vazia convida a soltar */
  arrastando: boolean
  stage: LeadFunnelStage
  leads: Lead[]
  /** total da etapa sem filtro — só vem quando há recorte aplicado */
  total?: number
  onCardClick: (lead: Lead) => void
  onConclude: (lead: Lead) => void
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

  const alvo = isOver || isActiveDragTarget
  const vazia = leads.length === 0

  // Toda coluna fica sempre aberta, cheia ou vazia (pedido do Rafael em
  // 16/11/2026): o quadro tem sempre as mesmas colunas no mesmo lugar. Antes a
  // vazia virava um trilho estreito que se abria no clique ou durante o arraste.
  return (
    // --etapa alimenta o filete e a contagem do cabeçalho (ver .kanban-cabeca).
    <div className={CLASSE_DA_COLUNA} style={{ ['--etapa' as string]: `var(--stage-${stage})` }}
         id={`coluna-${stage}`}>
      <div className="flex flex-col flex-1 kanban-col">
        {/* Cabeçalho fixo — uma linha: etapa, contagem, esfriando e VGV */}
        <div className="kanban-cabeca kanban-col-bg sticky top-0 z-10 flex items-center gap-2 px-1 pt-0.5 pb-2 mb-2.5">
          <h3 className="text-[13.5px] font-semibold text-t1">{conf.columnLabel}</h3>
          <span className="text-[13px] tabular-nums text-t4">
            {leads.length}
            {total !== undefined && total !== leads.length && (
              <span title={`${leads.length} de ${total} leads desta etapa`}>/{total}</span>
            )}
          </span>
          {coldCount > 0 && (
            onFiltrarSemContato ? (
              <button
                type="button"
                onClick={onFiltrarSemContato}
                aria-pressed={filtroSemContatoAtivo}
                title={filtroSemContatoAtivo
                  ? 'Mostrar todos os leads de novo'
                  : `${coldCount} sem contato há mais de ${ESFRIANDO_DIAS} dias (${riskPct}%). Clique para ver só eles.`}
                className={`inline-flex items-center gap-1 px-1.5 h-6 rounded-md text-[12px] text-warning tabular-nums
                  transition-colors hover:bg-warning-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-warning/40
                  ${filtroSemContatoAtivo ? 'bg-warning-bg' : ''}`}
              >
                <Snowflake size={11} strokeWidth={1.8} aria-hidden />
                {coldCount}
                {filtroSemContatoAtivo && <X size={10} strokeWidth={2} aria-hidden />}
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 text-[12px] text-warning tabular-nums"
                    title={`${coldCount} sem contato há mais de ${ESFRIANDO_DIAS} dias`}>
                <Snowflake size={11} strokeWidth={1.8} aria-hidden />{coldCount}
              </span>
            )
          )}
          {totalPipeline > 0 && (
            <span className="ml-auto text-[12px] text-t4 tabular-nums" title={financeMode ? `Comissão estimada: ${formatCurrency(totalCommission)}` : undefined}>
              {formatCurrency(totalPipeline)}
            </span>
          )}
        </div>

        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div
            ref={setNodeRef}
            className={`flex-1 min-h-[420px] rounded-[14px] p-1 transition-colors duration-200 flex flex-col
              ${dense ? 'gap-1.5' : 'gap-2.5'}
              ${alvo ? 'kanban-solta' : ''}
            `}
          >
            {vazia && (
              // Parada, a coluna vazia só diz que está vazia; o convite a soltar
              // aparece quando há um card na mão.
              <div className={`flex flex-col items-center justify-center gap-1.5 rounded-[12px] px-3 py-8
                              ${arrastando ? 'border border-dashed border-line-strong' : ''}`}>
                {arrastando && <Inbox size={16} strokeWidth={1.5} className="text-t4" aria-hidden />}
                <p className="text-xs text-t4 text-center leading-snug">
                  {arrastando
                    ? `Solte aqui para mover para ${conf.label.toLowerCase()}`
                    : `Nada em ${conf.columnLabel.toLowerCase()}`}
                </p>
              </div>
            )}
            {leads.map(lead => (
              <LeadCard
                key={lead.id} lead={lead}
                onClick={() => onCardClick(lead)}
                onConclude={() => onConclude(lead)}
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
  // "Concluir venda" vive aqui, fora do card: dentro dele o modal herdava o
  // transform e o overflow-hidden do card. Guardamos o id, não o lead, para o
  // modal sempre ler a versão atual do store.
  const [concludeId, setConcludeId] = useState<string | null>(null)
  const concludeLead = concludeId ? leads.find(l => l.id === concludeId) : null
  const { dense, financeMode, sort, setDense, setFinanceMode } = useKanbanPrefs()

  // O Kanban baixava a tabela inteira de interações (~5,4 MB, e ainda cortada
  // em 1.000 linhas) só para saber a data do último contato de cada card.
  // Essa data agora vem no próprio lead (`lastContactAt`, migração 074).

  const sensors = useSensors(
    // Mouse: arrasta ao mover 8px. Toque (iPad/celular): segurar 250ms para
    // pegar o card — o arrasto imediato brigava com a rolagem do quadro, e o
    // dedo que só queria rolar acabava movendo lead de etapa.
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
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

  // Esc no teclado, ou soltar fora da janela. Sem isto o quadro ficava em "modo
  // arrastando" — alvo marcado e convite a soltar — até o próximo arraste.
  function handleDragCancel() {
    setActiveId(null)
    setOverStage(null)
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
          seguirParaConclusao(draggedLead, newStage)
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
      const mudouEtapa = draggedLead.funnelStage !== targetStage
      if (mudouEtapa) {
        await setStage(leadId, targetStage)
        toast.success(`Lead movido para ${STAGE_CONFIG[targetStage].label}`)
      }
      await reorder(leadId, orderBetween(above, below))
      if (mudouEtapa) seguirParaConclusao(draggedLead, targetStage)
    } catch { /* erro já toastado — posição original mantida */ }
    finally { setSavingId(null) }
  }

  // Soltar em Venda é a intenção de fechar o negócio: o próximo passo (valor e
  // data) abre na hora. Cancelar deixa o lead em Venda, com o botão "Concluir
  // venda" no card para terminar depois.
  function seguirParaConclusao(lead: Lead, stage: LeadFunnelStage) {
    if (stage === 'venda' && !lead.closedAt) setConcludeId(lead.id)
  }

  return (
    <>
      {/* ── Resumo — uma linha fina ───────────────────────────────────────
          Só o total e os controles. A barra proporcional por etapa saiu em
          16/11/2026: repetia a contagem que o cabeçalho de cada coluna já dá. */}
      <div className="flex items-center gap-4 mb-4 px-1 min-h-[32px]">
        <p className="text-[13px] text-t3 whitespace-nowrap">
          <span className="font-semibold text-t1 tabular-nums">{resumo.ativos}</span> em aberto
          <span className="text-t5 mx-1.5" aria-hidden>·</span>
          <span className="font-semibold text-t1 tabular-nums">{formatCurrency(resumo.vgv)}</span> em pipeline
        </p>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setDense(!dense)}
            aria-pressed={dense}
            title={dense ? 'Mostrar contexto comercial nos cards' : 'Compactar cards'}
            className={`flex items-center gap-1.5 text-[12.5px] font-medium px-2.5 h-8 rounded-lg transition-colors cursor-pointer
              ${dense ? 'text-t1 bg-s2' : 'text-t3 hover:text-t1 hover:bg-s2'}`}
          >
            {dense ? <Rows2 size={13} strokeWidth={1.7} /> : <Rows3 size={13} strokeWidth={1.7} />}
            {dense ? 'Compacto' : 'Completo'}
          </button>
          <button
            onClick={() => setFinanceMode(!financeMode)}
            aria-pressed={financeMode}
            title="Exibir comissão estimada em todos os cards e colunas"
            className={`flex items-center gap-1.5 text-[12.5px] font-medium px-2.5 h-8 rounded-lg transition-colors cursor-pointer
              ${financeMode ? 'text-success bg-success-bg' : 'text-t3 hover:text-t1 hover:bg-s2'}`}
          >
            <DollarSign size={13} strokeWidth={1.7} />
            Comissão
          </button>
          <span className="flex items-center pl-1.5" title={connected ? 'Sincronizado em tempo real' : 'Reconectando ao servidor'}>
            {connected
              ? <Wifi size={13} strokeWidth={1.7} className="text-success" aria-label="Tempo real ativo" />
              : <WifiOff size={13} strokeWidth={1.7} className="text-warning" aria-label="Reconectando" />}
          </span>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex gap-4 overflow-x-auto pb-4 px-1 items-stretch [justify-content:safe_center]">
          {STAGES.map(stage => (
            <KanbanColumn
              key={stage}
              stage={stage}
              leads={sortedByStage[stage]}
              total={totalPorEtapa?.[stage]}
              onFiltrarSemContato={onFiltrarSemContato}
              filtroSemContatoAtivo={filtroSemContatoAtivo}
              onCardClick={setSelectedLead}
              onConclude={l => setConcludeId(l.id)}
              dense={dense} financeMode={financeMode}
              isActiveDragTarget={overStage === stage && !!activeId}
              savingId={savingId}
              arrastando={!!activeId}
            />
          ))}
        </div>

        <DragOverlay>
          {activeLead ? <LeadCard lead={activeLead} onClick={() => {}} isOverlay dense={dense} /> : null}
        </DragOverlay>
      </DndContext>

      {concludeLead && !concludeLead.closedAt && (
        <ConcludeSaleModal lead={concludeLead} onClose={() => setConcludeId(null)} />
      )}
    </>
  )
}
