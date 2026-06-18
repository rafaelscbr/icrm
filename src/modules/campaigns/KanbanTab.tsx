import { useState, useMemo } from 'react'
import {
  MessageCircle, FileText, ChevronDown, Eye, Phone,
  Download, Plus, Snowflake, GitMerge, ArrowRight, GripVertical, RefreshCw,
} from 'lucide-react'
import {
  DndContext, DragOverlay, useDraggable, useDroppable,
  closestCenter, DragEndEvent, PointerSensor, KeyboardSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import * as XLSX from 'xlsx'
import { LeadParecerModal } from './LeadParecerModal'
import { TransferToFunnelModal } from './TransferToFunnelModal'
import { VisitaTaskModal } from './VisitaTaskModal'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { CampaignLead, Campaign, FunnelStage, Lead, Task } from '../../types'
import { useCampaignLeadsStore } from '../../store/useCampaignLeadsStore'
import { useDisparosStore } from '../../store/useDisparosStore'
import { useTasksStore } from '../../store/useTasksStore'
import { useAuthStore } from '../../store/useAuthStore'
import { FUNNEL_STAGES, SITUATION_CONFIG } from './config'
import { formatPhone, whatsappUrl, formatCurrency, localDateStr } from '../../lib/formatters'
import { saveFollowupToContact } from '../../lib/db'
import toast from 'react-hot-toast'

interface KanbanTabProps {
  leads:    CampaignLead[]
  campaign: Campaign
}

const COLUMN_PAGE = 20

type DateFilter = 'all' | 'today' | 'week' | 'cold'

// Somente etapas da campanha — a partir de 'scheduled' o lead migra para o funil principal
const CAMPAIGN_KANBAN_STAGES = FUNNEL_STAGES.filter(s =>
  ['new', 'sent', 'attended', 'scheduled'].includes(s.value)
)

// Etapas que mostram VGV no kanban
const VGV_STAGES: FunnelStage[] = ['attended', 'scheduled']

function sortByRecent(leads: CampaignLead[]): CampaignLead[] {
  return [...leads].sort((a, b) => {
    // updatedAt muda a cada interação (envio, mudança de etapa, edição)
    // firstContactAt só muda na primeira vez — não serve como chave principal
    const aTime = a.updatedAt ?? a.stageUpdatedAt ?? a.firstContactAt ?? a.createdAt
    const bTime = b.updatedAt ?? b.stageUpdatedAt ?? b.firstContactAt ?? b.createdAt
    return bTime.localeCompare(aTime)  // desc → mais recente no topo
  })
}

function isCold(lead: CampaignLead): boolean {
  if (!lead.firstContactAt || lead.funnelStage !== 'sent') return false
  const diff = (Date.now() - new Date(lead.firstContactAt).getTime()) / 86_400_000
  return diff > 3
}

function applyDateFilter(leads: CampaignLead[], filter: DateFilter): CampaignLead[] {
  if (filter === 'all') return leads
  const today = localDateStr()
  if (filter === 'today') return leads.filter(l => l.firstContactAt != null && localDateStr(new Date(l.firstContactAt)) === today)
  if (filter === 'week') {
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
    return leads.filter(l => l.firstContactAt && l.firstContactAt >= weekAgo)
  }
  if (filter === 'cold') return leads.filter(isCold)
  return leads
}

function exportColumn(stageName: string, leads: CampaignLead[]) {
  const rows = leads.map(l => ({
    Nome:              l.name,
    Telefone:          l.phone,
    Email:             l.email ?? '',
    Etapa:             l.funnelStage,
    Situação:          l.situation ?? '',
    'Último Contato':  l.firstContactAt ? new Date(l.firstContactAt).toLocaleDateString('pt-BR') : '',
    'Última Mensagem': l.lastMessage ?? '',
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Leads')
  XLSX.writeFile(wb, `leads-${stageName}.xlsx`)
}

/** Retorna há quantos dias o lead está na etapa atual */
function daysInStage(lead: CampaignLead): number {
  const ref = lead.stageUpdatedAt ?? lead.updatedAt ?? lead.createdAt
  return Math.floor((Date.now() - new Date(ref).getTime()) / 86_400_000)
}

// Semântica única de cor (igual ao funil): neutro = ok, âmbar = atenção, vermelho = ação
function stageAgeBadge(days: number): { label: string; cls: string } | null {
  if (days < 1) return null
  if (days <= 2)  return { label: `${days}d`, cls: 'text-t4 bg-s2 border-line' }
  if (days <= 5)  return { label: `${days}d`, cls: 'text-warning bg-warning-bg border-warning-line' }
  return { label: `${days}d`, cls: 'text-error bg-error-bg border-error-line' }
}

// ─── Modal de última mensagem ─────────────────────────────────────────────────

function LastMessageModal({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <Modal isOpen onClose={onClose} title="Última mensagem enviada" size="sm">
      <p className="text-sm text-t1 leading-relaxed whitespace-pre-wrap">{message}</p>
    </Modal>
  )
}

// ─── Modal de criar tarefa rápida ─────────────────────────────────────────────

function QuickTaskModal({ lead, onClose }: { lead: CampaignLead; onClose: () => void }) {
  const { add } = useTasksStore()
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().split('T')[0]
  const [title,   setTitle]   = useState(`Follow-up: ${lead.name}`)
  const [dueDate, setDueDate] = useState(tomorrow)

  function handleCreate() {
    if (!title.trim()) return
    const now = new Date().toISOString()
    add({
      title: title.trim(),
      dueDate,
      status:    'pending',
      priority:  'medium',
      category:  'outro' as Task['category'],
      notes:     `Lead: ${lead.phone}`,
      createdAt: now,
      updatedAt: now,
    } as Omit<Task, 'id'>)
    toast.success('Tarefa criada!')
    onClose()
  }

  return (
    <Modal isOpen onClose={onClose} title="Criar tarefa rápida" size="sm">
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs text-t3 mb-1 block">Título</label>
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full bg-s3/50 border border-line rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />
        </div>
        <div>
          <label className="text-xs text-t3 mb-1 block">Data</label>
          <input
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            className="w-full bg-s3/50 border border-line rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />
        </div>
        <div className="flex gap-2 mt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button variant="primary"   className="flex-1" onClick={handleCreate}>Criar Tarefa</Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Card individual (draggable) ──────────────────────────────────────────────

function LeadCard({
  lead, campaign, onParecer, ghost = false,
}: {
  lead: CampaignLead
  campaign: Campaign
  onParecer: (l: CampaignLead) => void
  ghost?: boolean
}) {
  const { markContacted, update } = useCampaignLeadsStore()
  const { increment: persistDisparo } = useDisparosStore()
  const { profile } = useAuthStore()
  const sentBy = profile ? { id: profile.id, name: profile.name } : undefined
  const situation = SITUATION_CONFIG.find(s => s.value === lead.situation)
  const [showMsg,  setShowMsg]  = useState(false)
  const [showTask, setShowTask] = useState(false)
  const cold = isCold(lead)
  const days = daysInStage(lead)
  const ageBadge = stageAgeBadge(days)

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id:   lead.id,
    data: { lead },
  })

  // Step de disparo no estágio "attended" (0 = nenhuma mensagem enviada ainda)
  const dispatchStep = lead.funnelStage === 'attended'
    ? (lead.messageIndex !== undefined ? lead.messageIndex + 1 : 0)
    : 0

  const templates = [campaign.message, ...(campaign.messages ?? [])]

  async function handleSendAndRegister(e: React.MouseEvent) {
    e.stopPropagation()

    try {
      if (lead.funnelStage === 'attended') {
        // Follow-up: sem mensagem pré-pronta — abre WhatsApp só com o número
        const templateIndex = Math.min(dispatchStep, templates.length - 1)

        await persistDisparo({
          brokerId: profile?.id, campaignId: campaign.id,
          leadId: lead.id, leadName: lead.name,
          dispatchType: 'followup',
        })
        await markContacted(lead.id, '', templateIndex, sentBy)

        // Salva no histórico do contato (best-effort, sem bloqueio)
        if (profile?.id) {
          saveFollowupToContact({
            phone: lead.phone, campaignId: campaign.id,
            brokerId: profile.id, step: templateIndex,
          }).catch(() => {})
        }

        const url = whatsappUrl(lead.phone)
        toast((t) => (
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-t1">{dispatchStep + 1}ª mensagem registrada!</span>
            <a href={url} target="_blank" rel="noopener noreferrer"
              onClick={() => toast.dismiss(t.id)}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-500/15 hover:bg-green-500/25 text-green-400 text-sm font-semibold transition-colors">
              <MessageCircle size={14} />
              Abrir WhatsApp
            </a>
          </div>
        ), { duration: 20_000 })
        return
      }

      // Novo disparo (funnelStage !== 'attended')
      const msg = campaign.message.replace(/\{nome\}/gi, lead.name)
      navigator.clipboard?.writeText(msg).catch(() => {})
      const wasNew = lead.funnelStage === 'new'

      await persistDisparo({
        brokerId: profile?.id, campaignId: campaign.id,
        leadId: lead.id, leadName: lead.name,
        dispatchType: 'new',
      })
      await markContacted(lead.id, msg, 0, sentBy)

      const url = whatsappUrl(lead.phone, msg)
      toast((t) => (
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-t1">{wasNew ? '1ª mensagem registrada!' : 'Mensagem registrada!'}</span>
          <a href={url} target="_blank" rel="noopener noreferrer"
            onClick={() => toast.dismiss(t.id)}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-500/15 hover:bg-green-500/25 text-green-400 text-sm font-semibold transition-colors">
            <MessageCircle size={14} />
            Abrir WhatsApp
          </a>
        </div>
      ), { duration: 20_000 })
    } catch {
      toast.error('Disparo não realizado — não foi possível registrar. Verifique sua conexão.', { duration: 7000 })
    }
  }

  function handleOpenOnly(e: React.MouseEvent) {
    e.stopPropagation()
    window.open(whatsappUrl(lead.phone), '_blank')
  }

  return (
    <>
      <div
        ref={setNodeRef}
        onClick={() => !isDragging && onParecer(lead)}
        className={`group relative border rounded-[14px] p-3 cursor-pointer kanban-card shadow-card select-none
          transition-all duration-200 hover:translate-y-[-1px] hover:shadow-dropdown
          ${isDragging || ghost ? 'opacity-30 scale-95' : ''}
          ${ghost ? 'shadow-modal border-brand/40' : ''}
          ${cold ? '!border-info-line' : ''}
        `}
      >
        {/* Indicador frio */}
        {cold && (
          <span
            className="absolute -top-2 left-3 z-10 flex items-center gap-1 font-label text-[11px] uppercase tracking-[0.08em] text-info bg-info-bg border border-info-line px-1.5 py-px rounded-full"
            title="Sem contato há mais de 3 dias"
          >
            <Snowflake size={9} strokeWidth={1.6} /> Frio
          </span>
        )}

        {/* Grip + ações no hover */}
        <div className="absolute top-2 right-2 flex items-center gap-0.5">
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
            {lead.lastMessage && (
              <button onClick={() => setShowMsg(true)}
                className="w-5 h-5 flex items-center justify-center rounded text-t4 hover:text-t2 transition-colors"
                title="Ver última mensagem">
                <Eye size={11} />
              </button>
            )}
            <button onClick={() => setShowTask(true)}
              className="w-5 h-5 flex items-center justify-center rounded text-t4 hover:text-cyan-400 transition-colors"
              title="Criar tarefa">
              <Plus size={11} />
            </button>
            <button onClick={e => { e.stopPropagation(); onParecer(lead) }}
              className="w-5 h-5 flex items-center justify-center rounded text-t4 hover:text-brand transition-colors"
              title="Parecer">
              <FileText size={11} />
            </button>
          </div>
          <div
            {...listeners}
            {...attributes}
            onClick={e => e.stopPropagation()}
            aria-label="Arrastar lead"
            className="w-5 h-5 flex items-center justify-center text-t5 hover:text-t3 cursor-grab active:cursor-grabbing transition-colors rounded focus-visible:outline-2 focus-visible:outline-brand"
          >
            <GripVertical size={12} />
          </div>
        </div>

        {/* Avatar + nome + info */}
        <div className="flex items-start gap-2.5 pr-12 mb-2">
          <div className="w-8 h-8 rounded-[10px] bg-s2 border border-line flex items-center justify-center font-heading text-sm font-bold text-t2 flex-shrink-0">
            {lead.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-heading text-[13px] font-bold text-t1 truncate leading-tight tracking-[-0.01em]">{lead.name}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="font-label text-[11px] text-t4 tabular-nums tracking-wide">{formatPhone(lead.phone)}</span>
              {ageBadge && (
                <span
                  title={`${days} ${days === 1 ? 'dia' : 'dias'} nesta etapa`}
                  className={`ml-auto font-label text-[11px] font-medium uppercase tracking-[0.08em] px-1.5 py-0.5 rounded-full border tabular-nums ${ageBadge.cls}`}
                >
                  {ageBadge.label} na etapa
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quem disparou por último */}
        {lead.lastSentByName && (
          <p className="mb-1.5 flex items-center gap-1 text-[11px] text-t3 truncate">
            <MessageCircle size={10} strokeWidth={1.6} className="flex-shrink-0 text-t4" />
            <span className="truncate">
              {lead.lastSentByName}
              {lead.lastSentAt ? ` · ${new Date(lead.lastSentAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${new Date(lead.lastSentAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}
              {lead.messageIndex !== undefined ? ` · Msg ${lead.messageIndex + 1}` : ''}
            </span>
          </p>
        )}

        {/* Última mensagem */}
        {lead.lastMessage && (
          <p className="mb-1.5 text-[11px] text-t4 line-clamp-1 italic">"{lead.lastMessage}"</p>
        )}

        {/* Migrado */}
        {lead.transferredAt && (
          <span className="mb-1.5 inline-flex items-center gap-1 font-label text-[11px] uppercase tracking-[0.08em] text-t3 px-2 py-0.5 rounded-full border border-line">
            <GitMerge size={9} strokeWidth={1.6} /> Migrado p/ funil
          </span>
        )}

        {/* Situação */}
        {situation && (
          <span className={`mb-1.5 inline-block font-label text-[11px] uppercase tracking-[0.08em] px-2 py-0.5 rounded-full ${situation.bg} ${situation.color}`}>
            {situation.label}
          </span>
        )}

        {/* Valor proposta */}
        {lead.proposalValue && (
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-label text-xs font-semibold text-t1 tabular-nums">{formatCurrency(lead.proposalValue)}</span>
          </div>
        )}

        {/* Barrinhas de progresso — estágio "attended" */}
        {lead.funnelStage === 'attended' && (
          <div className="mb-2" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-1 mb-1">
              {[1, 2, 3, 4, 5].map(step => (
                <div
                  key={step}
                  onClick={e => {
                    e.stopPropagation()
                    const newStep = dispatchStep === step ? step - 1 : step
                    update(lead.id, { messageIndex: newStep <= 0 ? undefined : newStep - 1 })
                    toast.success(newStep > 0 ? `${newStep}ª mensagem marcada` : 'Progresso removido')
                  }}
                  title={`Marcar ${step}ª mensagem como enviada`}
                  className={`flex-1 h-2 rounded-full transition-all duration-150 cursor-pointer active:scale-95
                    ${step <= dispatchStep ? 'bg-info hover:opacity-80' : 'bg-s3 hover:bg-info-bg'}`}
                />
              ))}
            </div>
            {/* Mostra quantas JÁ foram enviadas */}
            <p className="font-label text-[11px] uppercase tracking-[0.08em] text-t4">
              {dispatchStep === 0
                ? 'Nenhuma mensagem enviada'
                : `${dispatchStep} de 5 mensagens enviadas`}
            </p>
          </div>
        )}

        {/* Barra de ações */}
        <div className="mt-2 pt-2 border-t border-line flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
          <button
            onClick={handleSendAndRegister}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 font-heading text-xs font-bold text-success bg-success-bg hover:bg-success hover:text-white border border-success-line rounded-[10px] transition-all duration-150 active:scale-[0.98]"
            title="Enviar template e registrar disparo"
          >
            <MessageCircle size={12} strokeWidth={1.6} />
            Registrar
            {lead.funnelStage === 'attended' && (
              <span className="opacity-60">· {dispatchStep + 1}ª</span>
            )}
          </button>
          <button
            onClick={handleOpenOnly}
            className="w-7 h-7 flex items-center justify-center text-t3 hover:text-success bg-s2 hover:bg-success-bg border border-line hover:border-success-line rounded-[10px] transition-all duration-150"
            title="Só abrir WhatsApp"
          >
            <MessageCircle size={12} strokeWidth={1.6} />
          </button>
          <a
            href={`tel:${lead.phone}`}
            onClick={e => e.stopPropagation()}
            className="w-7 h-7 flex items-center justify-center text-t3 hover:text-t1 bg-s2 hover:bg-s3 border border-line rounded-[10px] transition-all duration-150"
            title="Ligar"
          >
            <Phone size={12} strokeWidth={1.6} />
          </a>
        </div>
      </div>

      {showMsg && lead.lastMessage && <LastMessageModal message={lead.lastMessage} onClose={() => setShowMsg(false)} />}
      {showTask && <QuickTaskModal lead={lead} onClose={() => setShowTask(false)} />}
    </>
  )
}

// ─── Coluna com droppable ─────────────────────────────────────────────────────

function KanbanColumn({
  stage, leads, campaign, onParecer,
}: {
  stage: typeof FUNNEL_STAGES[number]
  leads: CampaignLead[]
  campaign: Campaign
  onParecer: (l: CampaignLead) => void
}) {
  const [visible, setVisible] = useState(COLUMN_PAGE)
  const { isOver, setNodeRef } = useDroppable({ id: stage.value })
  const sorted  = sortByRecent(leads)
  const shown   = sorted.slice(0, visible)
  const hasMore = visible < sorted.length

  // VGV da coluna
  const showVgv = VGV_STAGES.includes(stage.value as FunnelStage)
  const ticket  = campaign.averageTicket ?? 0

  const colVGV = useMemo(() => {
    if (!showVgv || !ticket) return 0
    if (stage.value === 'proposal') {
      // Usa o proposalValue real se disponível, caso contrário ticket médio
      return leads.reduce((sum, l) => sum + (l.proposalValue ?? ticket), 0)
    }
    return leads.length * ticket
  }, [leads, ticket, showVgv, stage.value])

  return (
    <div className="flex flex-col w-[19rem] flex-shrink-0">
      {/* Painel único preenchido — sem bordas, header integrado */}
      <div className={`flex flex-col flex-1 rounded-[18px] kanban-col transition-shadow duration-200
        ${isOver ? 'ring-1 ring-inset ring-brand/40' : ''}
      `}>
        <div className="flex flex-col px-4 pt-3.5 pb-2.5">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${stage.dot}`} />
            <span className="font-label text-xs font-medium uppercase tracking-[0.12em] text-t2">
              {stage.label}
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <span className="font-label text-xs font-semibold text-t3 tabular-nums">
                {leads.length.toLocaleString('pt-BR')}
              </span>
              {leads.length > 0 && (
                <button
                  onClick={() => exportColumn(stage.value, leads)}
                  className="p-1 rounded-md text-t4 hover:text-t2 transition-colors duration-150"
                  title={`Exportar ${stage.label}`}
                  aria-label={`Exportar leads da etapa ${stage.label}`}
                >
                  <Download size={11} strokeWidth={1.6} />
                </button>
              )}
            </div>
          </div>
          {/* VGV da coluna */}
          {showVgv && colVGV > 0 && (
            <div className="flex items-center gap-1.5 mt-1 pl-4">
              <span className="font-label text-[11px] text-t3 font-medium tabular-nums">
                VGV {formatCurrency(colVGV)}
              </span>
            </div>
          )}
        </div>

        {/* Área droppable */}
        <div
          ref={setNodeRef}
          className={`flex-1 min-h-[420px] rounded-b-[18px] px-2.5 pb-2.5 flex flex-col gap-2.5 transition-colors duration-200
            ${isOver ? 'bg-[rgba(228,178,60,0.05)]' : ''}`}
        >
          {leads.length === 0 ? (
            <div className="flex-1 flex items-center justify-center rounded-[14px] border border-dashed border-line m-0.5">
              <p className="text-xs text-t4 text-center">Arraste cards aqui</p>
            </div>
          ) : (
            <>
              {shown.map(lead => (
                <LeadCard key={lead.id} lead={lead} campaign={campaign} onParecer={onParecer} />
              ))}
              {hasMore && (
                <button
                  onClick={() => setVisible(v => v + COLUMN_PAGE)}
                  className="flex items-center justify-center gap-1.5 py-2 font-label text-xs uppercase tracking-[0.08em] text-t3 hover:text-t2 border border-dashed border-line hover:border-line-strong rounded-[14px] transition-all duration-150 cursor-pointer"
                >
                  <ChevronDown size={12} strokeWidth={1.6} />
                  +{(sorted.length - visible).toLocaleString('pt-BR')} leads
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── KanbanTab principal ──────────────────────────────────────────────────────

const DATE_FILTERS: { value: DateFilter; label: string; icon?: typeof Snowflake }[] = [
  { value: 'all',   label: 'Todos'       },
  { value: 'today', label: 'Hoje'        },
  { value: 'week',  label: 'Esta semana' },
  { value: 'cold',  label: 'Lead frio', icon: Snowflake },
]

export function KanbanTab({ leads, campaign }: KanbanTabProps) {
  const { setStage, load: reloadLeads }         = useCampaignLeadsStore()
  const [parecerLead,     setParecerLead]      = useState<CampaignLead | undefined>()
  const [dateFilter,      setDateFilter]        = useState<DateFilter>('all')
  const [activeLead,      setActiveLead]        = useState<CampaignLead | null>(null)
  const [syncing,         setSyncing]           = useState(false)
  // Sugestão de migração ao arrastar para 'scheduled'
  const [migrateSuggest,  setMigrateSuggest]    = useState<{ lead: CampaignLead; targetStage: FunnelStage } | null>(null)
  const [showTransfer,    setShowTransfer]       = useState(false)
  const [visitaLead,      setVisitaLead]         = useState<Lead | undefined>()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    // Acessibilidade: mover cards por teclado (Espaço pega/solta, setas movem)
    useSensor(KeyboardSensor),
  )

  const filteredLeads = useMemo(() => applyDateFilter(leads, dateFilter), [leads, dateFilter])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveLead(null)
    if (!over || active.id === over.id) return
    const lead = leads.find(l => l.id === active.id)
    if (!lead) return
    const newStage = over.id as FunnelStage
    if (lead.funnelStage === newStage) return

    // Sugerir migração ao mover para 'scheduled' se ainda não foi transferido
    if (newStage === 'scheduled' && !lead.transferredAt) {
      setMigrateSuggest({ lead, targetStage: newStage })
      return
    }

    setStage(lead.id, newStage)
    toast.success(`${lead.name} movido para "${FUNNEL_STAGES.find(s => s.value === newStage)?.label}"`)
  }

  function confirmMoveOnly() {
    if (!migrateSuggest) return
    setStage(migrateSuggest.lead.id, migrateSuggest.targetStage)
    toast.success(`${migrateSuggest.lead.name} movido para "${FUNNEL_STAGES.find(s => s.value === migrateSuggest.targetStage)?.label}"`)
    setMigrateSuggest(null)
  }

  function openTransferFromSuggest() {
    setShowTransfer(true)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filtros de data */}
      <div className="flex gap-2 flex-wrap">
        {DATE_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setDateFilter(f.value)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full font-label text-xs uppercase tracking-[0.08em] border transition-all duration-150 cursor-pointer ${
              dateFilter === f.value
                ? 'bg-brand-tint border-brand/40 text-brand-text'
                : 'bg-s2/60 border-line text-t3 hover:text-t2 hover:border-line-strong'
            }`}
          >
            {f.icon && <f.icon size={11} strokeWidth={1.6} />}
            {f.label}
            {f.value !== 'all' && (
              <span className="opacity-60 tabular-nums">
                {applyDateFilter(leads, f.value).length}
              </span>
            )}
          </button>
        ))}
        {/* Botão de sincronização manual */}
        <button
          onClick={async () => {
            setSyncing(true)
            await reloadLeads()
            setSyncing(false)
          }}
          disabled={syncing}
          title="Atualizar kanban com dados mais recentes do banco"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border border-line text-t3 hover:text-brand hover:border-brand/30 hover:bg-brand/5 bg-s2/60 transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Atualizando…' : 'Atualizar'}
        </button>

        {/* Info do ticket médio */}
        {campaign.averageTicket && campaign.averageTicket > 0 && (
          <div className="ml-auto flex items-center gap-1.5 text-xs text-t3 bg-s2/60 border border-line rounded-xl px-3 py-1.5">
            Ticket médio:
            <span className="text-brand-text font-semibold">{formatCurrency(campaign.averageTicket)}</span>
          </div>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={e => {
          const lead = leads.find(l => l.id === e.active.id)
          if (lead) setActiveLead(lead)
        }}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-6 min-h-[520px]">
          {CAMPAIGN_KANBAN_STAGES.map(stage => (
            <KanbanColumn
              key={stage.value}
              stage={stage}
              leads={filteredLeads.filter(l => l.funnelStage === stage.value)}
              campaign={campaign}
              onParecer={setParecerLead}
            />
          ))}
        </div>

        <DragOverlay>
          {activeLead && (
            <div className="w-72 opacity-95">
              <LeadCard lead={activeLead} campaign={campaign} onParecer={() => {}} ghost />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <LeadParecerModal
        isOpen={Boolean(parecerLead)}
        onClose={() => setParecerLead(undefined)}
        lead={parecerLead}
        campaign={campaign}
      />

      {/* Modal de sugestão de migração ao arrastar para 'scheduled' */}
      {migrateSuggest && !showTransfer && (
        <Modal isOpen onClose={() => { confirmMoveOnly() }} title="Lead pronto para visita" size="sm">
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 p-3.5 bg-violet-500/8 border border-violet-500/25 rounded-xl">
              <GitMerge size={18} className="text-violet-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-violet-200">Migrar para o funil principal?</p>
                <p className="text-xs text-t3 mt-1 leading-relaxed">
                  <span className="font-medium text-t2">{migrateSuggest.lead.name}</span> agendou apresentação —
                  este é o momento ideal para entrar no funil comercial com todo o histórico preservado.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={confirmMoveOnly}>
                Só mover na campanha
              </Button>
              <Button
                className="flex-1 flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500"
                onClick={openTransferFromSuggest}
              >
                <ArrowRight size={14} />
                Migrar para Funil
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* TransferToFunnelModal acionado pela sugestão de drag */}
      <TransferToFunnelModal
        isOpen={showTransfer}
        onClose={() => {
          setShowTransfer(false)
          if (migrateSuggest) {
            setStage(migrateSuggest.lead.id, migrateSuggest.targetStage)
            setMigrateSuggest(null)
          }
        }}
        lead={migrateSuggest?.lead}
        campaign={campaign}
        onTransferred={newLead => setVisitaLead(newLead)}
      />

      {visitaLead && (
        <VisitaTaskModal
          isOpen
          onClose={() => setVisitaLead(undefined)}
          lead={visitaLead}
        />
      )}
    </div>
  )
}
