import { useState, useMemo } from 'react'
import {
  X, MessageCircle, UserCheck, Building2,
  Trash2, RotateCcw, Edit2, AlertTriangle, CheckCircle2,
  ClipboardList, Flame, ArrowLeftRight, Search, Check, Zap,
  ChevronDown, ChevronRight, History, Target, StickyNote, PhoneCall,
  Database, ListPlus, Loader2,
} from 'lucide-react'
import { Lead, LeadDiscardReason, LeadFunnelStage } from '../../types'
import { useLeadsStore } from '../../store/useLeadsStore'
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
import { LeadRadarTab } from './LeadRadarTab'
import { LeadPermutaTab } from './LeadPermutaTab'
import { ContactCampaignHistory } from '../lead-lists/ContactCampaignHistory'
import toast from 'react-hot-toast'

// ─── Constantes ───────────────────────────────────────────────────────────────

const STAGES: LeadFunnelStage[] = ['lead', 'followup', 'atendimento', 'visita', 'proposta', 'venda']

const STAGE_META: Record<LeadFunnelStage, {
  label: string; color: string; bg: string; border: string; activeBg: string;
}> = {
  lead:        { label: 'Lead',        color: 'text-t2',  bg: 'bg-slate-500/10',  border: 'border-slate-500/25',  activeBg: 'bg-slate-500/25'  },
  followup:    { label: 'Followup',    color: 'text-blue-300',   bg: 'bg-s3/60',   border: 'border-blue-500/25',   activeBg: 'bg-blue-500/25'   },
  atendimento: { label: 'Atendimento', color: 'text-violet-300', bg: 'bg-violet-500/10', border: 'border-violet-500/25', activeBg: 'bg-violet-500/25' },
  visita:      { label: 'Visita',      color: 'text-amber-300',  bg: 'bg-amber-500/10',  border: 'border-amber-500/25',  activeBg: 'bg-amber-500/25'  },
  proposta:    { label: 'Proposta',    color: 'text-orange-300', bg: 'bg-orange-500/10', border: 'border-orange-500/25', activeBg: 'bg-orange-500/25' },
  venda:       { label: 'Venda',       color: 'text-green-300',  bg: 'bg-green-500/10',  border: 'border-green-500/25',  activeBg: 'bg-green-500/25'  },
}

const ORIGIN_CONFIG: Record<string, { label: string; emoji: string; color: string }> = {
  felicita:  { label: 'Felicità',  emoji: '✨', color: 'text-rose-400'   },
  meta_ads:  { label: 'Meta ADS',  emoji: '📱', color: 'text-blue-400'   },
  portal:    { label: 'Portal',    emoji: '🌐', color: 'text-cyan-400'   },
  offline:   { label: 'Offline',   emoji: '🤝', color: 'text-amber-400'  },
  campanha:  { label: 'Campanha',  emoji: '📣', color: 'text-violet-400' },
}

const INTERACTION_ICON: Record<string, string> = {
  ligacao: '📞', whatsapp: '💬', email: '📧', visita: '🏠',
  reuniao: '🤝', nota: '📝', stage_change: '→', discard: '🗑️',
}

const REAL_INTERACTION_TYPES = new Set(['ligacao', 'whatsapp', 'email', 'visita', 'reuniao', 'nota'])

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

  const discardReasons = useMemo(() => getByType('discard_reason'), [getByType])

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

  const { lists, load: loadLists } = useLeadListsStore()
  const activeLists = lists.filter(l => l.status === 'active')

  const property   = lead.propertyId ? properties.find(p => p.id === lead.propertyId) : undefined
  const contact    = lead.contactId  ? getById(lead.contactId) : undefined
  const originConf = ORIGIN_CONFIG[lead.origin] ?? { label: lead.origin, emoji: '📍', color: 'text-t3' }
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

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleWhatsApp() {
    window.open(whatsappUrl(contact?.phone ?? lead.phone), '_blank')
    advanceFollowup(lead.id)
    const nextStep = lead.funnelStage === 'lead' ? 1 : Math.min(lead.followupStep + 1, 5)
    addInteraction({ leadId: lead.id, type: 'whatsapp', description: 'Interagiu via WhatsApp', interactedAt: new Date().toISOString() })
    toast.success(`WhatsApp · ${nextStep}ª msg registrada`)
  }

  function handleCall() {
    window.open(`tel:${contact?.phone ?? lead.phone}`)
    addInteraction({ leadId: lead.id, type: 'ligacao', description: 'Ligação realizada', interactedAt: new Date().toISOString() })
    toast.success('Ligação registrada')
  }

  function handleSaveNote() {
    if (!noteText.trim()) return
    addInteraction({ leadId: lead.id, type: 'nota', description: noteText.trim(), interactedAt: new Date().toISOString() })
    toast.success('Nota salva')
    setNoteText('')
    setShowNoteInput(false)
  }

  function handleSetStage(stage: LeadFunnelStage) {
    if (stage === lead.funnelStage) return
    setStage(lead.id, stage)
    toast.success(`Movido para ${STAGE_META[stage].label}`)
  }

  function handleDiscard() {
    if (!selectedReason) { toast.error('Selecione um motivo'); return }
    discard(lead.id, selectedReason)
    toast.success('Lead descartado')
    setShowDiscard(false)
    onClose()
  }

  function handleConvert() {
    if (isLinked) return
    const c = addContact({ name: lead.name, phone: lead.phone, tags: [], hasChildren: false, isMarried: false, permutaItems: [] })
    convertToContact(lead.id, c.id)
    toast.success('Lead convertido em contato!')
  }

  function handleRestore() { restore(lead.id); toast.success('Lead restaurado'); onClose() }
  function handleDelete()   { remove(lead.id);  toast.success('Lead excluído');   onClose() }

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

        <div className="relative w-full max-w-lg modal-surface rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200 flex flex-col max-h-[90vh]">

          {/* ── Cabeçalho ──────────────────────────────────────────────────── */}
          <div className={`flex-shrink-0 px-5 pt-5 pb-4 ${isDiscarded ? 'bg-red-500/5' : lead.flagged ? 'bg-gradient-to-r from-amber-500/8 to-transparent' : ''}`}>

            {/* Linha 1: Avatar + info + ações */}
            <div className="flex items-start gap-3 mb-4">
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-base font-black flex-shrink-0
                ${isDiscarded ? 'bg-red-500/20 text-red-300' : lead.flagged ? 'bg-amber-500/20 text-amber-200 border border-amber-500/30' : 'bg-blue-600 text-white'}`}>
                {lead.name.charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-bold text-t1 leading-tight">{lead.name}</h2>
                  {isLinked && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/20">
                      <UserCheck size={8} /> CRM
                    </span>
                  )}
                  {isDiscarded && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/25">
                      <AlertTriangle size={8} /> Descartado
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <a href={`tel:${contact?.phone ?? lead.phone}`} className="text-sm text-t2 hover:text-green-400 transition-colors tabular-nums">
                    {formatPhone(contact?.phone ?? lead.phone)}
                  </a>
                  <span className="text-t4">·</span>
                  <span className={`text-xs font-medium ${originConf.color}`}>{originConf.emoji} {originConf.label}</span>
                  <span className="text-t4">·</span>
                  <span className="text-xs text-t4">{new Date(lead.createdAt).toLocaleDateString('pt-BR')}</span>
                </div>
              </div>

              {/* Ações do header */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => { toggleFlag(lead.id); toast.success(lead.flagged ? 'Prioridade removida' : '🔥 Prioridade máxima!') }}
                  className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all
                    ${lead.flagged ? 'text-orange-400 bg-orange-500/15 border border-orange-500/30' : 'text-t4 hover:text-orange-400 hover:bg-orange-500/10'}`}
                  title={lead.flagged ? 'Remover prioridade' : 'Prioridade máxima'}
                >
                  <Flame size={13} />
                </button>
                <button
                  onClick={() => setShowEdit(true)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-t4 hover:text-t1 hover:bg-s3 transition-all"
                  title="Editar informações"
                >
                  <Edit2 size={13} />
                </button>
                <button
                  onClick={onClose}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-t3 hover:text-t1 hover:bg-s3 transition-all"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Linha 2: Pipeline de etapas — clicável */}
            <div className="flex items-center gap-1">
              {STAGES.map((stage, i) => {
                const meta      = STAGE_META[stage]
                const isCurrent = stage === lead.funnelStage
                const isPast    = i < currentIndex
                return (
                  <div key={stage} className="flex items-center flex-1">
                    <button
                      onClick={() => handleSetStage(stage)}
                      disabled={isDiscarded}
                      title={`Mover para ${meta.label}`}
                      className={`w-full py-1.5 rounded-lg text-[10px] font-bold transition-all text-center border leading-tight
                        ${isCurrent
                          ? `${meta.activeBg} ${meta.color} ${meta.border} shadow-sm`
                          : isPast
                            ? 'bg-s3/50 text-t3 border-transparent hover:bg-s3 hover:text-t2'
                            : 'bg-transparent text-t4 border-transparent hover:bg-s3/50 hover:text-t3'
                        } ${isDiscarded ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      {meta.label}
                    </button>
                    {i < STAGES.length - 1 && (
                      <ChevronRight size={10} className={`flex-shrink-0 mx-0.5 ${i < currentIndex ? 'text-t3' : 'text-t4'}`} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Corpo (scrollável) ──────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

            {/* Banner próxima ação */}
            {!isDiscarded && (
              <div className={`flex items-start gap-2.5 rounded-xl p-3 border
                ${lead.funnelStage === 'venda'
                  ? 'bg-green-500/10 border-green-500/25'
                  : nextUrgent
                    ? 'bg-amber-500/10 border-amber-500/25'
                    : 'bg-s3/50 border-blue-500/20'
                }`}>
                <div className={`w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5
                  ${lead.funnelStage === 'venda' ? 'bg-green-500/20' : nextUrgent ? 'bg-amber-500/20' : 'bg-s3/70'}`}>
                  {lead.funnelStage === 'venda'
                    ? <CheckCircle2 size={11} className="text-green-400" />
                    : <Zap size={11} className={nextUrgent ? 'text-amber-400' : 'text-blue-400'} />
                  }
                </div>
                <div>
                  <p className={`text-[10px] font-bold uppercase tracking-wide
                    ${lead.funnelStage === 'venda' ? 'text-green-400' : nextUrgent ? 'text-amber-400' : 'text-blue-400'}`}>
                    {lead.funnelStage === 'venda' ? '✅ Venda realizada' : nextUrgent ? '⚠️ Ação urgente' : 'Próximo passo'}
                  </p>
                  <p className="text-xs text-t1 mt-0.5 leading-relaxed">{nextMsg}</p>
                </div>
              </div>
            )}

            {/* Tentativas de follow-up */}
            {lead.funnelStage === 'followup' && (
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-blue-300">Tentativas de contato</p>
                  <span className="text-[10px] text-blue-400/50">clique para marcar</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map(step => (
                    <button
                      key={step}
                      onClick={() => {
                        const next = lead.followupStep === step ? step - 1 : step
                        update(lead.id, { followupStep: next })
                        toast.success(`${next}ª tentativa marcada`)
                      }}
                      className={`flex-1 h-8 rounded-lg text-xs font-bold transition-all border
                        ${step <= lead.followupStep
                          ? 'bg-blue-500/30 border-blue-400/40 text-blue-300 hover:bg-blue-500/50'
                          : 'bg-s3/50 border-line text-t4 hover:bg-s3/70 hover:border-blue-400/30 hover:text-blue-400'
                        }`}
                    >
                      {step}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-blue-400/60 mt-1.5">
                  {lead.followupStep === 0 ? 'Nenhuma tentativa registrada' : `${lead.followupStep} de 5 tentativas realizadas`}
                </p>
              </div>
            )}

            {/* Imóvel + ticket + comissão */}
            {(property || lead.propertyName || ticket) && (
              <div className="bg-s2 border border-line rounded-xl p-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center flex-shrink-0">
                  <Building2 size={14} className="text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-t1 truncate">
                    {property?.name ?? lead.propertyName ?? 'Sem imóvel vinculado'}
                  </p>
                  {property && (
                    <p className="text-xs text-t3">{property.neighborhood} · {property.kind === 'off_plan' ? 'Lançamento' : 'Pronto'}</p>
                  )}
                </div>
                {ticket && (
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-violet-400 tabular-nums">{formatCurrencyFull(ticket)}</p>
                    {commission > 0 && (
                      <p className="text-[10px] text-emerald-400 tabular-nums">💰 {formatCurrency(commission)}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Ações rápidas */}
            {!isDiscarded && (
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={handleWhatsApp}
                  className="flex flex-col items-center gap-1 py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl transition-all active:scale-95 shadow-lg shadow-green-600/20"
                >
                  <MessageCircle size={16} />
                  <span className="text-[10px] font-semibold">WhatsApp</span>
                </button>

                <button
                  onClick={handleCall}
                  className="flex flex-col items-center gap-1 py-3 bg-s3/50 hover:bg-s3 border border-line text-t2 rounded-xl transition-all active:scale-95"
                >
                  <PhoneCall size={16} />
                  <span className="text-[10px] font-semibold">Ligar</span>
                </button>

                <button
                  onClick={() => setShowTaskForm(true)}
                  className="flex flex-col items-center gap-1 py-3 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-300 rounded-xl transition-all active:scale-95"
                >
                  <ClipboardList size={16} />
                  <span className="text-[10px] font-semibold">Tarefa</span>
                </button>
              </div>
            )}

            {/* Nota rápida */}
            {!isDiscarded && (
              <div>
                {showNoteInput ? (
                  <div className="bg-s2 border border-line rounded-xl p-3 space-y-2">
                    <textarea
                      autoFocus
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                      placeholder="Escreva sua observação..."
                      rows={3}
                      className="w-full bg-transparent text-sm text-t1 placeholder:text-t4 resize-none focus:outline-none leading-relaxed"
                    />
                    <div className="flex gap-2">
                      <button onClick={handleSaveNote} className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-all">
                        Salvar nota
                      </button>
                      <button onClick={() => { setShowNoteInput(false); setNoteText('') }} className="px-3 py-1.5 bg-s3/50 text-t2 text-xs rounded-lg hover:bg-s3 transition-all">
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowNoteInput(true)}
                    className="w-full flex items-center gap-2 py-2 px-3 rounded-xl text-xs text-t3 hover:text-t2 bg-s2/50 hover:bg-s2 border border-line transition-all"
                  >
                    <StickyNote size={12} /> Adicionar nota rápida
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
                  <History size={12} className="text-t4" />
                  <span className="text-xs font-semibold text-t3 group-hover:text-t2 transition-colors">
                    Histórico
                  </span>
                  {interactions.length > 0 && (
                    <span className="text-[10px] bg-s3 text-t3 px-1.5 py-0.5 rounded-full">{interactions.length}</span>
                  )}
                </div>
                <ChevronDown size={12} className={`text-t4 transition-transform ${showHistory ? 'rotate-180' : ''}`} />
              </button>

              {showHistory ? (
                <LeadTimeline leadId={lead.id} />
              ) : (
                <div className="space-y-1.5">
                  {recentItems.length === 0 ? (
                    <p className="text-xs text-t4 py-1">Nenhuma interação registrada</p>
                  ) : recentItems.map(i => (
                    <div key={i.id} className="flex items-center gap-2 py-1">
                      <span className="text-sm flex-shrink-0">{INTERACTION_ICON[i.type] ?? '📝'}</span>
                      <p className="flex-1 text-xs text-t2 truncate">{i.description ?? i.type}</p>
                      <span className="text-[10px] text-t4 flex-shrink-0">{relativeTime(i.interactedAt)}</span>
                    </div>
                  ))}
                  {interactions.length > 3 && (
                    <button onClick={() => setShowHistory(true)} className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors">
                      Ver todo histórico ({interactions.length}) →
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Seções expansíveis: Radar e Permuta */}
            <div className="space-y-2">
              <button
                onClick={() => setShowRadar(v => !v)}
                className="flex items-center justify-between w-full px-3 py-2 rounded-xl bg-s2 hover:bg-s3 border border-line transition-all"
              >
                <div className="flex items-center gap-2 text-xs font-medium text-t2">
                  <Target size={12} /> 🎯 Radar de interesse
                </div>
                <ChevronDown size={12} className={`text-t4 transition-transform ${showRadar ? 'rotate-180' : ''}`} />
              </button>
              {showRadar && (
                <div className="px-1">
                  <LeadRadarTab lead={lead} properties={properties} />
                </div>
              )}

              <button
                onClick={() => setShowPermuta(v => !v)}
                className="flex items-center justify-between w-full px-3 py-2 rounded-xl bg-s2 hover:bg-s3 border border-line transition-all"
              >
                <div className="flex items-center gap-2 text-xs font-medium text-t2">
                  <ArrowLeftRight size={12} /> 🔄 Permuta
                </div>
                <ChevronDown size={12} className={`text-t4 transition-transform ${showPermuta ? 'rotate-180' : ''}`} />
              </button>
              {showPermuta && (
                <div className="px-1">
                  <LeadPermutaTab contact={contact} />
                </div>
              )}

              {/* ── Listas & Campanhas ─────────────────────────────────────── */}
              <div className="rounded-xl border border-line bg-s2 overflow-hidden">
                <button
                  onClick={() => {
                    setShowBaseCamp(v => !v)
                    if (activeLists.length === 0) loadLists()
                  }}
                  className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-s3 transition-all"
                >
                  <div className="flex items-center gap-2 text-xs font-medium text-t2">
                    <Database size={12} className="text-brand" />
                    📋 Listas &amp; Campanhas
                  </div>
                  <div className="flex items-center gap-2">
                    {lead.contactId && (
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          if (activeLists.length === 0) loadLists()
                          setShowAddToList(v => !v)
                        }}
                        className="flex items-center gap-1 text-[10px] text-brand hover:text-brand-text bg-brand/10 hover:bg-brand/15 border border-brand/25 px-2 py-0.5 rounded-lg transition-all"
                        title="Adicionar a uma lista"
                      >
                        <ListPlus size={10} /> Adicionar à lista
                      </button>
                    )}
                    <ChevronDown size={12} className={`text-t4 transition-transform ${showBaseCamp ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {/* Seletor de lista — "Adicionar à lista" */}
                {showAddToList && lead.contactId && (
                  <div className="px-3 py-3 border-t border-line bg-s2/80">
                    <p className="text-[11px] font-semibold text-t3 mb-2">Selecione a lista destino:</p>
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
                        <Database size={20} className="text-t4/50" />
                        <p className="text-xs text-t3 font-medium">Converta em contato para ver o histórico completo</p>
                        <p className="text-[11px] text-t4">Listas, campanhas e vendas serão vinculadas ao contato</p>
                        {!isDiscarded && !isLinked && (
                          <button
                            onClick={handleConvert}
                            className="mt-1 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-violet-300 bg-violet-500/10 hover:bg-violet-500/15 border border-violet-500/20 rounded-lg transition-all"
                          >
                            <UserCheck size={11} /> Converter em contato
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
              <div className="bg-s2 border border-line rounded-xl p-3">
                <p className="text-[10px] font-semibold text-t3 uppercase tracking-wider mb-1.5">Observações</p>
                <p className="text-sm text-t2 leading-relaxed whitespace-pre-wrap">{lead.notes}</p>
              </div>
            )}

            {/* Descarte info */}
            {isDiscarded && lead.discardReason && (() => {
              const r = discardReasons.find(r => r.slug === lead.discardReason)
              return (
                <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3 flex items-center gap-3">
                  <span className="text-xl flex-shrink-0">{r?.emoji ?? '🗑️'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wider mb-0.5">Descartado</p>
                    <p className="text-sm font-medium text-t2">{r?.label ?? lead.discardReason}</p>
                    {lead.discardedAt && <p className="text-[11px] text-t4 mt-0.5">{new Date(lead.discardedAt).toLocaleDateString('pt-BR')}</p>}
                  </div>
                </div>
              )
            })()}
          </div>

          {/* ── Footer ─────────────────────────────────────────────────────── */}
          <div className="flex-shrink-0 px-5 py-3 border-t border-line flex items-center gap-2">
            {!isLinked && !isDiscarded && (
              <button onClick={handleConvert} className="flex items-center gap-1.5 px-3 py-2 text-xs text-violet-300 hover:text-violet-200 bg-violet-500/10 hover:bg-violet-500/15 border border-violet-500/20 rounded-lg transition-all">
                <UserCheck size={12} /> Criar contato
              </button>
            )}

            <div className="flex-1" />

            {isDiscarded ? (
              <button onClick={handleRestore} className="flex items-center gap-1.5 px-3 py-2 text-xs text-blue-300 hover:text-blue-200 bg-s3/60 hover:bg-s3/70 border border-blue-500/20 rounded-lg transition-all">
                <RotateCcw size={12} /> Restaurar
              </button>
            ) : (
              <button onClick={() => setShowDiscard(true)} className="flex items-center gap-1.5 px-3 py-2 text-xs text-red-400 hover:text-red-300 bg-red-500/8 hover:bg-red-500/15 border border-red-500/20 rounded-lg transition-all">
                <Trash2 size={12} /> Descartar
              </button>
            )}

            {showDeleteConfirm ? (
              <div className="flex items-center gap-1">
                <span className="text-xs text-red-400">Confirmar exclusão?</span>
                <button onClick={handleDelete} className="px-2 py-1.5 text-xs bg-red-600 text-white rounded-lg">Sim</button>
                <button onClick={() => setShowDeleteConfirm(false)} className="px-2 py-1.5 text-xs bg-s3 text-t2 rounded-lg">Não</button>
              </div>
            ) : (
              <button onClick={() => setShowDeleteConfirm(true)} className="w-8 h-8 flex items-center justify-center text-t4 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all" title="Excluir lead">
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Discard overlay ──────────────────────────────────────────────────── */}
      {showDiscard && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => { setShowDiscard(false); setSelectedReason(null); setDiscardSearch('') }} />
          <div className="relative w-full sm:max-w-md modal-surface rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200 flex flex-col max-h-[90vh]">

            <div className="px-5 pt-5 pb-4 border-b border-line flex-shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle size={16} className="text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-t1">Descartar lead</h3>
                    <p className="text-xs text-t3 mt-0.5 truncate max-w-[220px]">{lead.name}</p>
                  </div>
                </div>
                <button onClick={() => { setShowDiscard(false); setSelectedReason(null); setDiscardSearch('') }} className="w-7 h-7 flex items-center justify-center rounded-lg bg-s3/50 hover:bg-s3 text-t3 hover:text-t2 transition-all">
                  <X size={13} />
                </button>
              </div>
              {discardReasons.length > 4 && (
                <div className="relative mt-3">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-t3 pointer-events-none" />
                  <input
                    type="text"
                    value={discardSearch}
                    onChange={e => setDiscardSearch(e.target.value)}
                    placeholder="Filtrar motivos..."
                    className="w-full bg-s3/50 border border-line rounded-xl pl-8 pr-3 py-2 text-xs text-t1 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                  />
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
              <p className="text-[10px] font-semibold text-t4 uppercase tracking-wider px-1 mb-2">Motivo do descarte</p>
              {discardReasons
                .filter(r => !discardSearch || r.label.toLowerCase().includes(discardSearch.toLowerCase()))
                .map(r => {
                  const isSelected = selectedReason === r.slug
                  return (
                    <button
                      key={r.id}
                      onClick={() => setSelectedReason(r.slug as LeadDiscardReason)}
                      className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border text-left transition-all
                        ${isSelected ? 'bg-red-500/12 border-red-500/40' : 'bg-s2/50 border-line hover:bg-s2 hover:border-line-strong'}`}
                    >
                      <span className="text-base flex-shrink-0 w-7 text-center">{r.emoji ?? '📋'}</span>
                      <span className={`flex-1 text-sm font-medium ${isSelected ? 'text-red-200' : 'text-t2'}`}>{r.label}</span>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${isSelected ? 'bg-red-500 border-red-500' : 'border-line-strong bg-s2'}`}>
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
                className="w-full py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/20"
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
