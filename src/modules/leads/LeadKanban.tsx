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
  MessageCircle, GripVertical, Phone, Star, Snowflake, Loader2,
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
import { formatPhone, formatCurrency, whatsappUrl } from '../../lib/formatters'
import { computeNextAction, URGENCY_STYLE, STAGE_CTA } from './nextAction'
import { aoTeclarAbrir } from '../../components/shared/lista'
import { avisoReentrada } from './reentrada'
import { useKanbanPrefs } from '../../store/useKanbanPrefs'
import { useContagem } from '../../hooks/useContagem'
import { divisao } from './comissao'
import { ORIGEM_META } from './origens'
import { semContatoHaMaisDe, fraseContato, ESFRIANDO_DIAS } from './contato'
import { ordenar, ordemEfetiva } from './leadFiltros'
import { ConcludeSaleModal } from './ConcludeSaleModal'
import { SinalDeFluxo } from './fluxos/SinalDeFluxo'
import toast from 'react-hot-toast'

// Re-export da fonte única — consumido por LeadsPage, o Pulse,
// LeadsPerformance e TransferToFunnelModal. Cores vivem em lib/stageTheme.ts.
export const STAGE_CONFIG = STAGE_THEME

const STAGES = FUNNEL_STAGES

/**
 * Cores vivas da trilha (as mesmas do Pulse e do funil da Conversão): do claro
 * ao profundo. A profunda é a --etapa da coluna (avatar, borda do hover, alvo
 * do arraste); o par vira o degradê da seta do cabeçalho.
 */
const COR_ETAPA: Record<LeadFunnelStage, [string, string]> = {
  lead:        ['#818CF8', '#4F46E5'],
  followup:    ['#C084FC', '#9333EA'],
  atendimento: ['#38BDF8', '#0284C7'],
  visita:      ['#2DD4BF', '#0D9488'],
  proposta:    ['#FBBF24', '#D97706'],
  venda:       ['#4ADE80', '#16A34A'],
}

/**
 * A comissão nesta visão (comissao.ts). O admin vê as duas partes — a do
 * corretor e a da imobiliária; o corretor vê só a dele.
 */
export interface Dinheiro { vgv: number; corretor: number; souza: number }
export interface VisaoComissao {
  /** admin: mostra corretor + imobiliária; corretor: só a parte dele */
  admin: boolean
  /** "Sua comissão", "Ryan" ou "Corretor" */
  rotuloCorretor: string
  doLead: (l: Lead) => Dinheiro
  total: (ls: Lead[]) => Dinheiro
}

function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/).filter(Boolean)
  if (p.length === 0) return '?'
  return ((p[0][0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase()
}

/**
 * Foto redonda do corretor responsável — rosto conhecido no cartão: o lead
 * tem dono, e o dono é gente. Sem foto, as iniciais na cor da marca.
 */
function FotoCorretor({ nome, url, tamanho = 30 }: { nome: string; url?: string; tamanho?: number }) {
  const [falhou, setFalhou] = useState(false)
  return url && !falhou ? (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- onError não é interação: só troca a foto quebrada pelas iniciais
    <img src={url} alt="" onError={() => setFalhou(true)} draggable={false}
         className="rounded-full object-cover ring-2 ring-surface shadow-[0_2px_6px_-2px_rgba(15,39,89,.35)] flex-shrink-0"
         style={{ width: tamanho, height: tamanho }} />
  ) : (
    <span className="rounded-full bg-brand-tint text-brand-text ring-2 ring-surface flex items-center justify-center text-[10.5px] font-bold flex-shrink-0"
          style={{ width: tamanho, height: tamanho }} aria-hidden>
      {iniciais(nome)}
    </span>
  )
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
      {v < 1 ? 'R$ 0' : formatCurrency(v)}
      {subiu && (
        <span key={subiu.k} aria-hidden
              className="kanban-ganho pointer-events-none absolute left-full ml-1.5 top-0 whitespace-nowrap text-[11px] font-bold text-success">
          +{formatCurrency(subiu.d)}
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
const CLASSE_DA_COLUNA = 'flex flex-col flex-1 basis-[18.5rem] min-w-[18.5rem] lg:basis-[15rem] lg:min-w-[15rem] max-w-[22rem]'

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
  lead, onClick, onConclude, isOverlay = false, isSaving = false, dense = false, comissao,
}: {
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
  const { profile, allProfiles } = useAuthStore()
  const { properties } = usePropertiesStore()
  const { tasks } = useTasksStore()
  const { add: addInteraction } = useLeadInteractionsStore()

  // Corretor responsável: a foto vai no canto do cartão, em toda visão
  const responsavel = !lead.brokerId ? undefined
    : lead.brokerId === profile?.id ? profile : allProfiles.find(p => p.id === lead.brokerId)

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

  const din = comissao && lead.averageTicket ? comissao.doLead(lead) : null

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
      className={`kanban-card group relative border rounded-[16px] cursor-pointer overflow-hidden
        transition-[transform,box-shadow,background-color,border-color,opacity] duration-200
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand
        ${urgente ? 'kanban-card-alerta' : ''}
        ${dense ? 'px-3 py-2.5' : 'px-3.5 pt-3 pb-2.5'}
        ${isDragging && !isOverlay ? 'opacity-30 scale-95' : ''}
        ${isOverlay ? '!shadow-modal kanban-card-prioridade' : ''}
        ${isSaving ? 'opacity-60 pointer-events-none' : ''}
        ${lead.flagged ? 'kanban-card-prioridade' : ''}
        ${aviso ? 'kanban-card-alerta ring-1 ring-inset ring-info-line !border-info-line' : ''}
      `}
    >
      {/* ── Cartão v11 (22/11/2026) ─────────────────────────────────────────
          De cima para baixo, o que decide a ligação:
            1. QUEM — o nome do lead e, no canto, o rosto do corretor dono
            2. O QUÊ — produto e origem
            3. QUANTO — VGV e comissão (o corretor vê a dele; o admin vê a do
               corretor e a da imobiliária). Dinheiro à vista dá vontade de ligar.
            4. QUANDO — a próxima ação (faixa tingida só com prazo ou risco)
            5. AÇÃO — chamar no WhatsApp, em verde
          Continuam fora do cartão, a pedido do Rafael: temperatura, "sem
          próxima ação", Difícil/Ideal, etiqueta PRIORIDADE e botão com fundo
          em repouso. */}
      {isSaving && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-[16px] bg-black/20" role="status" aria-label="Salvando">
          <Loader2 size={16} className="animate-spin text-brand" strokeWidth={1.6} />
        </div>
      )}

      {/* O lead chamou (reentrada) — acima de tudo: é o motivo de abrir este */}
      {aviso && (
        <p className="flex items-center gap-1.5 mb-2 pr-10 font-label text-[11px] font-bold uppercase tracking-[0.08em] text-info"
           title={aviso.detalhe}>
          {aviso.tipo === 'cliente'
            ? <BadgeCheck size={12} strokeWidth={1.8} className="flex-shrink-0" aria-hidden />
            : <RefreshCw  size={12} strokeWidth={1.8} className="flex-shrink-0" aria-hidden />}
          <span className="truncate">{aviso.texto}</span>
        </p>
      )}

      {/* 1 + 2 · Quem e o quê */}
      <div className="flex items-start gap-2.5 min-w-0">
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
          <p className="mt-1 text-[12px] text-t3 truncate">
            {originMeta && (
              <originMeta.icon size={11} strokeWidth={1.6} className="inline-block align-[-1px] mr-1 text-t4" aria-label={originMeta.label} />
            )}
            {property ? property.name : (lead.propertyName ?? 'Sem produto')}
            {dense && lead.averageTicket ? <span className="text-t2 font-semibold tabular-nums"> · {formatCurrency(lead.averageTicket)}</span> : null}
          </p>
        </div>
        {responsavel && (
          <span title={`Responsável: ${responsavel.name}`} className="flex-shrink-0">
            <FotoCorretor nome={responsavel.name} url={responsavel.avatarUrl} tamanho={dense ? 26 : 32} />
          </span>
        )}
      </div>

      {/* 3 · Quanto — o VGV numa linha; embaixo, a comissão do corretor e
             (para o admin) a da Souza, lado a lado */}
      {!dense && din && comissao && (
        <div className="mt-2.5 rounded-[11px] bg-s2/70 px-2.5 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-t4">VGV</span>
            <span className="text-[13.5px] font-bold text-t1 tabular-nums">{formatCurrency(din.vgv)}</span>
          </div>
          <div className={`mt-1.5 pt-1.5 border-t border-line grid ${comissao.admin ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
            <div className={`min-w-0 ${comissao.admin ? '' : 'flex items-baseline justify-between gap-2'}`}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-success/80 truncate">{comissao.rotuloCorretor}</p>
              <p className="text-[13px] font-bold text-success tabular-nums truncate">{din.corretor > 0 ? formatCurrency(din.corretor) : '—'}</p>
            </div>
            {comissao.admin && (
              <div className="min-w-0 border-l border-line pl-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-brand-text/80 truncate">Souza</p>
                <p className="text-[13px] font-bold text-brand-text tabular-nums truncate">{formatCurrency(din.souza)}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4 · Quando — risco chama pela FRASE e pelo ícone; sem ação marcada,
             só o último contato, neutro ("sem próxima ação" não volta). */}
      {next && NextIcon && (
        <div
          className={`flex items-center gap-1.5 min-w-0 mt-2.5 ${urgente ? `rounded-[9px] border px-2 py-1.5 ${nextStyle!.chip}` : ''}`}
          title={next.hint}
        >
          <NextIcon size={13} strokeWidth={1.8} className={`flex-shrink-0 ${nextStyle!.iconColor}`} aria-hidden />
          {next.urgency === 'none' ? (
            <p className="flex-1 min-w-0 truncate text-[12px] text-t3">{fraseContato(lead)}</p>
          ) : (
            <p className={`flex-1 min-w-0 truncate text-[12px] font-semibold ${nextStyle!.text}`}>{next.text}</p>
          )}
          {!isOverlay && (
            <span className="flex-shrink-0 text-[11px] text-t4 tabular-nums" title={`${stageDays} ${stageDays === 1 ? 'dia' : 'dias'} nesta etapa`}>
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

      {/* 5 · Ação — em Venda, concluir (o único botão cheio: dinheiro);
             nas outras, chamar no WhatsApp, em verde e sem caixa em repouso.
             Atalhos (prioridade, só abrir o WhatsApp, ligar, arrastar)
             aparecem no hover — e ficam sempre à vista no toque. */}
      <div className={`relative flex items-center gap-0.5 -mb-0.5 ${dense ? 'mt-1.5' : 'mt-2.5 pt-1.5 border-t border-line'}`}>
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
            className="flex-1 min-w-0 -ml-1.5 flex items-center justify-start gap-1.5 px-1.5 min-h-[32px] text-[12.5px] font-semibold
                       text-success rounded-[8px] transition-colors duration-150 active:scale-[0.98]
                       hover:!bg-success hover:!text-[var(--grad-call-text,#0F1730)]
                       focus-visible:bg-success-bg
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-success/40"
            title="Abrir WhatsApp e registrar o contato na timeline"
          >
            <MessageCircle size={13} strokeWidth={1.8} className="flex-shrink-0" />
            <span className="truncate">{STAGE_CTA[lead.funnelStage] ?? 'Registrar contato'}</span>
          </button>
        )}
        {/* Atalhos por cima do fim do rodapé, só no hover/foco (sempre à vista
            no toque): assim a chamada principal não perde espaço em repouso. */}
        <div className={`absolute right-0 bottom-0 top-1.5 flex items-center gap-0.5 pl-3 bg-gradient-to-l from-[var(--kanban-card-bg)] from-80% to-transparent ${ATALHO_DO_CARD}`}>
          <button
            onClick={async e => {
              e.stopPropagation()
              try { await toggleFlag(lead.id) } catch { /* erro já toastado */ }
            }}
            className={`w-7 h-7 flex items-center justify-center rounded-[8px] transition-all duration-150 flex-shrink-0
                        hover:bg-brand-tint focus:outline-none focus-visible:ring-2 focus-visible:ring-brand
                        ${lead.flagged ? 'text-brand' : 'text-t4 hover:text-brand'}`}
            title={lead.flagged ? 'Remover prioridade' : 'Marcar prioridade máxima'}
            aria-label={lead.flagged ? 'Remover prioridade' : 'Marcar prioridade máxima'}
            aria-pressed={!!lead.flagged}
          >
            <Star size={13} strokeWidth={1.6} fill={lead.flagged ? 'currentColor' : 'none'} />
          </button>
          <button
            onClick={handleWhatsAppOpen}
            className={`w-7 h-7 flex items-center justify-center text-t4 hover:text-success hover:bg-success-bg rounded-[8px] transition-all duration-150 flex-shrink-0
                        focus:outline-none focus-visible:ring-2 focus-visible:ring-brand`}
            title="Só abrir WhatsApp, sem registrar"
            aria-label={`Abrir WhatsApp de ${displayName} sem registrar contato`}
          >
            <MessageCircle size={13} strokeWidth={1.6} />
          </button>
          <a
            href={`tel:${displayPhone}`}
            onClick={e => e.stopPropagation()}
            className={`w-7 h-7 flex items-center justify-center text-t4 hover:text-t1 hover:bg-s3 rounded-[8px] transition-all duration-150 flex-shrink-0
                        focus:outline-none focus-visible:ring-2 focus-visible:ring-brand`}
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
            className={`w-6 h-7 flex items-center justify-center text-t4 hover:text-t2 cursor-grab active:cursor-grabbing transition-all flex-shrink-0`}
          >
            <GripVertical size={13} strokeWidth={1.6} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Coluna do kanban ─────────────────────────────────────────────────────────

function KanbanColumn({
  stage, leads, total, onCardClick, onConclude, isActiveDragTarget, savingId, dense,
  onFiltrarSemContato, filtroSemContatoAtivo, arrastando, comissao, primeira,
}: {
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
  onFiltrarSemContato?: () => void
  filtroSemContatoAtivo: boolean
}) {
  const conf = STAGE_CONFIG[stage]
  const { isOver, setNodeRef } = useDroppable({ id: stage })
  const ids = leads.map(l => l.id)

  const totais = comissao.total(leads)
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
    // --etapa / --etapa-clara: a cor viva da etapa (seta, avatar, hover, alvo).
    <div className={CLASSE_DA_COLUNA}
         style={{ ['--etapa' as string]: COR_ETAPA[stage][1], ['--etapa-clara' as string]: COR_ETAPA[stage][0] }}
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

          {coldCount > 0 && (
            <div className="px-2 pt-1">
              {onFiltrarSemContato ? (
                <button
                  type="button"
                  onClick={onFiltrarSemContato}
                  aria-pressed={filtroSemContatoAtivo}
                  title={filtroSemContatoAtivo
                    ? 'Mostrar todos os leads de novo'
                    : `${coldCount} sem contato há mais de ${ESFRIANDO_DIAS} dias (${riskPct}%). Clique para ver só eles.`}
                  className={`inline-flex items-center gap-1 px-1.5 h-6 -ml-1.5 rounded-md text-[12px] text-warning tabular-nums
                    transition-colors hover:bg-warning-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-warning/40
                    ${filtroSemContatoAtivo ? 'bg-warning-bg' : ''}`}
                >
                  <Snowflake size={11} strokeWidth={1.8} aria-hidden />
                  {coldCount} esfriando
                  {filtroSemContatoAtivo && <X size={10} strokeWidth={2} aria-hidden />}
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 text-[12px] text-warning tabular-nums"
                      title={`${coldCount} sem contato há mais de ${ESFRIANDO_DIAS} dias`}>
                  <Snowflake size={11} strokeWidth={1.8} aria-hidden />{coldCount} esfriando
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

function Placar({ rotulo, valor, cor, fundo, destaque = false }: {
  rotulo: string; valor: number; cor: string; fundo: string; destaque?: boolean
}) {
  return (
    <div className="flex items-center gap-3 rounded-[14px] border border-line bg-surface pl-2.5 pr-4 py-2 min-w-0">
      <span className="flex-shrink-0 w-9 h-9 rounded-[11px] flex items-center justify-center text-white" style={{ backgroundImage: fundo }} aria-hidden>
        <Sparkles size={16} strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <p className="text-[11.5px] font-medium text-t3 leading-tight truncate">{rotulo}</p>
        <span style={{ color: cor }}>
          <DinheiroVivo valor={valor} ganho={destaque}
            className={`font-display ${destaque ? 'text-[21px]' : 'text-[19px]'} font-bold leading-tight tracking-[-0.02em]`} />
        </span>
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
  const { dense, sort, setDense } = useKanbanPrefs()
  const { isAdmin, profile, allProfiles, viewAsBrokerId } = useAuthStore()

  // ── Comissão nesta visão (comissao.ts) ────────────────────────────────────
  // Admin vê, de cada lead, a parte do corretor dono e o que fica com a Souza
  // (na visão global, na própria ou vendo um corretor). O corretor vê só a
  // parte dele. Lead sem parte (do próprio admin) fica todo com a Souza.
  const comissao = useMemo<VisaoComissao>(() => {
    const shareDe = (id: string | null | undefined) =>
      (id ? (id === profile?.id ? profile.commissionShare : allProfiles.find(p => p.id === id)?.commissionShare) : null) ?? null
    const doLead = (l: Lead): Dinheiro => {
      const vgv = l.averageTicket ?? 0
      const d = divisao(vgv, shareDe(l.brokerId))
      return { vgv, corretor: d.corretor, souza: d.souza }
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
        return { vgv: t.vgv + d.vgv, corretor: t.corretor + d.corretor, souza: t.souza + d.souza }
      }, { vgv: 0, corretor: 0, souza: 0 }),
    }
  }, [isAdmin, profile, allProfiles, viewAsBrokerId])

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

  // Placar do topo — o que está em jogo nos leads em aberto (fora Venda).
  const resumo = useMemo(() => {
    const ativos = leads.filter(l => l.funnelStage !== 'venda')
    return { ativos: ativos.length, ...comissao.total(ativos) }
  }, [leads, comissao])

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
      {/* ── Placar — o que está em jogo nos leads em aberto ──────────────────
          Ganho à vista, não meta a cumprir: é o que dá vontade de chamar o
          próximo. O admin vê as três contas (VGV, corretores, Souza); o
          corretor vê a dele em destaque. 5% do VGV − 3% ISS − 6% Simples. */}
      <div className="flex items-center gap-x-3 gap-y-3 flex-wrap mb-4 px-1">
        <div className="flex items-stretch gap-2 flex-wrap">
          <Placar rotulo={comissao.admin ? 'Comissão dos corretores' : 'Sua comissão em jogo'} valor={resumo.corretor}
                  cor="#16A34A" fundo="linear-gradient(135deg, #4ADE80, #16A34A)" destaque />
          {comissao.admin && (
            <Placar rotulo="Comissão da Souza" valor={resumo.souza} cor="var(--brand-text)" fundo="linear-gradient(135deg, #E2C385, #B8913F)" destaque />
          )}
          <Placar rotulo={`VGV · ${resumo.ativos} leads em aberto`} valor={resumo.vgv} cor="var(--t1)" fundo="linear-gradient(135deg, #818CF8, #4F46E5)" />
        </div>
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
        <div className="flex gap-3 overflow-x-auto pb-4 px-1 items-stretch [justify-content:safe_center]">
          {STAGES.map((stage, i) => (
            <KanbanColumn
              key={stage}
              stage={stage}
              leads={sortedByStage[stage]}
              total={totalPorEtapa?.[stage]}
              onFiltrarSemContato={onFiltrarSemContato}
              filtroSemContatoAtivo={filtroSemContatoAtivo}
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
            <div style={{ ['--etapa' as string]: COR_ETAPA[activeLead.funnelStage][1] }}>
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
