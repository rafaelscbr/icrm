import { useState, useMemo, useEffect, useRef } from 'react'
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
  MessageCircle, GripVertical, Phone, Star, AlarmClock, Loader2,
  Wifi, WifiOff, Trophy, Rows2, Rows3,
  Inbox, RefreshCw, BadgeCheck, X, Sparkles,
} from 'lucide-react'
import { Lead, LeadFunnelStage, MAX_TENTATIVAS_FOLLOWUP } from '../../types'
import { STAGE_THEME, FUNNEL_STAGES } from '../../lib/stageTheme'
import { useLeadsStore } from '../../store/useLeadsStore'
import { useAuthStore } from '../../store/useAuthStore'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { useLeadInteractionsStore } from '../../store/useLeadInteractionsStore'
import { useRealtimeStatusStore } from '../../store/useRealtimeStatusStore'
import { useTasksStore } from '../../store/useTasksStore'
import { formatPhone, formatCurrencyFull, formatCurrencyRound, whatsappUrl } from '../../lib/formatters'
import { computeNextAction, URGENCY_STYLE, STAGE_CTA } from './nextAction'
import { aoTeclarAbrir } from '../../components/shared/lista'
import { avisoReentrada } from './reentrada'
import { useKanbanPrefs } from '../../store/useKanbanPrefs'
import { useContagem } from '../../hooks/useContagem'
import { FotoPerfil } from '../../components/shared/FotoPerfil'
import { divisao, PCT_PADRAO } from './comissao'
import { useDevelopmentsStore } from '../../store/useDevelopmentsStore'
import { JOIA, degradeJoiaClaro, fundoJoiaClaro } from '../../lib/paletaJoia'
import { ORIGEM_META } from './origens'
import { fraseContato, tomDoContato, TOM_CONTATO } from './contato'
import type { TomContato } from './contato'
import { ordenar, ordemEfetiva } from './leadFiltros'
import { ConcludeSaleModal } from './ConcludeSaleModal'
import { SinalDeFluxo } from './fluxos/SinalDeFluxo'
import toast from 'react-hot-toast'
import { abrirSePrimeiraChamada } from './primeiroContato'

// Re-export da fonte única — consumido por LeadsPage, o Pulse,
// LeadsPerformance e TransferToFunnelModal. Cores vivem em lib/stageTheme.ts.
export const STAGE_CONFIG = STAGE_THEME

const STAGES = FUNNEL_STAGES

/**
 * Cores da trilha: a paleta "joia" (lib/paletaJoia.ts) — a receita do card da
 * Meta de VGV (degradê a 140° + brilho champanhe) em um tom por etapa. O tom
 * médio é a --etapa da coluna (hover, alvo do arraste, progresso).
 */

/**
 * A comissão nesta visão (comissao.ts). O admin vê as duas partes — a do
 * corretor e a da imobiliária; o corretor vê só a dele.
 */
export interface Dinheiro { vgv: number; bruta: number; corretor: number; souza: number }
export interface VisaoComissao {
  /** admin: mostra corretor + imobiliária; corretor: só a parte dele */
  admin: boolean
  /** "Sua comissão", "Ryan" ou "Corretor" */
  rotuloCorretor: string
  doLead: (l: Lead) => Dinheiro
  total: (ls: Lead[]) => Dinheiro
}

/** Número em reais que conta até o valor e solta um "+R$" quando sobe. */
function DinheiroVivo({ valor, className = '', ganho = false }: { valor: number; className?: string; ganho?: boolean }) {
  const v = useContagem(valor, 900)
  const anterior = useRef(valor)
  const [subiu, setSubiu] = useState<{ k: number; d: number } | null>(null)
  useEffect(() => {
    const d = valor - anterior.current
    anterior.current = valor
    if (ganho && d > 0.5) setSubiu(s => ({ k: (s?.k ?? 0) + 1, d }))
  }, [valor, ganho])
  return (
    <span className={`relative inline-block tabular-nums ${className}`}>
      {formatCurrencyRound(Math.max(0, Math.round(v)))}
      {subiu && (
        <span key={subiu.k} aria-hidden
              className="kanban-ganho pointer-events-none absolute left-full ml-1.5 top-0 whitespace-nowrap text-[11px] font-bold text-success">
          +{formatCurrencyRound(Math.round(subiu.d))}
        </span>
      )}
    </span>
  )
}

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
// v12 (22/11/2026): o cartão ficou horizontal a pedido do Rafael, e isso pede
// coluna mais larga (22rem). Em tela menor que ~1900px o quadro rola para o
// lado, como no Salesforce — com encaixe suave em cada coluna.
const CLASSE_DA_COLUNA = 'flex flex-col flex-1 basis-[calc(100vw-2.5rem)] min-w-[calc(100vw-2.5rem)] sm:basis-[22rem] sm:min-w-[22rem] max-w-[26rem] snap-start'

function orderBetween(above: Lead | null, below: Lead | null): number {
  const a = above ? ordemEfetiva(above) : Date.now() + 1_000_000
  const b = below ? ordemEfetiva(below) : 0
  return (a + b) / 2
}

// ─── Card sortável ────────────────────────────────────────────────────────────

function LeadCard({
  lead, onClick, onConclude, isOverlay = false, isSaving = false, dense = false, comissao, aberto = false,
}: {
  /** a ficha deste lead está aberta — o cartão fica marcado em Marinho */
  aberto?: boolean
  /** quanto o lead vale de comissão nesta visão (ver VisaoComissao) */
  comissao?: VisaoComissao
  lead: Lead; onClick: () => void
  /** Abre o "Concluir venda" — o modal mora no Kanban, não no card */
  onConclude?: () => void
  isOverlay?: boolean; isSaving?: boolean
  /** Densidade compacta — esconde o contexto comercial e aperta o espaçamento. */
  dense?: boolean
}) {
  const { advanceFollowup, toggleFlag, update } = useLeadsStore()
  const { profile, allProfiles, isAdmin, viewAsBrokerId } = useAuthStore()
  const { properties } = usePropertiesStore()
  const { tasks } = useTasksStore()
  const { add: addInteraction } = useLeadInteractionsStore()

  // Corretor responsável. A foto só aparece onde há donos diferentes — na
  // visão global do admin. No quadro do corretor (ou filtrado num corretor)
  // todo cartão é do mesmo dono: a mesma foto cem vezes seria ruído (Rafael,
  // 22/11/2026).
  const responsavel = !lead.brokerId ? undefined
    : lead.brokerId === profile?.id ? profile : allProfiles.find(p => p.id === lead.brokerId)
  const mostrarDono = isAdmin && !viewAsBrokerId

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
    abrirSePrimeiraChamada(lead, 'whatsapp')   // 1ª chamada: o popup espera a volta do corretor
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

  const din = comissao && lead.averageTicket ? comissao.doLead(lead) : null

  // Followup atrasado (contato.ts): o cartão inteiro num tom pastel quando o
  // lead está há mais de 24 h sem contato.
  const tom = tomDoContato(lead)

  // Reentrada ainda não vista pelo dono — o único destaque que pode competir
  // com a próxima ação, porque não é o sistema cobrando: é o lead chamando.
  const aviso = isOverlay ? null : avisoReentrada(lead)

  // Progresso no funil: lead(0) → venda(5). Barra no pé do cartão — quanto
  // falta para a comissão (efeito de gradiente de meta: quanto mais perto,
  // mais vontade de empurrar).
  const passo = STAGES.indexOf(lead.funnelStage)

  // No toque não há hover nem alça visível: o cartão inteiro vira a alça
  // (segurar 250 ms arrasta — TouchSensor; um toque rápido abre a ficha).
  const toque = typeof window !== 'undefined' && window.matchMedia?.('(hover: none)').matches

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(toque && !isOverlay ? listeners : {})}
      onClick={onClick}
      role="button"
      tabIndex={isOverlay ? -1 : 0}
      onKeyDown={aoTeclarAbrir(onClick)}
      aria-label={`Abrir lead ${displayName}`}
      className={`kanban-card group relative border rounded-[16px] cursor-pointer overflow-hidden
        transition-[transform,box-shadow,background-color,border-color,opacity] duration-200
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand
        ${urgente ? 'kanban-card-alerta' : ''}
        ${tom && !isOverlay ? TOM_CONTATO[tom].classe : ''}
        ${aberto && !isOverlay ? 'kanban-card-aberto' : ''}
        ${dense ? 'px-3 pt-2.5 pb-3' : 'px-3.5 pt-3 pb-3.5'}
        ${isDragging && !isOverlay ? 'opacity-30 scale-95' : ''}
        ${isOverlay ? '!shadow-modal kanban-card-prioridade' : ''}
        ${isSaving ? 'opacity-60 pointer-events-none' : ''}
        ${lead.flagged ? 'kanban-card-prioridade' : ''}
        ${aviso ? 'kanban-card-alerta ring-1 ring-inset ring-info-line !border-info-line' : ''}
      `}
    >
      {/* ── Cartão v12 (22/11/2026) — horizontal ────────────────────────────
          Três faixas em vez de uma pilha:
            1. o dono (foto) · o lead e o produto · o VGV por extenso
            2. o dinheiro: a comissão do corretor (e da Souza, para o admin)
            3. o que fazer agora · a chamada no WhatsApp
          e, no pé, a barra de progresso das etapas.
          Valores sempre por extenso ("R$ 600.000,00"), a pedido do Rafael.
          Continuam fora: temperatura, "sem próxima ação", Difícil/Ideal,
          etiqueta PRIORIDADE e botão com fundo em repouso. */}
      {isSaving && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[16px] bg-black/20" role="status" aria-label="Salvando">
          <Loader2 size={16} className="animate-spin text-brand" strokeWidth={1.6} />
        </div>
      )}

      {aviso && (
        <p className="flex items-center gap-1.5 mb-2 font-label text-[11px] font-bold uppercase tracking-[0.08em] text-info"
           title={aviso.detalhe}>
          {aviso.tipo === 'cliente'
            ? <BadgeCheck size={12} strokeWidth={1.8} className="flex-shrink-0" aria-hidden />
            : <RefreshCw  size={12} strokeWidth={1.8} className="flex-shrink-0" aria-hidden />}
          <span className="truncate">{aviso.texto}</span>
        </p>
      )}

      {/* 1 · Dono · lead · VGV */}
      <div className="flex items-center gap-2.5 min-w-0">
        {responsavel && mostrarDono && (
          <span title={`Responsável: ${responsavel.name}`} className="flex-shrink-0">
            <FotoPerfil nome={responsavel.name} url={responsavel.avatarUrl} tamanho={dense ? 28 : 36} anel className="shadow-[0_2px_6px_-2px_rgba(15,39,89,.35)]" />
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="font-heading text-[14.5px] font-semibold text-t1 truncate leading-tight tracking-[-0.015em]">
              {displayName}
            </p>
            {lead.qualifiedAt && (
              <span className="flex-shrink-0 text-success" title="Lead qualificado">
                <BadgeCheck size={13} strokeWidth={2} aria-label="Lead qualificado" />
              </span>
            )}
            {lead.flagged && (
              <Star size={12} strokeWidth={1.8} fill="currentColor" className="flex-shrink-0 text-brand" aria-label="Prioridade" />
            )}
            <SinalDeFluxo quantos={lead.fluxosCount} />
          </div>
          <p className="mt-0.5 text-[12px] text-t3 truncate">
            {originMeta && (
              <originMeta.icon size={11} strokeWidth={1.6} className="inline-block align-[-1px] mr-1 text-t4" aria-label={originMeta.label} />
            )}
            {property ? property.name : (lead.propertyName ?? 'Sem produto')}
          </p>
        </div>
        {lead.averageTicket ? (
          <div className="flex-shrink-0 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-t4 leading-none">VGV</p>
            <p className="mt-1 text-[13.5px] font-bold text-t1 tabular-nums leading-none">{formatCurrencyFull(lead.averageTicket)}</p>
          </div>
        ) : null}
      </div>

      {/* 2 · O dinheiro em jogo — por extenso */}
      {!dense && din && comissao && (din.corretor > 0 || comissao.admin) && (
        <div className="kanban-faixa mt-2.5 flex items-stretch rounded-[11px] bg-s2/70 overflow-hidden text-[12.5px]">
          <div className="flex-1 min-w-0 px-2.5 py-1.5 flex items-center justify-between gap-2"
               title={comissao.admin ? 'Comissão líquida do corretor' : 'Sua comissão líquida (% do produto sobre o VGV − 3% ISS − 6% Simples)'}>
            <span className="text-[11.5px] font-medium text-success/80 truncate">
              {comissao.admin && responsavel ? responsavel.name.split(' ')[0] : comissao.rotuloCorretor}
            </span>
            <span className="font-bold text-success tabular-nums whitespace-nowrap">{din.corretor > 0 ? formatCurrencyFull(din.corretor) : '—'}</span>
          </div>
          {comissao.admin && (
            <div className="flex-1 min-w-0 px-2.5 py-1.5 flex items-center justify-between gap-2 border-l border-line" title="Comissão líquida da imobiliária">
              <span className="text-[11.5px] font-medium text-brand-text/80">Souza</span>
              <span className="font-bold text-brand-text tabular-nums whitespace-nowrap">{formatCurrencyFull(din.souza)}</span>
            </div>
          )}
        </div>
      )}

      {/* 3 · O que fazer agora · chamada */}
      <div className="mt-2.5 flex items-center gap-2 min-w-0">
        {next && NextIcon ? (
          <div
            className={`flex-1 min-w-0 flex items-center gap-1.5 ${urgente ? `kanban-aviso rounded-[9px] border px-2 py-1 ${nextStyle!.chip}` : ''}`}
            title={next.hint}
          >
            <NextIcon size={13} strokeWidth={1.8} className={`kanban-aviso-icone flex-shrink-0 ${nextStyle!.iconColor}`} aria-hidden />
            {next.urgency === 'none' ? (
              <p className="kanban-frase flex-1 min-w-0 truncate text-[12px] text-t3">{fraseContato(lead)}</p>
            ) : (
              <p className={`flex-1 min-w-0 truncate text-[12px] font-semibold ${nextStyle!.text}`}>{next.text}</p>
            )}
            {!isOverlay && (
              <span className="flex-shrink-0 text-[11px] text-t4 tabular-nums" title={`${stageDays} ${stageDays === 1 ? 'dia' : 'dias'} nesta etapa`}>
                {stageDays}d
              </span>
            )}
          </div>
        ) : <div className="flex-1" />}

        {!isOverlay && lead.funnelStage === 'venda' && !lead.closedAt ? (
          <button
            onClick={e => { e.stopPropagation(); onConclude?.() }}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 h-8 text-[12px] font-bold text-brand-fill-text bg-brand-fill hover:bg-brand-fill-hover rounded-full transition-all duration-150 active:scale-[0.97]"
            title="Concluir a venda e registrar no faturamento"
          >
            <Trophy size={12} strokeWidth={1.8} />
            Concluir venda
          </button>
        ) : (
          <button
            onClick={handleWhatsApp}
            className="flex-shrink-0 flex items-center gap-1.5 px-2.5 h-8 text-[12.5px] font-semibold text-success rounded-full
                       transition-colors duration-150 active:scale-[0.97]
                       hover:!bg-success hover:!text-[var(--grad-call-text,#0F1730)]
                       focus-visible:bg-success-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-success/40"
            title={`${STAGE_CTA[lead.funnelStage] ?? 'Registrar contato'} — abre o WhatsApp e registra o contato`}
            aria-label={`${STAGE_CTA[lead.funnelStage] ?? 'Registrar contato'}: chamar ${displayName} no WhatsApp`}
          >
            <MessageCircle size={13} strokeWidth={1.8} className="flex-shrink-0" />
            Chamar
          </button>
        )}

        {/* Atalhos — flutuam no canto do cartão, só no hover/foco do
            computador. No toque somem: tocar o cartão abre a ficha, que tem
            todos eles. */}
        <div className={`absolute right-2 top-2 z-10 flex items-center gap-0.5 rounded-full border border-line bg-surface px-1 py-0.5 shadow-[0_6px_16px_-8px_rgba(15,39,89,.35)]
                         opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 [@media(hover:none)]:hidden`}>
          <button
            onClick={async e => {
              e.stopPropagation()
              try { await toggleFlag(lead.id) } catch { /* erro já toastado */ }
            }}
            className={`w-7 h-7 flex items-center justify-center rounded-full transition-colors hover:bg-brand-tint
                        focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${lead.flagged ? 'text-brand' : 'text-t4 hover:text-brand'}`}
            title={lead.flagged ? 'Remover prioridade' : 'Marcar prioridade máxima'}
            aria-label={lead.flagged ? 'Remover prioridade' : 'Marcar prioridade máxima'}
            aria-pressed={!!lead.flagged}
          >
            <Star size={13} strokeWidth={1.6} fill={lead.flagged ? 'currentColor' : 'none'} />
          </button>
          <button
            onClick={handleWhatsAppOpen}
            className="w-7 h-7 flex items-center justify-center text-t4 hover:text-success hover:bg-success-bg rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            title="Só abrir WhatsApp, sem registrar"
            aria-label={`Abrir WhatsApp de ${displayName} sem registrar contato`}
          >
            <MessageCircle size={13} strokeWidth={1.6} />
          </button>
          <a
            href={`tel:${displayPhone}`}
            onClick={e => { e.stopPropagation(); abrirSePrimeiraChamada(lead, 'ligacao') }}
            className="w-7 h-7 flex items-center justify-center text-t4 hover:text-t1 hover:bg-s3 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            title={`Ligar — ${formatPhone(displayPhone)}`}
            aria-label={`Ligar para ${displayName}, ${formatPhone(displayPhone)}`}
          >
            <Phone size={13} strokeWidth={1.6} />
          </a>
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- invólucro que só contém a propagação do clique — quem age são os botões dentro */}
          <div
            {...listeners}
            {...attributes}
            onClick={e => e.stopPropagation()}
            aria-label="Arrastar lead"
            className="w-6 h-7 flex items-center justify-center text-t4 hover:text-t2 cursor-grab active:cursor-grabbing"
          >
            <GripVertical size={13} strokeWidth={1.6} />
          </div>
        </div>
      </div>

      {/* Toques do followup — só onde a cadência existe. Ficam à vista também
          no modo compacto: o Rafael pediu que os toques continuem no cartão
          (16/11/2026). Cada traço é um toque; clicar marca até ali. */}
      {lead.funnelStage === 'followup' && (
        <div className={`flex items-center gap-1 mt-2`} role="group" aria-label={`${lead.followupStep} de ${MAX_TENTATIVAS_FOLLOWUP} tentativas`}>
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

      {/* Progresso no funil, no pé do cartão — cada traço uma etapa, na cor
          dela, aceso até onde o lead chegou */}
      <div className="absolute left-0 right-0 bottom-0 flex gap-[2px] px-3.5 pb-1.5" role="img"
           aria-label={`Etapa ${passo + 1} de ${STAGES.length}: ${STAGE_CONFIG[lead.funnelStage].label}`}
           title={`Etapa ${passo + 1} de ${STAGES.length} · faltam ${STAGES.length - 1 - passo} para a venda`}>
        {STAGES.map((st, i) => (
          <span key={st} className="flex-1 h-[3px] rounded-full transition-colors duration-300"
                style={{ background: i <= passo ? JOIA[st].medio : 'var(--s3)' }} />
        ))}
      </div>
    </div>
  )
}

// ─── Coluna do kanban ─────────────────────────────────────────────────────────

function KanbanColumn({
  stage, leads, total, onCardClick, onConclude, isActiveDragTarget, savingId, dense,
  onFiltrarAtrasado, filtroAtrasadoAtivo, arrastando, comissao, primeira, abertoId,
}: {
  /** lead com a ficha aberta — o cartão fica marcado */
  abertoId: string | null
  comissao: VisaoComissao
  /** a primeira seta da trilha não tem o entalhe à esquerda */
  primeira: boolean
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
  onFiltrarAtrasado?: () => void
  filtroAtrasadoAtivo: boolean
}) {
  const conf = STAGE_CONFIG[stage]
  const { isOver, setNodeRef } = useDroppable({ id: stage })
  const ids = leads.map(l => l.id)

  const totais = comissao.total(leads)
  // Risco da coluna: os cartões em vermelho (followup atrasado, +24h sem
  // contato). Mesma régua da cor, do atalho e da legenda (contato.ts).
  const atrasados = leads.filter(l => tomDoContato(l) === 'atrasado').length
  const riskPct = leads.length > 0 ? Math.round((atrasados / leads.length) * 100) : 0

  const alvo = isOver || isActiveDragTarget
  const vazia = leads.length === 0

  // Toda coluna fica sempre aberta, cheia ou vazia (pedido do Rafael em
  // 16/11/2026): o quadro tem sempre as mesmas colunas no mesmo lugar. Antes a
  // vazia virava um trilho estreito que se abria no clique ou durante o arraste.
  return (
    // --etapa: o tom médio da etapa (hover, alvo); --etapa-fundo: a seta.
    <div className={CLASSE_DA_COLUNA}
         style={{ ['--etapa' as string]: JOIA[stage].medio, ['--etapa-fundo' as string]: fundoJoiaClaro(stage, 120) }}
         id={`coluna-${stage}`}>
      <div className="flex flex-col flex-1 kanban-col">
        {/* Cabeçalho fixo: a seta da trilha e, embaixo, o dinheiro da coluna */}
        <div className="kanban-cabeca kanban-col-bg sticky top-0 z-10 pb-2 mb-1.5">
          <div className={`kanban-trilha ${primeira ? 'kanban-trilha-primeira' : ''} flex items-center gap-2 h-10 pl-6 pr-7 text-white`}
               style={primeira ? { paddingLeft: 14 } : undefined}>
            <h3 className="text-[13.5px] font-semibold tracking-[0.01em] truncate">{conf.columnLabel}</h3>
            <span className="ml-auto inline-flex items-center justify-center min-w-[24px] h-[20px] px-1.5 rounded-full bg-white/25 text-[12px] font-bold tabular-nums">
              {leads.length}
              {total !== undefined && total !== leads.length && (
                <span className="font-medium opacity-80" title={`${leads.length} de ${total} leads desta etapa`}>/{total}</span>
              )}
            </span>
          </div>

          {/* O dinheiro da coluna: VGV em cima; embaixo, a comissão do
              corretor e (para o admin) a da Souza */}
          <div className="px-2 pt-2.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-t4">VGV</p>
            <DinheiroVivo valor={totais.vgv} className="font-display text-[19px] font-bold text-t1 leading-tight tracking-[-0.02em]" />
            <div className={`mt-1.5 grid ${comissao.admin ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
              <div className="min-w-0">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-success/80 truncate">{comissao.rotuloCorretor}</p>
                <DinheiroVivo valor={totais.corretor} ganho className="text-[13.5px] font-bold text-success leading-tight" />
              </div>
              {comissao.admin && (
                <div className="min-w-0">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-brand-text/80 truncate">Souza</p>
                  <DinheiroVivo valor={totais.souza} ganho className="text-[13.5px] font-bold text-brand-text leading-tight" />
                </div>
              )}
            </div>
          </div>

          {atrasados > 0 && (
            <div className="px-2 pt-1">
              {onFiltrarAtrasado ? (
                <button
                  type="button"
                  onClick={onFiltrarAtrasado}
                  aria-pressed={filtroAtrasadoAtivo}
                  title={filtroAtrasadoAtivo
                    ? 'Mostrar todos os leads de novo'
                    : `${atrasados} com followup atrasado — mais de 24h sem contato (${riskPct}%). Clique para ver só eles.`}
                  className={`kanban-atrasados inline-flex items-center gap-1 px-1.5 h-6 -ml-1.5 rounded-md text-[12px] font-semibold tabular-nums
                    transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-error/40
                    ${filtroAtrasadoAtivo ? 'kanban-atrasados-ativo' : ''}`}
                >
                  <AlarmClock size={11} strokeWidth={2} aria-hidden />
                  {atrasados} {atrasados === 1 ? 'atrasado' : 'atrasados'}
                  {filtroAtrasadoAtivo && <X size={10} strokeWidth={2} aria-hidden />}
                </button>
              ) : (
                <span className="kanban-atrasados inline-flex items-center gap-1 text-[12px] font-semibold tabular-nums"
                      title={`${atrasados} com followup atrasado — mais de 24h sem contato`}>
                  <AlarmClock size={11} strokeWidth={2} aria-hidden />{atrasados} {atrasados === 1 ? 'atrasado' : 'atrasados'}
                </span>
              )}
            </div>
          )}
        </div>

        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div
            ref={setNodeRef}
            className={`flex-1 min-h-[420px] rounded-[14px] p-1.5 transition-colors duration-200 flex flex-col stagger-children
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
                aberto={abertoId === lead.id}
                dense={dense} comissao={comissao}
              />
            ))}
          </div>
        </SortableContext>
      </div>
    </div>
  )
}

// ─── Placar do topo ───────────────────────────────────────────────────────────

function Placar({ rotulo, valor, cor, fundo, destaque = false, foto, nota, titulo }: {
  rotulo: string; valor: number; cor: string; fundo?: string; destaque?: boolean
  /** no lugar do ícone: a foto do corretor */
  foto?: { nome: string; url?: string }
  nota?: string
  titulo?: string
}) {
  return (
    <div className="flex-shrink-0 snap-start flex items-center gap-3 rounded-[14px] border border-line bg-surface pl-2.5 pr-4 py-2" title={titulo}>
      {foto ? (
        <FotoPerfil nome={foto.nome} url={foto.url} tamanho={36} />
      ) : (
        <span className="flex-shrink-0 w-9 h-9 rounded-[11px] flex items-center justify-center text-white" style={{ backgroundImage: fundo }} aria-hidden>
          <Sparkles size={16} strokeWidth={2} />
        </span>
      )}
      <div className="min-w-0">
        <p className="text-[11.5px] font-medium text-t3 leading-tight truncate">
          {rotulo}{nota && <span className="text-t4"> · {nota}</span>}
        </p>
        <span style={{ color: cor }}>
          <DinheiroVivo valor={valor} ganho={destaque}
            className={`font-display ${destaque ? 'text-[21px]' : 'text-[19px]'} font-bold leading-tight tracking-[-0.02em]`} />
        </span>
      </div>
    </div>
  )
}

// ─── Legenda do destaque de contato ───────────────────────────────────────────

/** As cores do cartão (hoje só o followup atrasado), com quantos há de cada. */
export function LegendaContato({ porTom, onFiltrar, ativo = false }: {
  porTom: Record<TomContato, number>
  /** a legenda é também o atalho: clicar mostra só os cartões daquela cor */
  onFiltrar?: () => void
  ativo?: boolean
}) {
  const itens = (Object.keys(TOM_CONTATO) as TomContato[]).filter(t => porTom[t] > 0 || ativo)
  if (itens.length === 0) return null
  return (
    <div className="hidden sm:flex items-center gap-3 mr-2 text-[12px] text-t3" aria-label="Cores dos cartões">
      {itens.map(t => {
        const corpo = (
          <>
            <span className="kanban-tom-amostra w-3 h-3 rounded-[4px]" aria-hidden />
            {TOM_CONTATO[t].rotulo}
            <span className="font-semibold text-t2 tabular-nums">{porTom[t]}</span>
            {ativo && <X size={11} strokeWidth={2} aria-hidden />}
          </>
        )
        return onFiltrar ? (
          <button key={t} type="button" onClick={onFiltrar} aria-pressed={ativo}
            title={ativo ? 'Mostrar todos os leads de novo' : `${TOM_CONTATO[t].dica} Clique para ver só eles.`}
            className={`${TOM_CONTATO[t].classe} legenda-tom inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full cursor-pointer
                        focus:outline-none focus-visible:ring-2 focus-visible:ring-error/40 ${ativo ? 'legenda-tom-ativa' : ''}`}>
            {corpo}
          </button>
        ) : (
          <span key={t} className={`${TOM_CONTATO[t].classe} inline-flex items-center gap-1.5`} title={TOM_CONTATO[t].dica}>{corpo}</span>
        )
      })}
    </div>
  )
}

// ─── Kanban principal ─────────────────────────────────────────────────────────

interface LeadKanbanProps {
  leads: Lead[]
  /** total por etapa sem filtro — só quando há recorte aplicado */
  totalPorEtapa?: Record<LeadFunnelStage, number>
  /** liga/desliga o filtro "followup atrasado" pelo cabeçalho da coluna e pela legenda */
  onFiltrarAtrasado?: () => void
  filtroAtrasadoAtivo?: boolean
}

export function LeadKanban({ leads, totalPorEtapa, onFiltrarAtrasado, filtroAtrasadoAtivo = false }: LeadKanbanProps) {
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
  const { dense, sort, setDense } = useKanbanPrefs()
  const { isAdmin, profile, allProfiles, viewAsBrokerId } = useAuthStore()
  // % de comissão de cada produto vem da carteira (migração 108)
  const developments = useDevelopmentsStore(s => s.developments)
  const carregarCarteira = useDevelopmentsStore(s => s.carregarCarteira)
  useEffect(() => { void carregarCarteira() }, [carregarCarteira])

  // ── Comissão nesta visão (comissao.ts) ────────────────────────────────────
  // Admin vê, de cada lead, a parte do corretor dono e o que fica com a Souza
  // (na visão global, na própria ou vendo um corretor). O corretor vê só a
  // parte dele. Lead sem parte (do próprio admin) fica todo com a Souza.
  const comissao = useMemo<VisaoComissao>(() => {
    const shareDe = (id: string | null | undefined) =>
      (id ? (id === profile?.id ? profile.commissionShare : allProfiles.find(p => p.id === id)?.commissionShare) : null) ?? null
    const pctPorProduto = new Map(developments.map(d => [d.id, d.commissionPct]))
    const doLead = (l: Lead): Dinheiro => {
      const vgv = l.averageTicket ?? 0
      const pct = (l.developmentId && pctPorProduto.get(l.developmentId)) || PCT_PADRAO
      const d = divisao(vgv, shareDe(l.brokerId), pct)
      return { vgv, bruta: d.bruta, corretor: d.corretor, souza: d.souza }
    }
    const nomeVisto = isAdmin && viewAsBrokerId && viewAsBrokerId !== profile?.id
      ? allProfiles.find(p => p.id === viewAsBrokerId)?.name.split(' ')[0]
      : null
    return {
      admin: isAdmin,
      rotuloCorretor: !isAdmin ? 'Sua comissão' : nomeVisto ?? 'Corretor',
      doLead,
      total: ls => ls.reduce<Dinheiro>((t, l) => {
        if (!l.averageTicket) return t
        const d = doLead(l)
        return { vgv: t.vgv + d.vgv, bruta: t.bruta + d.bruta, corretor: t.corretor + d.corretor, souza: t.souza + d.souza }
      }, { vgv: 0, bruta: 0, corretor: 0, souza: 0 }),
    }
  }, [isAdmin, profile, allProfiles, viewAsBrokerId, developments])

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

  // Celular (24/11/2026): uma coluna por tela, e a primeira costuma ser
  // "Leads", quase sempre vazia — o corretor abria o funil e via "Nada em
  // leads". Na primeira carga o quadro já começa na primeira etapa com
  // cartão. Só uma vez: depois disso o deslize é de quem está usando.
  const quadroRef = useRef<HTMLDivElement>(null)
  const posicionou = useRef(false)
  useEffect(() => {
    const el = quadroRef.current
    if (posicionou.current || !el || leads.length === 0) return
    posicionou.current = true
    if (window.innerWidth >= 640 || el.scrollLeft > 0) return
    const primeira = STAGES.find(st => sortedByStage[st].length > 0)
    const coluna = primeira && primeira !== STAGES[0] ? document.getElementById(`coluna-${primeira}`) : null
    if (coluna) el.scrollLeft += coluna.getBoundingClientRect().left - el.getBoundingClientRect().left - 4
  }, [leads.length, sortedByStage])

  // Placar do topo — o que está em jogo nos leads em aberto (fora Venda).
  const resumo = useMemo(() => {
    const ativos = leads.filter(l => l.funnelStage !== 'venda')
    // Parte líquida de cada corretor (só quem tem parte e lead com valor)
    const porId = new Map<string, number>()
    for (const l of ativos) {
      if (!l.brokerId || !l.averageTicket) continue
      const c = comissao.doLead(l).corretor
      if (c > 0) porId.set(l.brokerId, (porId.get(l.brokerId) ?? 0) + c)
    }
    const corretores = [...porId.entries()]
      .map(([id, valor]) => {
        const p = id === profile?.id ? profile : allProfiles.find(x => x.id === id)
        return { id, valor, nome: p?.name ?? 'Corretor', url: p?.avatarUrl, share: p?.commissionShare ?? null }
      })
      .sort((a, b) => b.valor - a.valor)
    return { ativos: ativos.length, ...comissao.total(ativos), corretores }
  }, [leads, comissao, profile, allProfiles])

  const activeLead = activeId ? leads.find(l => l.id === activeId) : null

  // Legenda do destaque de contato, com quantos cartões há de cada tom
  const porTom = useMemo(() => {
    const n: Record<TomContato, number> = { atrasado: 0 }
    for (const l of leads) { const t = tomDoContato(l); if (t) n[t]++ }
    return n
  }, [leads])

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
      {/* ── Placar — o que está em jogo nos leads em aberto ──────────────────
          Ganho à vista, não meta a cumprir: é o que dá vontade de chamar o
          próximo. O admin vê VGV, comissão geral (5%), a líquida da Souza e
          a líquida de cada corretor, com a foto; o corretor vê só a dele.
          5% do VGV − 3% ISS − 6% Simples (comissao.ts). */}
      <div className="flex items-center gap-x-3 gap-y-3 flex-wrap mb-4 px-1">
        {/* No celular os números correm numa faixa só, com rolagem lateral */}
        <div className="flex items-stretch gap-2 max-w-full overflow-x-auto sm:flex-wrap sm:overflow-visible -mx-1 px-1 pb-1 sm:pb-0 snap-x">
          {comissao.admin ? (
            <>
              <Placar rotulo="VGV" nota={`${resumo.ativos} leads em aberto`} valor={resumo.vgv} cor="var(--t1)"
                      fundo={degradeJoiaClaro('lead')} />
              <Placar rotulo="Comissão geral" nota={resumo.vgv ? `${(resumo.bruta / resumo.vgv * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% do VGV` : '5% do VGV'} valor={resumo.bruta} cor="var(--t1)"
                      fundo={degradeJoiaClaro('atendimento')}
                      titulo={`Bruta. Depois do ISS (3%) e do Simples (6%), sobra ${formatCurrencyRound(resumo.corretor + resumo.souza)} líquidos.`} />
              <Placar rotulo="Líquida Souza" valor={resumo.souza} cor="var(--brand-text)" destaque
                      fundo={degradeJoiaClaro('proposta')} />
              {resumo.corretores.map(c => (
                <Placar key={c.id} rotulo={`Líquida ${c.nome.split(' ')[0]}`} nota={c.share ? `${c.share}%` : undefined}
                        valor={c.valor} cor="#16A34A" destaque foto={{ nome: c.nome, url: c.url }} />
              ))}
            </>
          ) : (
            <>
              <Placar rotulo="Sua comissão em jogo" valor={resumo.corretor} cor="#16A34A" destaque
                      foto={profile ? { nome: profile.name, url: profile.avatarUrl } : undefined}
                      fundo={degradeJoiaClaro('venda')} />
              <Placar rotulo="VGV" nota={`${resumo.ativos} leads em aberto`} valor={resumo.vgv} cor="var(--t1)"
                      fundo={degradeJoiaClaro('lead')} />
            </>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <LegendaContato porTom={porTom} onFiltrar={onFiltrarAtrasado} ativo={filtroAtrasadoAtivo} />
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
        <div ref={quadroRef} className="flex gap-3 overflow-x-auto pb-4 px-1 items-stretch [justify-content:safe_center] snap-x snap-proximity scroll-px-1">
          {STAGES.map((stage, i) => (
            <KanbanColumn
              key={stage}
              stage={stage}
              leads={sortedByStage[stage]}
              total={totalPorEtapa?.[stage]}
              onFiltrarAtrasado={onFiltrarAtrasado}
              filtroAtrasadoAtivo={filtroAtrasadoAtivo}
              abertoId={searchParams.get('lead')}
              onCardClick={setSelectedLead}
              onConclude={l => setConcludeId(l.id)}
              dense={dense}
              isActiveDragTarget={overStage === stage && !!activeId}
              savingId={savingId}
              arrastando={!!activeId}
              comissao={comissao}
              primeira={i === 0}
            />
          ))}
        </div>

        <DragOverlay>
          {activeLead ? (
            <div style={{ ['--etapa' as string]: JOIA[activeLead.funnelStage].medio }}>
              <LeadCard lead={activeLead} onClick={() => {}} isOverlay dense={dense} comissao={comissao} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {concludeLead && !concludeLead.closedAt && (
        <ConcludeSaleModal lead={concludeLead} onClose={() => setConcludeId(null)} />
      )}
    </>
  )
}
