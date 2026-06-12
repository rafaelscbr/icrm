import { useState, useMemo, useEffect } from 'react'
import {
  X, MessageCircle, UserCheck, Building2,
  Trash2, RotateCcw, Edit2, AlertTriangle, CheckCircle2,
  ClipboardList, Star, ArrowLeftRight, Search, Check, Zap,
  ChevronDown, History, Target, StickyNote, PhoneCall,
  Database, ListPlus, Loader2, Sparkles, Smartphone, Globe, Handshake,
  Megaphone, MapPin, Phone, Mail, Home, Users, ArrowRight, Timer,
} from 'lucide-react'
import { Lead, LeadDiscardReason, LeadFunnelStage, LeadInteractionType } from '../../types'
import { STAGE_THEME, FUNNEL_STAGES } from '../../lib/stageTheme'
import { useTasksStore } from '../../store/useTasksStore'
import { NextStepSuggestion } from './NextStepSuggestion'
import { useLeadsStore } from '../../store/useLeadsStore'
import { useAuthStore } from '../../store/useAuthStore'
import { useContactsStore } from '../../store/useContactsStore'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { useLeadInteractionsStore } from '../../store/useLeadInteractionsStore'
import { useLeadConfigStore } from '../../store/useLeadConfigStore'
import { useLeadListsStore } from '../../store/useLeadListsStore'
import { formatPhone, formatCurrency, formatCurrencyFull, whatsappUrl } from '../../lib/formatters'
import { db } from '../../lib/db'
import { LeadForm } from './LeadForm'
import { TaskForm } from '../tasks/TaskForm'
import { LeadTimeline } from './LeadTimeline'
import { useSlaInfo } from './SlaBadge'
import { LeadRadarTab } from './LeadRadarTab'
import { LeadPermutaTab } from './LeadPermutaTab'
import { ContactCampaignHistory } from '../lead-lists/ContactCampaignHistory'
import toast from 'react-hot-toast'

// ─── Constantes ───────────────────────────────────────────────────────────────

// Tema das etapas vem da fonte única — mesma cor no kanban, modal e dashboard
const STAGES = FUNNEL_STAGES
const STAGE_META = STAGE_THEME

const ORIGIN_CONFIG: Record<string, { label: string; icon: typeof Sparkles }> = {
  felicita:  { label: 'Felicità',  icon: Sparkles   },
  meta_ads:  { label: 'Meta ADS',  icon: Smartphone },
  portal:    { label: 'Portal',    icon: Globe      },
  offline:   { label: 'Offline',   icon: Handshake  },
  campanha:  { label: 'Campanha',  icon: Megaphone  },
}

const INTERACTION_ICON: Record<string, typeof Phone> = {
  ligacao: Phone, whatsapp: MessageCircle, email: Mail, visita: Home,
  reuniao: Users, nota: StickyNote, stage_change: ArrowRight, discard: Trash2,
  tarefa: CheckCircle2,
}

const REAL_INTERACTION_TYPES = new Set(['ligacao', 'whatsapp', 'email', 'visita', 'reuniao', 'nota', 'tarefa'])

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const h = diff / 3_600_000
  if (h < 1)  return 'agora'
  if (h < 24) return `${Math.floor(h)}h`
  const d = Math.floor(h / 24)
  if (d === 1) return 'ontem'
  return `${d}d`
}

// ─── Próxima ação ─────────────────────────────────────────────────────────────

function getNextAction(stage: LeadFunnelStage, followupStep: number, daysSince: number) {
  const days = Math.floor(daysSince)
  if (daysSince > 2) {
    const msg: Partial<Record<LeadFunnelStage, string>> = {
      lead:        `Sem contato há ${days} dias — fazer primeiro contato agora`,
      followup:    `Follow-up parado há ${days} dias — enviar mensagem urgente`,
      atendimento: `Lead sem resposta há ${days} dias — ligar agora`,
      visita:      `Visita sem confirmação há ${days} dias — confirmar ou reagendar`,
      proposta:    `Proposta sem retorno há ${days} dias — fazer contato`,
    }
    return { message: msg[stage] ?? `Sem contato há ${days} dias`, urgent: true }
  }
  const msg: Partial<Record<LeadFunnelStage, string>> = {
    lead:        'Fazer primeiro contato via WhatsApp',
    followup:    `Enviar ${Math.min(followupStep + 1, 5)}ª mensagem de follow-up`,
    atendimento: 'Qualificar necessidades e apresentar o imóvel ideal',
    visita:      'Confirmar visita e preparar apresentação do imóvel',
    proposta:    'Aguardar retorno — acionar se passar de 2 dias',
  }
  return { message: msg[stage] ?? 'Manter contato', urgent: false }
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface LeadModalProps {
  lead: Lead
  onClose: () => void
}

export function LeadModal({ lead: initialLead, onClose }: LeadModalProps) {
  const { discard, restore, remove, convertToContact, advanceFollowup, toggleFlag, update, setStage, leads } = useLeadsStore()
  const lead = leads.find(l => l.id === initialLead.id) ?? initialLead

  const { add: addContact, getById }       = useContactsStore()
  const { add: addInteraction, getForLead } = useLeadInteractionsStore()
  const { properties }                      = usePropertiesStore()
  const { getByType }                       = useLeadConfigStore()
  const { profile, isAdmin, allProfiles }   = useAuthStore()

  const discardReasons = useMemo(() => getByType('discard_reason'), [getByType])

  // Corretor responsável — sempre visível; admin pode reatribuir
  const brokerName = lead.brokerId
    ? (lead.brokerId === profile?.id
        ? profile?.name
        : allProfiles.find(p => p.id === lead.brokerId)?.name)
    : undefined

  // UI state
  const [showDiscard,       setShowDiscard]       = useState(false)
  const [selectedReason,    setSelectedReason]    = useState<LeadDiscardReason | null>(null)
  const [discardSearch,     setDiscardSearch]     = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showEdit,          setShowEdit]          = useState(false)
  const [showTaskForm,      setShowTaskForm]      = useState(false)
  const [showHistory,       setShowHistory]       = useState(false)
  const [showRadar,         setShowRadar]         = useState(false)
  const [showPermuta,       setShowPermuta]       = useState(false)
  const [showBaseCamp,      setShowBaseCamp]      = useState(false)
  const [showAddToList,     setShowAddToList]     = useState(false)
  const [selectedListId,    setSelectedListId]    = useState('')
  const [addingToList,      setAddingToList]      = useState(false)
  const [noteText,          setNoteText]          = useState('')
  const [showNoteInput,     setShowNoteInput]     = useState(false)
  const [showBrokerMenu,    setShowBrokerMenu]    = useState(false)
  // Ciclo interação → tarefa: tipo da última interação registrada nesta sessão
  const [nextStepFor,       setNextStepFor]       = useState<LeadInteractionType | null>(null)

  const { lists, load: loadLists } = useLeadListsStore()
  const activeLists = lists.filter(l => l.status === 'active')

  // Fecha com Escape — overlays internos têm prioridade
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (showDiscard) { setShowDiscard(false); setSelectedReason(null); setDiscardSearch(''); return }
      if (showEdit || showTaskForm) return // formulários cuidam do próprio Escape
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showDiscard, showEdit, showTaskForm, onClose])

  const slaInfo    = useSlaInfo(lead)
  const property   = lead.propertyId ? properties.find(p => p.id === lead.propertyId) : undefined
  const contact    = lead.contactId  ? getById(lead.contactId) : undefined
  const originConf = ORIGIN_CONFIG[lead.origin] ?? { label: lead.origin, icon: MapPin }
  const isDiscarded = !!lead.discardReason
  const isLinked    = !!lead.contactId
  const commission  = (lead.averageTicket ?? (property?.value)) ? ((lead.averageTicket ?? property?.value ?? 0) * 0.02) : 0
  const ticket      = lead.averageTicket ?? property?.value

  // Interactions
  const interactions  = getForLead(lead.id)
  const lastReal      = interactions.find(i => REAL_INTERACTION_TYPES.has(i.type))
  const daysSince     = (Date.now() - new Date(lastReal?.interactedAt ?? lead.createdAt).getTime()) / 86_400_000
  const recentItems   = interactions.slice(0, 3)
  const { message: nextMsg, urgent: nextUrgent } = lead.funnelStage !== 'venda'
    ? getNextAction(lead.funnelStage, lead.followupStep, daysSince)
    : { message: 'Venda realizada — manter relacionamento.', urgent: false }

  // Próximo passo real: tarefa pendente vinculada ao contato deste lead
  const { tasks } = useTasksStore()
  const pendingTask = useMemo(() => {
    if (!lead.contactId) return undefined
    return tasks
      .filter(t => t.contactId === lead.contactId && t.status === 'pending')
      .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))[0]
  }, [tasks, lead.contactId])

  const taskDue = useMemo(() => {
    if (!pendingTask) return null
    if (!pendingTask.dueDate) return { text: 'Sem prazo', overdue: false, today: false }
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const due = new Date(pendingTask.dueDate + 'T00:00:00')
    const diff = Math.round((due.getTime() - today.getTime()) / 86_400_000)
    if (diff < 0)   return { text: `Atrasada ${-diff}d`, overdue: true,  today: false }
    if (diff === 0) return { text: 'Hoje',               overdue: false, today: true  }
    if (diff === 1) return { text: 'Amanhã',             overdue: false, today: false }
    return { text: due.toLocaleDateString('pt-BR'), overdue: false, today: false }
  }, [pendingTask])

  // ── Handlers ────────────────────────────────────────────────────────────────

  // Toast de sucesso só após confirmação do banco — erros já são toastados pela camada db
  async function handleWhatsApp() {
    window.open(whatsappUrl(contact?.phone ?? lead.phone), '_blank')
    const nextStep = lead.funnelStage === 'lead' ? 1 : Math.min(lead.followupStep + 1, 5)
    try {
      await advanceFollowup(lead.id)
      await addInteraction({ leadId: lead.id, type: 'whatsapp', description: 'Interagiu via WhatsApp', interactedAt: new Date().toISOString() })
      toast.success(`WhatsApp · ${nextStep}ª msg registrada`)
      setNextStepFor('whatsapp')
    } catch { /* erro já toastado */ }
  }

  async function handleCall() {
    window.open(`tel:${contact?.phone ?? lead.phone}`)
    try {
      await addInteraction({ leadId: lead.id, type: 'ligacao', description: 'Ligação realizada', interactedAt: new Date().toISOString() })
      toast.success('Ligação registrada')
      setNextStepFor('ligacao')
    } catch { /* erro já toastado */ }
  }

  async function handleSaveNote() {
    if (!noteText.trim()) return
    try {
      await addInteraction({ leadId: lead.id, type: 'nota', description: noteText.trim(), interactedAt: new Date().toISOString() })
      toast.success('Nota salva')
      setNoteText('')
      setShowNoteInput(false)
    } catch { /* erro já toastado */ }
  }

  async function handleReassignBroker(brokerId: string, name: string) {
    setShowBrokerMenu(false)
    if (brokerId === lead.brokerId) return
    try {
      await update(lead.id, { brokerId })
      toast.success(`Responsável: ${name}`)
    } catch { /* erro já toastado */ }
  }

  async function handleSetStage(stage: LeadFunnelStage) {
    if (stage === lead.funnelStage) return
    try {
      await setStage(lead.id, stage)
      toast.success(`Movido para ${STAGE_META[stage].label}`)
    } catch { /* erro já toastado */ }
  }

  async function handleDiscard() {
    if (!selectedReason) { toast.error('Selecione um motivo'); return }
    try {
      await discard(lead.id, selectedReason)
      toast.success('Lead descartado')
      setShowDiscard(false)
      onClose()
    } catch { /* erro já toastado */ }
  }

  async function handleConvert() {
    if (isLinked) return
    try {
      const c = addContact({ name: lead.name, phone: lead.phone, tags: [], hasChildren: false, isMarried: false, permutaItems: [] })
      await convertToContact(lead.id, c.id)
      toast.success('Lead convertido em contato!')
    } catch { /* erro já toastado */ }
  }

  async function handleRestore() {
    try { await restore(lead.id); toast.success('Lead restaurado'); onClose() } catch { /* erro já toastado */ }
  }
  async function handleDelete() {
    try { await remove(lead.id); toast.success('Lead excluído'); onClose() } catch { /* erro já toastado */ }
  }

  async function handleAddToList() {
    if (!selectedListId || !lead.contactId) return
    setAddingToList(true)
    try {
      await db.leadListMembers.insertMany([{
        listId:      selectedListId,
        contactId:   lead.contactId,
        importBatch: 'manual',
        rawPhone:    lead.phone,
      }])
      // atualiza contagem da lista
      const list = activeLists.find(l => l.id === selectedListId)
      if (list) {
        const { count } = await (await import('../../lib/supabase')).supabase
          .from('lead_list_members').select('id', { count: 'exact', head: true })
          .eq('list_id', selectedListId)
        await db.leadLists.updateCount(selectedListId, count ?? list.totalCount + 1)
        await loadLists()
      }
      toast.success(`Adicionado à lista "${list?.name ?? 'Lista'}"`)
      setShowAddToList(false)
      setSelectedListId('')
    } catch (err) {
      toast.error('Erro ao adicionar à lista')
    } finally {
      setAddingToList(false)
    }
  }

  const currentIndex = STAGES.indexOf(lead.funnelStage)

  return (
    <>
      {/* ── Modal principal ──────────────────────────────────────────────────── */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} />

        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Lead ${lead.name}`}
          className="relative w-full max-w-xl modal-surface rounded-[18px] shadow-modal overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200 flex flex-col max-h-[90vh]"
        >

          {/* ── Cabeçalho ──────────────────────────────────────────────────── */}
          <div className={`flex-shrink-0 px-5 pt-5 pb-4 ${isDiscarded ? 'bg-error-bg/40' : ''}`}>

            {/* Linha 1: Avatar + info + ações */}
            <div className="flex items-start gap-3 mb-4">
              <div className={`w-11 h-11 rounded-[14px] flex items-center justify-center font-heading text-base font-bold flex-shrink-0 border
                ${isDiscarded
                  ? 'bg-error-bg text-error border-error-line'
                  : lead.flagged
                    ? 'bg-brand-tint text-brand-text border-brand/40'
                    : 'bg-s2 text-t1 border-line'}`}>
                {lead.name.charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-heading text-base font-bold text-t1 leading-tight tracking-[-0.01em]">{lead.name}</h2>
                  {lead.flagged && !isDiscarded && (
                    <span className="inline-flex items-center gap-1 font-label text-[11px] uppercase tracking-[0.08em] px-2 py-0.5 rounded-full bg-brand-tint text-brand-text border border-brand/40">
                      <Star size={8} strokeWidth={1.6} fill="currentColor" /> Prioridade
                    </span>
                  )}
                  {isLinked && (
                    <span className="inline-flex items-center gap-1 font-label text-[11px] uppercase tracking-[0.08em] px-2 py-0.5 rounded-full text-t3 border border-line">
                      <UserCheck size={8} strokeWidth={1.6} /> CRM
                    </span>
                  )}
                  {isDiscarded && (
                    <span className="inline-flex items-center gap-1 font-label text-[11px] uppercase tracking-[0.08em] px-2 py-0.5 rounded-full bg-error-bg text-error border border-error-line">
                      <AlertTriangle size={8} strokeWidth={1.6} /> Descartado
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <a
                    href={`tel:${contact?.phone ?? lead.phone}`}
                    className="font-label text-xs text-t2 hover:text-success transition-colors tabular-nums tracking-wide"
                    aria-label={`Ligar para ${lead.name}`}
                  >
                    {formatPhone(contact?.phone ?? lead.phone)}
                  </a>
                  <span className="text-t5" aria-hidden="true">·</span>
                  <span className="flex items-center gap-1 text-xs text-t3">
                    <originConf.icon size={11} strokeWidth={1.6} className="text-t4" />
                    {originConf.label}
                  </span>
                  <span className="text-t5" aria-hidden="true">·</span>
                  <span className="font-label text-xs text-t4 tabular-nums">{new Date(lead.createdAt).toLocaleDateString('pt-BR')}</span>

                  {/* Corretor responsável — sempre visível; admin reatribui em 1 clique */}
                  {(brokerName || isAdmin) && (
                    <>
                      <span className="text-t5" aria-hidden="true">·</span>
                      <div className="relative">
                        <button
                          onClick={() => isAdmin && setShowBrokerMenu(v => !v)}
                          disabled={!isAdmin}
                          title={isAdmin ? 'Trocar corretor responsável' : `Corretor responsável: ${brokerName}`}
                          aria-haspopup={isAdmin ? 'listbox' : undefined}
                          aria-expanded={isAdmin ? showBrokerMenu : undefined}
                          className={`flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full bg-brand-tint border border-brand/25 transition-all duration-150
                            ${isAdmin ? 'cursor-pointer hover:border-brand/50' : 'cursor-default'}`}
                        >
                          <span className="w-4 h-4 rounded-full bg-brand flex items-center justify-center font-heading text-[10px] font-bold text-[#0F1730]">
                            {(brokerName ?? '?').charAt(0).toUpperCase()}
                          </span>
                          <span className="font-label text-[11px] text-brand-text truncate max-w-[120px]">
                            {brokerName ? brokerName.split(' ')[0] : 'Atribuir'}
                          </span>
                          {isAdmin && <ChevronDown size={10} strokeWidth={1.6} className="text-brand-text" aria-hidden="true" />}
                        </button>
                        {isAdmin && showBrokerMenu && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setShowBrokerMenu(false)} aria-hidden="true" />
                            <div
                              className="absolute left-0 top-full mt-1 z-20 min-w-[200px] bg-surface border border-line rounded-[14px] shadow-dropdown overflow-hidden py-1"
                              role="listbox"
                              aria-label="Corretor responsável"
                            >
                              {allProfiles.map(p => (
                                <button
                                  key={p.id}
                                  role="option"
                                  aria-selected={p.id === lead.brokerId}
                                  onClick={() => handleReassignBroker(p.id, p.name)}
                                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors
                                    ${p.id === lead.brokerId ? 'text-brand-text bg-brand-tint' : 'text-t2 hover:bg-s2 hover:text-t1'}`}
                                >
                                  <span className="w-5 h-5 rounded-full bg-s3 border border-line flex items-center justify-center font-heading text-[10px] font-bold text-t2">
                                    {p.name.charAt(0).toUpperCase()}
                                  </span>
                                  <span className="flex-1 truncate">{p.name}</span>
                                  {p.id === lead.brokerId && <Check size={11} className="text-brand flex-shrink-0" />}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Ações do header */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={async () => {
                    try {
                      await toggleFlag(lead.id)
                      toast.success(lead.flagged ? 'Prioridade removida' : 'Prioridade máxima')
                    } catch { /* erro já toastado */ }
                  }}
                  className={`w-7 h-7 flex items-center justify-center rounded-[10px] transition-all duration-150
                    ${lead.flagged ? 'text-brand bg-brand-tint border border-brand/40' : 'text-t4 hover:text-brand hover:bg-brand-tint'}`}
                  title={lead.flagged ? 'Remover prioridade' : 'Prioridade máxima'}
                  aria-label={lead.flagged ? 'Remover prioridade' : 'Marcar prioridade máxima'}
                  aria-pressed={!!lead.flagged}
                >
                  <Star size={13} strokeWidth={1.6} fill={lead.flagged ? 'currentColor' : 'none'} />
                </button>
                <button
                  onClick={() => setShowEdit(true)}
                  className="w-7 h-7 flex items-center justify-center rounded-[10px] text-t4 hover:text-t1 hover:bg-s3 transition-all duration-150"
                  title="Editar informações"
                  aria-label="Editar informações do lead"
                >
                  <Edit2 size={13} strokeWidth={1.6} />
                </button>
                <button
                  onClick={onClose}
                  className="w-7 h-7 flex items-center justify-center rounded-[10px] text-t3 hover:text-t1 hover:bg-s3 transition-all duration-150"
                  aria-label="Fechar"
                >
                  <X size={15} strokeWidth={1.6} />
                </button>
              </div>
            </div>

            {/* Linha 2: Pipeline de etapas — clicável */}
            <div className="flex items-center gap-1" role="group" aria-label="Etapa do funil">
              {STAGES.map((stage, i) => {
                const meta      = STAGE_META[stage]
                const isCurrent = stage === lead.funnelStage
                const isPast    = i < currentIndex
                return (
                  <button
                    key={stage}
                    onClick={() => handleSetStage(stage)}
                    disabled={isDiscarded}
                    title={`Mover para ${meta.label}`}
                    aria-current={isCurrent ? 'step' : undefined}
                    className={`flex-1 py-2 rounded-[10px] font-label text-[11px] font-medium uppercase tracking-[0.04em] transition-all duration-150 text-center border leading-tight
                      ${isCurrent
                        ? `${meta.activeBg} ${meta.color} ${meta.border} shadow-sm`
                        : isPast
                          ? 'bg-s3/50 text-t3 border-transparent hover:bg-s3 hover:text-t2'
                          : 'bg-transparent text-t4 border-transparent hover:bg-s3/50 hover:text-t3'
                      } ${isDiscarded ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    {meta.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Corpo (scrollável) ──────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

            {/* SLA Meta Ads — prazo de 1º contato gerenciado pelo banco.
                Sem registro no prazo, o lead transfere para o outro corretor. */}
            {slaInfo && (
              <div className={`flex items-start gap-2.5 rounded-[14px] p-3 border
                ${slaInfo.urgent ? 'bg-error-bg border-error-line' : 'bg-warning-bg border-warning-line'}`}>
                <div className={`w-6 h-6 rounded-[8px] flex items-center justify-center flex-shrink-0 mt-0.5
                  ${slaInfo.urgent ? 'bg-error-bg' : 'bg-warning-bg'}`}>
                  <Timer size={12} strokeWidth={1.6} className={`${slaInfo.urgent ? 'text-error' : 'text-warning'} ${slaInfo.overdue ? 'animate-pulse' : ''}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-label text-[11px] font-medium uppercase tracking-[0.12em] ${slaInfo.urgent ? 'text-error' : 'text-warning'}`}>
                    {slaInfo.overdue ? 'SLA vencido — transferência iminente' : `1º contato Meta Ads · ${slaInfo.text}`}
                  </p>
                  <p className="text-[13px] text-t1 mt-0.5 leading-relaxed">
                    Clique em <strong>WhatsApp</strong> para registrar o 1º contato e parar o relógio.
                    Prazo: {slaInfo.deadline}.
                  </p>
                </div>
              </div>
            )}

            {/* Banner próxima ação — a informação nº 1 da tela.
                Com tarefa pendente: mostra o compromisso real (e o prazo).
                Sem tarefa: cai na sugestão heurística por etapa.
                Com SLA ativo e sem tarefa: o banner de SLA já diz o que fazer — não duplica. */}
            {!isDiscarded && (pendingTask || !slaInfo) && (
              pendingTask && lead.funnelStage !== 'venda' ? (
                <div className={`flex items-start gap-2.5 rounded-[14px] p-3 border
                  ${taskDue?.overdue ? 'bg-error-bg border-error-line' : taskDue?.today ? 'bg-warning-bg border-warning-line' : 'bg-s2 border-line'}`}>
                  <div className={`w-6 h-6 rounded-[8px] flex items-center justify-center flex-shrink-0 mt-0.5
                    ${taskDue?.overdue ? 'bg-error-bg' : taskDue?.today ? 'bg-warning-bg' : 'bg-s3'}`}>
                    <ClipboardList size={12} strokeWidth={1.6} className={taskDue?.overdue ? 'text-error' : taskDue?.today ? 'text-warning' : 'text-info'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-label text-[11px] font-medium uppercase tracking-[0.12em]
                      ${taskDue?.overdue ? 'text-error' : taskDue?.today ? 'text-warning' : 'text-info'}`}>
                      Próximo passo agendado
                    </p>
                    <p className="text-[13px] text-t1 mt-0.5 leading-relaxed truncate">{pendingTask.title}</p>
                  </div>
                  {taskDue && (
                    <span className={`flex-shrink-0 font-label text-[11px] font-medium uppercase tracking-[0.06em] px-2 py-0.5 rounded-full border tabular-nums
                      ${taskDue.overdue
                        ? 'text-error bg-error-bg border-error-line'
                        : taskDue.today
                          ? 'text-warning bg-warning-bg border-warning-line'
                          : 'text-t3 bg-s2 border-line'}`}>
                      {taskDue.text}
                    </span>
                  )}
                </div>
              ) : (
                <div className={`flex items-start gap-2.5 rounded-[14px] p-3 border
                  ${lead.funnelStage === 'venda'
                    ? 'bg-success-bg border-success-line'
                    : nextUrgent
                      ? 'bg-warning-bg border-warning-line'
                      : 'bg-s2 border-line'
                  }`}>
                  <div className={`w-6 h-6 rounded-[8px] flex items-center justify-center flex-shrink-0 mt-0.5
                    ${lead.funnelStage === 'venda' ? 'bg-success-bg' : nextUrgent ? 'bg-warning-bg' : 'bg-s3'}`}>
                    {lead.funnelStage === 'venda'
                      ? <CheckCircle2 size={12} strokeWidth={1.6} className="text-success" />
                      : <Zap size={12} strokeWidth={1.6} className={nextUrgent ? 'text-warning' : 'text-info'} />
                    }
                  </div>
                  <div>
                    <p className={`font-label text-[11px] font-medium uppercase tracking-[0.12em]
                      ${lead.funnelStage === 'venda' ? 'text-success' : nextUrgent ? 'text-warning' : 'text-info'}`}>
                      {lead.funnelStage === 'venda' ? 'Venda realizada' : nextUrgent ? 'Ação urgente' : 'Sugestão de próximo passo'}
                    </p>
                    <p className="text-[13px] text-t1 mt-0.5 leading-relaxed">{nextMsg}</p>
                  </div>
                </div>
              )
            )}

            {/* Tentativas de follow-up */}
            {lead.funnelStage === 'followup' && (
              <div className="bg-s2 border border-line rounded-[14px] p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-label text-[11px] font-medium uppercase tracking-[0.12em] text-t3">Tentativas de contato</p>
                  <span className="text-[11px] text-t4">clique para marcar</span>
                </div>
                <div className="flex items-center gap-1.5" role="group" aria-label="Tentativas de contato">
                  {[1, 2, 3, 4, 5].map(step => (
                    <button
                      key={step}
                      onClick={async () => {
                        const next = lead.followupStep === step ? step - 1 : step
                        try {
                          await update(lead.id, { followupStep: next })
                          toast.success(`${next}ª tentativa marcada`)
                        } catch { /* erro já toastado */ }
                      }}
                      aria-label={`Marcar ${step}ª tentativa`}
                      aria-pressed={step <= lead.followupStep}
                      className={`flex-1 h-8 rounded-[10px] font-label text-xs font-medium tabular-nums transition-all duration-150 border
                        ${step <= lead.followupStep
                          ? 'bg-info-bg border-info-line text-info'
                          : 'bg-s3/50 border-line text-t4 hover:bg-s3 hover:text-t2'
                        }`}
                    >
                      {step}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-t4 mt-1.5">
                  {lead.followupStep === 0 ? 'Nenhuma tentativa registrada' : `${lead.followupStep} de 5 tentativas realizadas`}
                </p>
              </div>
            )}

            {/* Ações rápidas — logo após a próxima ação, é o que o corretor faz */}
            {!isDiscarded && (
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={handleWhatsApp}
                  className="flex flex-col items-center gap-1 py-3 bg-success hover:opacity-90 text-white rounded-[14px] transition-all duration-150 active:scale-[0.98]"
                  aria-label="Abrir WhatsApp e registrar contato"
                >
                  <MessageCircle size={16} strokeWidth={1.6} />
                  <span className="font-heading text-xs font-bold">WhatsApp</span>
                </button>

                <button
                  onClick={handleCall}
                  className="flex flex-col items-center gap-1 py-3 bg-s2 hover:bg-s3 border border-line text-t2 rounded-[14px] transition-all duration-150 active:scale-[0.98]"
                  aria-label="Ligar e registrar contato"
                >
                  <PhoneCall size={16} strokeWidth={1.6} />
                  <span className="font-heading text-xs font-bold">Ligar</span>
                </button>

                <button
                  onClick={() => setShowTaskForm(true)}
                  className="flex flex-col items-center gap-1 py-3 bg-s2 hover:bg-s3 border border-line text-t2 rounded-[14px] transition-all duration-150 active:scale-[0.98]"
                  aria-label="Criar tarefa para este lead"
                >
                  <ClipboardList size={16} strokeWidth={1.6} />
                  <span className="font-heading text-xs font-bold">Tarefa</span>
                </button>
              </div>
            )}

            {/* Sugestão de próximo passo — aparece após registrar contato */}
            {!isDiscarded && nextStepFor && (
              <NextStepSuggestion
                lead={lead}
                interactionType={nextStepFor}
                onDone={() => setNextStepFor(null)}
              />
            )}

            {/* Imóvel + ticket + comissão */}
            {(property || lead.propertyName || ticket) && (
              <div className="bg-s2 border border-line rounded-[14px] p-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-[10px] bg-brand-tint flex items-center justify-center flex-shrink-0">
                  <Building2 size={14} strokeWidth={1.6} className="text-brand" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-t1 truncate">
                    {property?.name ?? lead.propertyName ?? 'Sem imóvel vinculado'}
                  </p>
                  {property && (
                    <p className="flex items-center gap-1 text-xs text-t3">
                      <MapPin size={10} strokeWidth={1.6} className="text-brand" />
                      {property.neighborhood} · {property.kind === 'off_plan' ? 'Lançamento' : 'Pronto'}
                    </p>
                  )}
                </div>
                {ticket && (
                  <div className="text-right flex-shrink-0">
                    <p className="font-label text-sm font-semibold text-t1 tabular-nums">{formatCurrencyFull(ticket)}</p>
                    {commission > 0 && (
                      <p className="font-label text-[11px] uppercase tracking-[0.06em] text-success tabular-nums">
                        Com. {formatCurrency(commission)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Nota rápida */}
            {!isDiscarded && (
              <div>
                {showNoteInput ? (
                  <div className="bg-s2 border border-line rounded-[14px] p-3 space-y-2">
                    <label htmlFor="lead-quick-note" className="sr-only">Nota rápida</label>
                    <textarea
                      id="lead-quick-note"
                      autoFocus
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                      placeholder="Escreva sua observação…"
                      rows={3}
                      className="w-full bg-transparent text-sm text-t1 placeholder:text-t4 resize-none focus:outline-none leading-relaxed"
                    />
                    <div className="flex gap-2">
                      <button onClick={handleSaveNote} className="flex-1 py-1.5 bg-brand hover:bg-brand-dark font-heading text-xs font-bold rounded-[10px] transition-all duration-150">
                        Salvar nota
                      </button>
                      <button onClick={() => { setShowNoteInput(false); setNoteText('') }} className="px-3 py-1.5 bg-s3/50 text-t2 text-xs rounded-[10px] hover:bg-s3 transition-all duration-150">
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowNoteInput(true)}
                    className="w-full flex items-center gap-2 py-2 px-3 rounded-[14px] text-xs text-t3 hover:text-t2 bg-s2/50 hover:bg-s2 border border-dashed border-line transition-all duration-150"
                  >
                    <StickyNote size={12} strokeWidth={1.6} /> Adicionar nota rápida
                  </button>
                )}
              </div>
            )}

            {/* Histórico de interações inline */}
            <div>
              <button
                onClick={() => setShowHistory(v => !v)}
                className="flex items-center justify-between w-full mb-2 group"
              >
                <div className="flex items-center gap-1.5">
                  <History size={12} strokeWidth={1.6} className="text-t4" />
                  <span className="font-label text-[11px] font-medium uppercase tracking-[0.12em] text-t3 group-hover:text-t2 transition-colors">
                    Histórico
                  </span>
                  {interactions.length > 0 && (
                    <span className="font-label text-[11px] bg-s3 text-t3 px-1.5 py-0.5 rounded-full tabular-nums">{interactions.length}</span>
                  )}
                </div>
                <ChevronDown size={12} strokeWidth={1.6} aria-hidden="true" className={`text-t4 transition-transform duration-200 ${showHistory ? 'rotate-180' : ''}`} />
              </button>

              {showHistory ? (
                <LeadTimeline leadId={lead.id} />
              ) : (
                <div className="space-y-1.5">
                  {recentItems.length === 0 ? (
                    <p className="text-xs text-t4 py-1">Nenhuma interação registrada</p>
                  ) : recentItems.map(i => {
                    const ItemIcon = INTERACTION_ICON[i.type] ?? StickyNote
                    return (
                      <div key={i.id} className="flex items-center gap-2 py-1">
                        <span className="w-5 h-5 rounded-[6px] bg-s2 border border-line flex items-center justify-center flex-shrink-0">
                          <ItemIcon size={10} strokeWidth={1.6} className="text-t3" />
                        </span>
                        <p className="flex-1 text-xs text-t2 truncate">{i.description ?? i.type}</p>
                        <span className="font-label text-[11px] text-t4 flex-shrink-0 tabular-nums">{relativeTime(i.interactedAt)}</span>
                      </div>
                    )
                  })}
                  {interactions.length > 3 && (
                    <button onClick={() => setShowHistory(true)} className="flex items-center gap-1 text-xs text-brand-text hover:text-brand transition-colors">
                      Ver todo histórico ({interactions.length}) <ArrowRight size={10} strokeWidth={1.6} />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Seções expansíveis: Radar e Permuta */}
            <div className="space-y-2">
              <button
                onClick={() => setShowRadar(v => !v)}
                aria-expanded={showRadar}
                className="flex items-center justify-between w-full px-3 py-2.5 rounded-[14px] bg-s2 hover:bg-s3 border border-line transition-all duration-150"
              >
                <div className="flex items-center gap-2 text-xs font-medium text-t2">
                  <Target size={12} strokeWidth={1.6} className="text-t4" /> Radar de interesse
                </div>
                <ChevronDown size={12} strokeWidth={1.6} aria-hidden="true" className={`text-t4 transition-transform duration-200 ${showRadar ? 'rotate-180' : ''}`} />
              </button>
              {showRadar && (
                <div className="px-1">
                  <LeadRadarTab lead={lead} properties={properties} />
                </div>
              )}

              <button
                onClick={() => setShowPermuta(v => !v)}
                aria-expanded={showPermuta}
                className="flex items-center justify-between w-full px-3 py-2.5 rounded-[14px] bg-s2 hover:bg-s3 border border-line transition-all duration-150"
              >
                <div className="flex items-center gap-2 text-xs font-medium text-t2">
                  <ArrowLeftRight size={12} strokeWidth={1.6} className="text-t4" /> Permuta
                </div>
                <ChevronDown size={12} strokeWidth={1.6} aria-hidden="true" className={`text-t4 transition-transform duration-200 ${showPermuta ? 'rotate-180' : ''}`} />
              </button>
              {showPermuta && (
                <div className="px-1">
                  <LeadPermutaTab contact={contact} />
                </div>
              )}

              {/* ── Listas & Campanhas ─────────────────────────────────────── */}
              <div className="rounded-[14px] border border-line bg-s2 overflow-hidden">
                <button
                  onClick={() => {
                    setShowBaseCamp(v => !v)
                    if (activeLists.length === 0) loadLists()
                  }}
                  aria-expanded={showBaseCamp}
                  className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-s3 transition-all duration-150"
                >
                  <div className="flex items-center gap-2 text-xs font-medium text-t2">
                    <Database size={12} strokeWidth={1.6} className="text-t4" />
                    Listas &amp; Campanhas
                  </div>
                  <div className="flex items-center gap-2">
                    {lead.contactId && (
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          if (activeLists.length === 0) loadLists()
                          setShowAddToList(v => !v)
                        }}
                        className="flex items-center gap-1 font-label text-[11px] uppercase tracking-[0.06em] text-brand-text bg-brand-tint border border-brand/25 px-2 py-1 rounded-full transition-all duration-150 hover:border-brand/40"
                        title="Adicionar a uma lista"
                      >
                        <ListPlus size={10} strokeWidth={1.6} /> Adicionar à lista
                      </button>
                    )}
                    <ChevronDown size={12} strokeWidth={1.6} aria-hidden="true" className={`text-t4 transition-transform duration-200 ${showBaseCamp ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {/* Seletor de lista — "Adicionar à lista" */}
                {showAddToList && lead.contactId && (
                  <div className="px-3 py-3 border-t border-line bg-s2/80">
                    <p className="font-label text-[11px] font-medium uppercase tracking-[0.12em] text-t3 mb-2">Lista destino</p>
                    <div className="flex flex-col gap-1 max-h-40 overflow-y-auto pr-0.5 mb-3">
                      {activeLists.length === 0 ? (
                        <p className="text-xs text-t4 py-2 text-center">Nenhuma lista ativa</p>
                      ) : activeLists.map(l => (
                        <button
                          key={l.id}
                          onClick={() => setSelectedListId(l.id)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs transition-all cursor-pointer border
                            ${selectedListId === l.id
                              ? 'bg-brand/15 border-brand/40 text-t1'
                              : 'bg-s3/40 border-line text-t2 hover:bg-s3/70 hover:border-line-strong'
                            }`}
                        >
                          <Database size={11} className={selectedListId === l.id ? 'text-brand' : 'text-t4'} />
                          <span className="flex-1 truncate">{l.name}</span>
                          <span className="text-t4 tabular-nums flex-shrink-0">{l.totalCount.toLocaleString()} leads</span>
                          {selectedListId === l.id && <Check size={11} className="text-brand flex-shrink-0" />}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setShowAddToList(false); setSelectedListId('') }}
                        className="flex-1 py-1.5 text-xs text-t3 hover:text-t1 bg-s3/50 hover:bg-s3 border border-line rounded-lg transition-all"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleAddToList}
                        disabled={!selectedListId || addingToList}
                        className="flex-1 py-1.5 text-xs font-semibold bg-brand hover:bg-brand-dark text-[#0B0F1C] rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                      >
                        {addingToList
                          ? <><Loader2 size={11} className="animate-spin" /> Adicionando…</>
                          : 'Confirmar'
                        }
                      </button>
                    </div>
                  </div>
                )}

                {/* Histórico de listas & campanhas */}
                {showBaseCamp && (
                  <div className="px-3 py-3 border-t border-line">
                    {lead.contactId ? (
                      <ContactCampaignHistory contactId={lead.contactId} />
                    ) : (
                      <div className="flex flex-col items-center gap-2 py-4 text-center">
                        <Database size={20} strokeWidth={1.6} className="text-t4/50" />
                        <p className="text-xs text-t3 font-medium">Converta em contato para ver o histórico completo</p>
                        <p className="text-xs text-t4">Listas, campanhas e vendas serão vinculadas ao contato</p>
                        {!isDiscarded && !isLinked && (
                          <button
                            onClick={handleConvert}
                            className="mt-1 flex items-center gap-1.5 px-3 py-1.5 font-heading text-xs font-bold text-t2 bg-s3 hover:bg-s3/70 border border-line-strong rounded-[10px] transition-all duration-150"
                          >
                            <UserCheck size={11} strokeWidth={1.6} /> Converter em contato
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Notas salvas */}
            {lead.notes && (
              <div className="bg-s2 border border-line rounded-[14px] p-3">
                <p className="font-label text-[11px] font-medium uppercase tracking-[0.12em] text-t3 mb-1.5">Observações</p>
                <p className="text-sm text-t2 leading-relaxed whitespace-pre-wrap">{lead.notes}</p>
              </div>
            )}

            {/* Descarte info */}
            {isDiscarded && lead.discardReason && (() => {
              const r = discardReasons.find(r => r.slug === lead.discardReason)
              return (
                <div className="bg-error-bg border border-error-line rounded-[14px] p-3 flex items-center gap-3">
                  <span className="w-8 h-8 rounded-[10px] bg-error-bg border border-error-line flex items-center justify-center flex-shrink-0">
                    {r?.emoji
                      ? <span className="text-base">{r.emoji}</span>
                      : <Trash2 size={14} strokeWidth={1.6} className="text-error" />
                    }
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-label text-[11px] font-medium text-error uppercase tracking-[0.12em] mb-0.5">Descartado</p>
                    <p className="text-sm font-medium text-t1">{r?.label ?? lead.discardReason}</p>
                    {lead.discardedAt && <p className="font-label text-xs text-t4 mt-0.5 tabular-nums">{new Date(lead.discardedAt).toLocaleDateString('pt-BR')}</p>}
                  </div>
                </div>
              )
            })()}
          </div>

          {/* ── Footer ─────────────────────────────────────────────────────── */}
          <div className="flex-shrink-0 px-5 py-3 border-t border-line flex items-center gap-2">
            {!isLinked && !isDiscarded && (
              <button onClick={handleConvert} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-t2 hover:text-t1 bg-s2 hover:bg-s3 border border-line rounded-[10px] transition-all duration-150">
                <UserCheck size={12} strokeWidth={1.6} /> Criar contato
              </button>
            )}

            <div className="flex-1" />

            {isDiscarded ? (
              <button onClick={handleRestore} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-t2 hover:text-t1 bg-s2 hover:bg-s3 border border-line rounded-[10px] transition-all duration-150">
                <RotateCcw size={12} strokeWidth={1.6} /> Restaurar
              </button>
            ) : (
              <button onClick={() => setShowDiscard(true)} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-error bg-error-bg hover:opacity-80 border border-error-line rounded-[10px] transition-all duration-150">
                <Trash2 size={12} strokeWidth={1.6} /> Descartar
              </button>
            )}

            {showDeleteConfirm ? (
              <div className="flex items-center gap-1" role="alertdialog" aria-label="Confirmar exclusão definitiva">
                <span className="text-xs text-error">Excluir definitivamente?</span>
                <button onClick={handleDelete} className="px-2.5 py-1.5 font-heading text-xs font-bold bg-error text-white rounded-[10px]">Sim</button>
                <button onClick={() => setShowDeleteConfirm(false)} className="px-2.5 py-1.5 text-xs bg-s3 text-t2 rounded-[10px]">Não</button>
              </div>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-8 h-8 flex items-center justify-center text-t4 hover:text-error hover:bg-error-bg rounded-[10px] transition-all duration-150"
                title="Excluir lead"
                aria-label="Excluir lead definitivamente"
              >
                <Trash2 size={13} strokeWidth={1.6} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Discard overlay ──────────────────────────────────────────────────── */}
      {showDiscard && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => { setShowDiscard(false); setSelectedReason(null); setDiscardSearch('') }} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Descartar lead ${lead.name}`}
            className="relative w-full sm:max-w-md modal-surface rounded-t-[18px] sm:rounded-[18px] shadow-modal overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200 flex flex-col max-h-[90vh]"
          >

            <div className="px-5 pt-5 pb-4 border-b border-line flex-shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-[12px] bg-error-bg border border-error-line flex items-center justify-center flex-shrink-0">
                    <AlertTriangle size={16} strokeWidth={1.6} className="text-error" />
                  </div>
                  <div>
                    <h3 className="font-heading text-sm font-bold text-t1">Descartar lead</h3>
                    <p className="text-xs text-t3 mt-0.5 truncate max-w-[220px]">{lead.name}</p>
                  </div>
                </div>
                <button
                  onClick={() => { setShowDiscard(false); setSelectedReason(null); setDiscardSearch('') }}
                  className="w-7 h-7 flex items-center justify-center rounded-[10px] bg-s3/50 hover:bg-s3 text-t3 hover:text-t2 transition-all duration-150"
                  aria-label="Fechar"
                >
                  <X size={13} strokeWidth={1.6} />
                </button>
              </div>
              {discardReasons.length > 4 && (
                <div className="relative mt-3">
                  <Search size={13} strokeWidth={1.6} className="absolute left-3 top-1/2 -translate-y-1/2 text-t3 pointer-events-none" />
                  <input
                    type="text"
                    value={discardSearch}
                    onChange={e => setDiscardSearch(e.target.value)}
                    placeholder="Filtrar motivos…"
                    aria-label="Filtrar motivos de descarte"
                    className="w-full bg-s3/50 border border-line rounded-[14px] pl-8 pr-3 py-2 text-xs text-t1 placeholder:text-t4 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint"
                  />
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5" role="radiogroup" aria-label="Motivo do descarte">
              <p className="font-label text-[11px] font-medium text-t4 uppercase tracking-[0.12em] px-1 mb-2">Motivo do descarte</p>
              {discardReasons
                .filter(r => !discardSearch || r.label.toLowerCase().includes(discardSearch.toLowerCase()))
                .map(r => {
                  const isSelected = selectedReason === r.slug
                  return (
                    <button
                      key={r.id}
                      onClick={() => setSelectedReason(r.slug as LeadDiscardReason)}
                      role="radio"
                      aria-checked={isSelected}
                      className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-[14px] border text-left transition-all duration-150
                        ${isSelected ? 'bg-error-bg border-error-line' : 'bg-s2/50 border-line hover:bg-s2 hover:border-line-strong'}`}
                    >
                      <span className="flex-shrink-0 w-7 text-center">
                        {r.emoji
                          ? <span className="text-base">{r.emoji}</span>
                          : <ClipboardList size={14} strokeWidth={1.6} className="text-t4 mx-auto" />
                        }
                      </span>
                      <span className={`flex-1 text-sm font-medium ${isSelected ? 'text-t1' : 'text-t2'}`}>{r.label}</span>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-150 ${isSelected ? 'bg-error border-error' : 'border-line-strong bg-s2'}`}>
                        {isSelected && <Check size={10} className="text-white" strokeWidth={3} />}
                      </div>
                    </button>
                  )
                })}
            </div>

            <div className="px-4 py-3 border-t border-line flex-shrink-0">
              <button
                onClick={handleDiscard}
                disabled={!selectedReason}
                className="w-full py-3 rounded-[14px] font-heading text-sm font-bold transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed bg-error hover:opacity-90 text-white"
              >
                Confirmar descarte
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit + Task forms ───────────────────────────────────────────────── */}
      {showEdit     && <LeadForm isOpen lead={lead} onClose={() => setShowEdit(false)} />}
      {showTaskForm && <TaskForm isOpen={showTaskForm} onClose={() => setShowTaskForm(false)} defaultContactId={lead.contactId} />}
    </>
  )
}
