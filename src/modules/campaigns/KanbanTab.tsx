import { useState, useMemo } from 'react'
import {
  MessageCircle, FileText, ChevronDown, Eye,
  Download, Plus, Snowflake, ClipboardList,
} from 'lucide-react'
import {
  DndContext, DragOverlay, useDraggable, useDroppable,
  closestCenter, DragEndEvent, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import * as XLSX from 'xlsx'
import { LeadParecerModal } from './LeadParecerModal'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { CampaignLead, Campaign, FunnelStage, Task } from '../../types'
import { useCampaignLeadsStore } from '../../store/useCampaignLeadsStore'
import { useTasksStore } from '../../store/useTasksStore'
import { FUNNEL_STAGES, SITUATION_CONFIG } from './config'
import { formatPhone, whatsappUrl, generateId } from '../../lib/formatters'
import toast from 'react-hot-toast'

interface KanbanTabProps {
  leads:    CampaignLead[]
  campaign: Campaign
}

const COLUMN_PAGE = 20

type DateFilter = 'all' | 'today' | 'week' | 'cold'

function sortByRecent(leads: CampaignLead[]): CampaignLead[] {
  return [...leads].sort((a, b) => {
    const aTime = a.firstContactAt ?? a.updatedAt ?? a.createdAt
    const bTime = b.firstContactAt ?? b.updatedAt ?? b.createdAt
    return bTime.localeCompare(aTime)
  })
}

function isCold(lead: CampaignLead): boolean {
  if (!lead.firstContactAt || lead.funnelStage !== 'sent') return false
  const diff = (Date.now() - new Date(lead.firstContactAt).getTime()) / 86_400_000
  return diff > 3
}

function applyDateFilter(leads: CampaignLead[], filter: DateFilter): CampaignLead[] {
  if (filter === 'all') return leads
  const today = new Date().toISOString().split('T')[0]
  if (filter === 'today') return leads.filter(l => l.firstContactAt?.startsWith(today))
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

// ─── Modal de última mensagem ─────────────────────────────────────────────────

function LastMessageModal({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <Modal isOpen onClose={onClose} title="Última mensagem enviada" size="sm">
      <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{message}</p>
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
          <label className="text-xs text-slate-500 mb-1 block">Título</label>
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Data</label>
          <input
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
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
  const { markContacted } = useCampaignLeadsStore()
  const situation = SITUATION_CONFIG.find(s => s.value === lead.situation)
  const [showMsg,  setShowMsg]  = useState(false)
  const [showTask, setShowTask] = useState(false)
  const cold = isCold(lead)

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id:   lead.id,
    data: { lead },
  })

  function handleWhatsApp(e: React.MouseEvent) {
    e.stopPropagation()
    const msg = campaign.message.replace(/\{nome\}/gi, lead.name)
    window.open(whatsappUrl(lead.phone, msg), '_blank')
    const wasNew = lead.funnelStage === 'new'
    markContacted(lead.id, msg)
    if (wasNew) toast.success('1ª mensagem registrada!')
  }

  return (
    <>
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        onClick={() => !isDragging && onParecer(lead)}
        className={`bg-white/4 hover:bg-white/7 border border-white/8 hover:border-white/15 rounded-xl p-3 cursor-grab active:cursor-grabbing transition-all group select-none
          ${isDragging || ghost ? 'opacity-40 scale-[0.98]' : ''}
          ${cold ? 'lead-cold' : ''}`}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className="text-sm font-medium text-slate-200 truncate flex-1">{lead.name}</p>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" onClick={e => e.stopPropagation()}>
            {lead.lastMessage && (
              <button onClick={() => setShowMsg(true)} className="p-1 rounded-lg bg-slate-500/10 text-slate-400 hover:bg-slate-500/20 transition-colors" title="Ver última mensagem">
                <Eye size={11} />
              </button>
            )}
            <button onClick={() => setShowTask(true)} className="p-1 rounded-lg bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition-colors" title="Criar tarefa">
              <Plus size={11} />
            </button>
            <button onClick={handleWhatsApp} className="p-1 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors" title="WhatsApp">
              <MessageCircle size={11} />
            </button>
            <button onClick={() => onParecer(lead)} className="p-1 rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors" title="Parecer">
              <FileText size={11} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <p className="text-xs text-slate-500 tabular-nums">{formatPhone(lead.phone)}</p>
          {cold && <span className="flex items-center gap-0.5 text-[9px] text-blue-400/70 font-medium"><Snowflake size={9} />Frio</span>}
        </div>

        {lead.lastMessage && (
          <p className="mt-1.5 text-[10px] text-slate-700 line-clamp-1 italic">"{lead.lastMessage}"</p>
        )}

        {situation && (
          <span className={`mt-2 inline-block text-[10px] font-medium px-1.5 py-0.5 rounded ${situation.bg} ${situation.color}`}>
            {situation.label}
          </span>
        )}

        {lead.proposalValue && lead.funnelStage === 'proposal' && (
          <p className="text-xs text-amber-400 font-medium mt-1">R$ {lead.proposalValue.toLocaleString('pt-BR')}</p>
        )}
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

  return (
    <div className="flex-shrink-0 w-60 flex flex-col bg-white/2 rounded-2xl p-3">
      <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl ${stage.bg} border ${stage.border} mb-3`}>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${stage.dot}`} />
          <span className={`text-xs font-semibold ${stage.color}`}>{stage.label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-xs font-bold tabular-nums ${stage.color} opacity-70`}>
            {leads.length.toLocaleString('pt-BR')}
          </span>
          {leads.length > 0 && (
            <button
              onClick={() => exportColumn(stage.value, leads)}
              className={`p-1 rounded-md opacity-50 hover:opacity-100 transition-opacity ${stage.color}`}
              title={`Exportar ${stage.label}`}
            >
              <Download size={10} />
            </button>
          )}
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={`flex flex-col gap-2 flex-1 rounded-xl p-1 -m-1 transition-colors ${isOver ? 'bg-indigo-500/8 ring-1 ring-indigo-500/30' : ''}`}
      >
        {leads.length === 0 ? (
          <div className={`flex items-center justify-center py-8 border border-dashed ${isOver ? 'border-indigo-500/40' : 'border-white/8'} rounded-xl transition-colors`}>
            <p className="text-xs text-slate-700">Nenhum lead</p>
          </div>
        ) : (
          <>
            {shown.map(lead => (
              <LeadCard key={lead.id} lead={lead} campaign={campaign} onParecer={onParecer} />
            ))}
            {hasMore && (
              <button
                onClick={() => setVisible(v => v + COLUMN_PAGE)}
                className="flex items-center justify-center gap-1.5 py-2 text-xs text-slate-500 hover:text-slate-300 border border-dashed border-white/10 hover:border-white/20 rounded-xl transition-all cursor-pointer"
              >
                <ChevronDown size={12} />
                Ver mais {Math.min(COLUMN_PAGE, sorted.length - visible).toLocaleString('pt-BR')} de {(sorted.length - visible).toLocaleString('pt-BR')}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── KanbanTab principal ──────────────────────────────────────────────────────

const DATE_FILTERS: { value: DateFilter; label: string }[] = [
  { value: 'all',   label: 'Todos'       },
  { value: 'today', label: 'Hoje'        },
  { value: 'week',  label: 'Esta semana' },
  { value: 'cold',  label: '❄️ Lead Frio' },
]

export function KanbanTab({ leads, campaign }: KanbanTabProps) {
  const { setStage } = useCampaignLeadsStore()
  const [parecerLead,  setParecerLead]  = useState<CampaignLead | undefined>()
  const [dateFilter,   setDateFilter]   = useState<DateFilter>('all')
  const [activeLead,   setActiveLead]   = useState<CampaignLead | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
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
    setStage(lead.id, newStage)
    toast.success(`${lead.name} movido para "${FUNNEL_STAGES.find(s => s.value === newStage)?.label}"`)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filtros de data */}
      <div className="flex gap-2 flex-wrap">
        {DATE_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setDateFilter(f.value)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
              dateFilter === f.value
                ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                : 'bg-white/4 border-white/10 text-slate-500 hover:text-slate-300 hover:border-white/20'
            }`}
          >
            {f.label}
            {f.value !== 'all' && (
              <span className="ml-1.5 opacity-60">
                {applyDateFilter(leads, f.value).length}
              </span>
            )}
          </button>
        ))}
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
        <div className="flex gap-4 overflow-x-auto pb-4 min-h-[500px]">
          {FUNNEL_STAGES.map(stage => (
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
            <div className="w-60 opacity-90 rotate-1 scale-105 shadow-2xl">
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
    </div>
  )
}
