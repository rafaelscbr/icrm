import { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  X, MessageCircle, UserCheck, Building2,
  Trash2, RotateCcw, Edit2, AlertTriangle, CheckCircle2,
  ClipboardList, Star, Search, Check,
  ChevronDown, StickyNote, PhoneCall,
  ListPlus, Loader2, Sparkles, Smartphone, Globe, Handshake,
  Megaphone, MapPin, Phone, Mail, Home, Users, ArrowRight,
  RefreshCw, BadgeCheck,
} from 'lucide-react'
import { Lead, LeadDiscardReason, LeadFunnelStage, LeadInteractionType, MAX_TENTATIVAS_FOLLOWUP } from '../../types'
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
import { LeadProfilePanel } from './LeadProfilePanel'
import { LeadIntelPanel } from './LeadIntelPanel'
import { useSlaInfo } from './SlaBadge'
import { avisoReentrada } from './reentrada'
import { ContactCampaignHistory } from '../lead-lists/ContactCampaignHistory'
import { Abas } from '../../components/shared/Abas'
import { Destaque } from '../../components/shared/Destaque'
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

/** "hoje", "ontem", "há 5 dias" — para o número do último contato. */
function haQuanto(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (dias <= 0) return 'Hoje'
  if (dias === 1) return 'Ontem'
  return `Há ${dias} dias`
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
    followup:    `Enviar ${Math.min(followupStep + 1, MAX_TENTATIVAS_FOLLOWUP)}ª mensagem de follow-up`,
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
  const { discard, restore, remove, convertToContact, advanceFollowup, toggleFlag, update, setStage, transfer, ackReentry, leads } = useLeadsStore()
  const lead = leads.find(l => l.id === initialLead.id) ?? initialLead

  const { add: addContact, getById }       = useContactsStore()
  const { add: addInteraction, getForLead, loadForLead } = useLeadInteractionsStore()
  const { properties }                      = usePropertiesStore()
  const { getByType }                       = useLeadConfigStore()
  const { profile, isAdmin, allProfiles, fetchAllProfiles } = useAuthStore()

  // Transferência: admin transfere qualquer lead; corretor transfere os seus
  const canTransfer = isAdmin || (!!profile && lead.brokerId === profile.id)

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
  const [showRawNotes,      setShowRawNotes]      = useState(false)
  const [showAddToList,     setShowAddToList]     = useState(false)
  const [selectedListId,    setSelectedListId]    = useState('')
  const [addingToList,      setAddingToList]      = useState(false)
  const [noteText,          setNoteText]          = useState('')
  const [showNoteInput,     setShowNoteInput]     = useState(false)
  const [showBrokerMenu,    setShowBrokerMenu]    = useState(false)
  // Ciclo interação → tarefa: tipo da última interação registrada nesta sessão
  const [nextStepFor,       setNextStepFor]       = useState<LeadInteractionType | null>(null)
  const [aba,               setAba]               = useState<'resumo' | 'perfil' | 'historico'>('resumo')

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

  // Abriu o lead = viu a reentrada. O aviso continua na tela enquanto o painel
  // estiver aberto (o estado é capturado na montagem); o que baixa é o destaque
  // no Kanban e na lista. Só o dono baixa — a RPC ignora os outros.
  const [avisoAoAbrir] = useState(() => avisoReentrada(initialLead))
  useEffect(() => { void ackReentry(initialLead.id) }, [initialLead.id, ackReentry])

  // O histórico só era baixado quando a aba Histórico abria — até lá o Resumo
  // dizia "Nenhum contato registrado" para um lead com oito registros.
  useEffect(() => { void loadForLead(initialLead.id) }, [initialLead.id, loadForLead])

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
  // Último contato: o mais recente entre o histórico carregado e o
  // `lastContactAt` do lead (trigger 074) — a mesma fonte do Kanban. Só o
  // histórico deixava a ficha dizendo "Nunca" quando o card dizia "há 5 dias".
  const ultimoContatoIso = [lastReal?.interactedAt, lead.lastContactAt]
    .filter((d): d is string => !!d)
    .sort()
    .slice(-1)[0]
  const daysSince     = (Date.now() - new Date(ultimoContatoIso ?? lead.createdAt).getTime()) / 86_400_000
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
    const nextStep = lead.funnelStage === 'lead' ? 1 : Math.min(lead.followupStep + 1, MAX_TENTATIVAS_FOLLOWUP)
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

  // Transferência completa via RPC: auditoria em lead_assignments, nota no
  // histórico, notificação ao novo responsável e realinhamento RLS do contato
  async function handleReassignBroker(brokerId: string, name: string) {
    setShowBrokerMenu(false)
    if (brokerId === lead.brokerId) return
    try {
      await transfer(lead.id, brokerId)
      toast.success(`Lead transferido para ${name}`)
      // Corretor (não-admin) transferiu para outro: o lead saiu da lista dele
      if (!isAdmin) onClose()
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
      const c = await addContact({ name: lead.name, phone: lead.phone, tags: [], hasChildren: false, isMarried: false, permutaItems: [] })
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
    } catch {
      toast.error('Erro ao adicionar à lista')
    } finally {
      setAddingToList(false)
    }
  }

  const currentIndex = STAGES.indexOf(lead.funnelStage)
  const telefone     = contact?.phone ?? lead.phone
  const entrouEm     = new Date(lead.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
  const ultimoToque  = ultimoContatoIso ? haQuanto(ultimoContatoIso) : null
  const diasParado   = Math.floor(daysSince)

  // ── "Agora": um bloco só, com o que fazer e o tom do momento ─────────────
  // Antes eram até quatro faixas empilhadas (reentrada, SLA, tarefa ou
  // sugestão, tentativas) e os três botões soltos embaixo. Agora o que fazer
  // e o botão que faz moram juntos, e o tom pinta só o filete à esquerda.
  type Tom = 'risco' | 'atencao' | 'sucesso' | 'neutro'
  const agora: { rotulo: string; texto: string; tom: Tom; prazo?: string } =
    lead.funnelStage === 'venda'
      ? { rotulo: 'Venda realizada', texto: 'Manter o relacionamento — indicação vem daqui.', tom: 'sucesso' }
      : slaInfo
        ? { rotulo: slaInfo.overdue ? 'SLA vencido' : '1º contato Meta Ads',
            texto: slaInfo.overdue
              ? 'Transferência iminente. Chame no WhatsApp para registrar o contato.'
              : `Chame no WhatsApp para parar o relógio. Prazo: ${slaInfo.deadline}.`,
            tom: slaInfo.urgent ? 'risco' : 'atencao', prazo: slaInfo.overdue ? undefined : slaInfo.text }
        : pendingTask
          ? { rotulo: 'Próximo passo agendado', texto: pendingTask.title,
              tom: taskDue?.overdue ? 'risco' : taskDue?.today ? 'atencao' : 'neutro', prazo: taskDue?.text }
          : { rotulo: nextUrgent ? 'Agir agora' : 'Próximo passo', texto: nextMsg, tom: nextUrgent ? 'atencao' : 'neutro' }

  const corTom: Record<Tom, string> = {
    risco: 'var(--error)', atencao: 'var(--warning)', sucesso: 'var(--success)', neutro: 'var(--brand)',
  }

  // Portal no <body>: dentro da tela o painel ficava abaixo da faixa de abas.
  return createPortal(
    <>
      {/* ── Ficha do lead — v2 "Folha" (01/11/2026) ─────────────────────────
          Painel à direita no desktop (o Kanban continua visível ao lado) e
          tela cheia no celular. A ficha responde três perguntas, nesta ordem:
          quem é (cabeçalho), em que pé está (régua de etapas) e o que fazer
          agora (bloco Agora, com os botões). O resto — perfil, inteligência,
          histórico, listas — fica em abas, em vez de doze caixas empilhadas. */}
      <div className="fixed inset-0 z-50 flex justify-end">
        <div className="absolute inset-0 bg-black/25" onClick={onClose} aria-hidden />

        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Lead ${lead.name}`}
          className="ficha relative w-full sm:max-w-[36rem] h-full overflow-hidden sm:rounded-l-[22px]
            animate-in fade-in slide-in-from-right-4 duration-200 flex flex-col"
        >

          {/* ── Cabeçalho ──────────────────────────────────────────────────── */}
          <header className="flex-shrink-0 px-6" style={{ paddingTop: 'calc(18px + env(safe-area-inset-top, 0px))' }}>
            <div className="flex items-center justify-between gap-2 -mr-2 mb-3">
              <span className="text-[12.5px] text-t4 flex items-center gap-1.5 min-w-0">
                <originConf.icon size={13} strokeWidth={1.8} aria-hidden />
                <span className="truncate">{originConf.label} · entrou em {entrouEm}</span>
              </span>
              <div className="flex items-center flex-shrink-0">
                <button
                  onClick={async () => {
                    try {
                      await toggleFlag(lead.id)
                      toast.success(lead.flagged ? 'Prioridade removida' : 'Marcado como prioridade')
                    } catch { /* erro já toastado */ }
                  }}
                  className={`ficha-icone ${lead.flagged ? 'text-brand-text' : ''}`}
                  title={lead.flagged ? 'Remover prioridade' : 'Marcar prioridade'}
                  aria-label={lead.flagged ? 'Remover prioridade' : 'Marcar prioridade'}
                  aria-pressed={!!lead.flagged}
                >
                  <Star size={17} strokeWidth={1.8} fill={lead.flagged ? 'currentColor' : 'none'} />
                </button>
                <button onClick={() => setShowEdit(true)} className="ficha-icone" title="Editar" aria-label="Editar informações do lead">
                  <Edit2 size={16} strokeWidth={1.8} />
                </button>
                <button onClick={onClose} className="ficha-icone" aria-label="Fechar">
                  <X size={19} strokeWidth={1.8} />
                </button>
              </div>
            </div>

            <h2 className="font-display text-[26px] sm:text-[28px] font-bold text-t1 leading-[1.1] tracking-[-0.025em]"
                style={{ textWrap: 'balance' } as React.CSSProperties}>
              {lead.name}
            </h2>

            <div className="flex items-center gap-x-3 gap-y-1.5 mt-2 flex-wrap">
              <a href={`tel:${telefone}`} className="text-[14px] text-t2 hover:text-t1 tabular-nums" aria-label={`Ligar para ${lead.name}`}>
                {formatPhone(telefone)}
              </a>

              {/* Corretor — admin ou dono transfere em um clique */}
              {(brokerName || isAdmin) && (
                <div className="relative">
                  <button
                    onClick={() => {
                      if (!canTransfer) return
                      if (allProfiles.length === 0) fetchAllProfiles()
                      setShowBrokerMenu(v => !v)
                    }}
                    disabled={!canTransfer}
                    title={canTransfer ? 'Transferir para outro corretor' : `Corretor: ${brokerName}`}
                    aria-haspopup={canTransfer ? 'listbox' : undefined}
                    aria-expanded={canTransfer ? showBrokerMenu : undefined}
                    className={`inline-flex items-center gap-1.5 h-7 pl-1 pr-2.5 rounded-full bg-s2 text-[13px] text-t2
                      ${canTransfer ? 'hover:bg-s3 cursor-pointer' : 'cursor-default'}`}
                  >
                    <span className="w-5 h-5 rounded-full bg-brand-fill text-brand-fill-text flex items-center justify-center text-[10.5px] font-bold" aria-hidden>
                      {(brokerName ?? '?').charAt(0).toUpperCase()}
                    </span>
                    {brokerName ? brokerName.split(' ')[0] : 'Atribuir'}
                    {canTransfer && <ChevronDown size={12} strokeWidth={1.8} className="text-t4" aria-hidden />}
                  </button>
                  {canTransfer && showBrokerMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowBrokerMenu(false)} aria-hidden />
                      <div className="absolute left-0 top-full mt-1.5 z-20 min-w-[210px] bg-surface border border-line rounded-[14px] shadow-dropdown overflow-hidden py-1"
                           role="listbox" aria-label="Transferir lead para">
                        {allProfiles.filter(p => p.active).map(p => (
                          <button
                            key={p.id}
                            role="option"
                            aria-selected={p.id === lead.brokerId}
                            onClick={() => handleReassignBroker(p.id, p.name)}
                            className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-[13.5px] transition-colors
                              ${p.id === lead.brokerId ? 'text-t1 bg-s2' : 'text-t2 hover:bg-s2'}`}
                          >
                            <span className="flex-1 truncate">{p.name}</span>
                            {p.id === lead.brokerId && <Check size={14} className="text-brand-text flex-shrink-0" />}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {lead.flagged && !isDiscarded && <span className="text-[13px] font-medium text-brand-text">Prioridade</span>}
              {isLinked && <span className="text-[13px] text-t4">No CRM</span>}
              {isDiscarded && <span className="text-[13px] font-medium text-error">Descartado</span>}
            </div>

            {/* Régua de etapas — clique para mover */}
            <ol className="ficha-regua mt-6" aria-label="Etapa do funil">
              {STAGES.map((stage, i) => {
                const meta  = STAGE_META[stage]
                const atual = i === currentIndex
                const feita = i < currentIndex
                return (
                  <li key={stage} className="flex-1 min-w-0">
                    <button
                      onClick={() => handleSetStage(stage)}
                      disabled={isDiscarded}
                      aria-current={atual ? 'step' : undefined}
                      title={atual ? meta.label : `Mover para ${meta.label}`}
                      className="ficha-etapa"
                      aria-label={atual ? `Etapa atual: ${meta.label}` : `Mover para ${meta.label}`}
                      data-estado={atual ? 'atual' : feita ? 'feita' : 'futura'}
                      style={{ ['--etapa' as string]: STAGE_META[STAGES[Math.max(currentIndex, 0)]].solidVar }}
                    >
                      <span className="ficha-etapa-trilho" aria-hidden><span className="ficha-etapa-ponto" /></span>
                      <span className="ficha-etapa-nome">{meta.label}</span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </header>

          {/* ── Abas ──────────────────────────────────────────────────────── */}
          <div className="flex-shrink-0 px-6 mt-4 border-b border-line">
            <Abas
              rotulo="Seções do lead"
              variante="sublinhado"
              valor={aba}
              onChange={setAba}
              abas={[
                { value: 'resumo'    as const, label: 'Resumo' },
                { value: 'perfil'    as const, label: 'Perfil' },
                { value: 'historico' as const, label: 'Histórico', badge: interactions.length || undefined },
              ]}
            />
          </div>

          {/* ── Corpo ─────────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5">

            {aba === 'resumo' && (
              <div className="flex flex-col gap-6">
                {/* O lead voltou sozinho — muda a abertura da conversa. */}
                {avisoAoAbrir && (
                  <p className="flex items-start gap-2.5 text-[13.5px] text-t2 leading-relaxed">
                    {avisoAoAbrir.tipo === 'cliente'
                      ? <BadgeCheck size={16} strokeWidth={1.8} className="text-info flex-shrink-0 mt-0.5" aria-hidden />
                      : <RefreshCw  size={16} strokeWidth={1.8} className="text-info flex-shrink-0 mt-0.5" aria-hidden />}
                    <span><span className="font-semibold text-info">{avisoAoAbrir.texto}.</span> {avisoAoAbrir.detalhe}</span>
                  </p>
                )}

                {/* Agora */}
                {!isDiscarded && (
                  <section className="ficha-agora" style={{ ['--tom' as string]: corTom[agora.tom] }} aria-label="O que fazer agora">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[12.5px] font-semibold" style={{ color: agora.tom === 'neutro' ? 'var(--t3)' : 'var(--tom)' }}>
                        {agora.rotulo}
                      </p>
                      {agora.prazo && (
                        <span className="text-[12.5px] font-semibold tabular-nums flex-shrink-0"
                              style={{ color: agora.tom === 'neutro' ? 'var(--t3)' : 'var(--tom)' }}>
                          {agora.prazo}
                        </span>
                      )}
                    </div>
                    <p className="text-[16px] font-semibold text-t1 leading-snug mt-1">{agora.texto}</p>

                    {lead.funnelStage === 'followup' && (
                      <div className="flex items-center gap-3 mt-3">
                        <div className="flex flex-1 min-w-0 gap-1" role="group" aria-label="Tentativas de contato">
                          {Array.from({ length: MAX_TENTATIVAS_FOLLOWUP }, (_, i) => i + 1).map(step => (
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
                              className="ficha-tentativa"
                              data-feita={step <= lead.followupStep}
                            />
                          ))}
                        </div>
                        <span className="text-[12.5px] text-t4 tabular-nums flex-shrink-0">
                          {lead.followupStep}/{MAX_TENTATIVAS_FOLLOWUP}<span className="hidden sm:inline"> tentativas</span>
                        </span>
                      </div>
                    )}

                    <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-2 mt-4">
                      <button onClick={handleWhatsApp} className="ficha-acao ficha-acao-zap" aria-label="Abrir WhatsApp e registrar contato">
                        <MessageCircle size={17} strokeWidth={2} aria-hidden /> WhatsApp
                      </button>
                      <button onClick={handleCall} className="ficha-acao" aria-label="Ligar e registrar contato">
                        <PhoneCall size={16} strokeWidth={1.9} aria-hidden /> Ligar
                      </button>
                      <button onClick={() => setShowTaskForm(true)} className="ficha-acao" aria-label="Criar tarefa para este lead">
                        <ClipboardList size={16} strokeWidth={1.9} aria-hidden /> Tarefa
                      </button>
                    </div>
                  </section>
                )}

                {!isDiscarded && nextStepFor && (
                  <NextStepSuggestion lead={lead} interactionType={nextStepFor} onDone={() => setNextStepFor(null)} />
                )}

                {/* Descarte */}
                {isDiscarded && lead.discardReason && (() => {
                  const r = discardReasons.find(r => r.slug === lead.discardReason)
                  return (
                    <section className="ficha-agora" style={{ ['--tom' as string]: 'var(--error)' }}>
                      <p className="text-[12.5px] font-semibold text-error">
                        Descartado{lead.discardedAt ? ` em ${new Date(lead.discardedAt).toLocaleDateString('pt-BR')}` : ''}
                      </p>
                      <p className="text-[16px] font-semibold text-t1 mt-1">{r?.label ?? lead.discardReason}</p>
                    </section>
                  )
                })()}

                {/* Números do negócio */}
                <dl className="ficha-numeros">
                  <div>
                    <dt>Ticket</dt>
                    <dd className="tabular-nums text-t1">{ticket ? formatCurrency(ticket) : '—'}</dd>
                  </div>
                  <div>
                    <dt>Comissão</dt>
                    <dd className={`tabular-nums ${commission > 0 ? 'text-success' : 'text-t1'}`}>{commission > 0 ? formatCurrency(commission) : '—'}</dd>
                  </div>
                  <div>
                    <dt>Último contato</dt>
                    <dd className={!ultimoToque || diasParado > 2 ? 'text-warning' : 'text-t1'}>
                      {ultimoToque ?? 'Nunca'}
                    </dd>
                  </div>
                </dl>

                {/* Imóvel */}
                {(property || lead.propertyName) && (
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-[12px] bg-s2 flex items-center justify-center flex-shrink-0" aria-hidden>
                      <Building2 size={17} strokeWidth={1.8} className="text-t3" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[14.5px] font-semibold text-t1 truncate">{property?.name ?? lead.propertyName}</p>
                      <p className="text-[13px] text-t4 truncate">
                        {property
                          ? `${property.neighborhood} · ${property.kind === 'off_plan' ? 'Lançamento' : 'Pronto'}${ticket ? ` · ${formatCurrencyFull(ticket)}` : ''}`
                          : 'Imóvel de interesse'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Últimos toques */}
                <section>
                  <div className="flex items-baseline justify-between mb-2">
                    <h3 className="text-[15px] font-semibold text-t1">Últimos <Destaque>toques</Destaque></h3>
                    {interactions.length > 3 && (
                      <button onClick={() => setAba('historico')} className="text-[13px] font-medium text-t3 hover:text-t1">
                        Ver todos
                      </button>
                    )}
                  </div>
                  {recentItems.length === 0 ? (
                    <p className="text-[13.5px] text-t4">Nenhum contato registrado ainda.</p>
                  ) : (
                    <ul className="flex flex-col">
                      {recentItems.map(i => {
                        const ItemIcon = INTERACTION_ICON[i.type] ?? StickyNote
                        return (
                          <li key={i.id} className="flex items-center gap-3 py-2">
                            <ItemIcon size={15} strokeWidth={1.8} className="text-t4 flex-shrink-0" aria-hidden />
                            <p className="flex-1 text-[14px] text-t2 truncate">{i.description ?? i.type}</p>
                            <span className="text-[12.5px] text-t4 flex-shrink-0 tabular-nums">{relativeTime(i.interactedAt)}</span>
                          </li>
                        )
                      })}
                    </ul>
                  )}

                  {/* Nota rápida — sempre à mão, sem abrir nada */}
                  {!isDiscarded && (
                    showNoteInput ? (
                      <div className="mt-2 flex flex-col gap-2">
                        <label htmlFor="lead-quick-note" className="sr-only">Nota rápida</label>
                        {/* eslint-disable-next-line jsx-a11y/no-autofocus -- aberta por clique dentro do painel já aberto */}
                        <textarea autoFocus id="lead-quick-note" value={noteText} onChange={e => setNoteText(e.target.value)}
                          placeholder="O que aconteceu? O que ficou combinado?" rows={3}
                          className="campo w-full px-3.5 py-2.5 resize-none leading-relaxed" />
                        <div className="flex justify-end gap-2">
                          <button onClick={() => { setShowNoteInput(false); setNoteText('') }} className="h-9 px-3 rounded-[10px] text-[13.5px] text-t3 hover:text-t1 hover:bg-s2">
                            Cancelar
                          </button>
                          <button onClick={handleSaveNote} disabled={!noteText.trim()} className="h-9 px-4 rounded-[10px] text-[13.5px] font-semibold bg-brand-fill text-brand-fill-text hover:bg-brand-fill-hover disabled:opacity-50">
                            Salvar nota
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setShowNoteInput(true)}
                        className="mt-2 w-full flex items-center gap-2.5 h-11 px-3.5 rounded-[12px] bg-s2 text-[14px] text-t4 hover:text-t2 text-left transition-colors">
                        <StickyNote size={15} strokeWidth={1.8} aria-hidden /> Escrever uma nota…
                      </button>
                    )
                  )}
                </section>

                {/* Observações escritas por gente — o bloco automático do Meta vai para Perfil */}
                {lead.notes && !/^Meta Ads —/.test(lead.notes.trim()) && (
                  <section>
                    <h3 className="text-[15px] font-semibold text-t1 mb-1.5">Observações</h3>
                    <p className="text-[14px] text-t2 leading-relaxed whitespace-pre-wrap">{lead.notes}</p>
                  </section>
                )}
              </div>
            )}

            {aba === 'perfil' && (
              <div className="flex flex-col gap-6">
                <LeadIntelPanel lead={lead} />
                <LeadProfilePanel leadId={lead.id} />
                {lead.notes && /^Meta Ads —/.test(lead.notes.trim()) && (
                  <section>
                    <button onClick={() => setShowRawNotes(v => !v)} aria-expanded={showRawNotes}
                      className="flex items-center gap-1.5 text-[13px] font-medium text-t3 hover:text-t1">
                      Texto original do formulário
                      <ChevronDown size={14} strokeWidth={1.8} aria-hidden className={`transition-transform ${showRawNotes ? 'rotate-180' : ''}`} />
                    </button>
                    {showRawNotes && <p className="text-[13.5px] text-t2 leading-relaxed whitespace-pre-wrap mt-2">{lead.notes}</p>}
                  </section>
                )}
              </div>
            )}

            {aba === 'historico' && (
              <div className="flex flex-col gap-8">
                <LeadTimeline leadId={lead.id} />

                <section>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <h3 className="text-[15px] font-semibold text-t1">Listas e campanhas</h3>
                    {lead.contactId && (
                      <button
                        onClick={() => { if (activeLists.length === 0) loadLists(); setShowAddToList(v => !v) }}
                        aria-expanded={showAddToList}
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-s2 text-[13px] font-medium text-t2 hover:bg-s3"
                      >
                        <ListPlus size={14} strokeWidth={1.8} aria-hidden /> Adicionar à lista
                      </button>
                    )}
                  </div>

                  {showAddToList && lead.contactId && (
                    <div className="mb-3 flex flex-col gap-2">
                      <div className="rounded-[12px] bg-s2 max-h-48 overflow-y-auto" role="radiogroup" aria-label="Lista de destino">
                        {activeLists.length === 0 ? (
                          <p className="text-[13px] text-t4 px-3.5 py-3">Nenhuma lista ativa.</p>
                        ) : activeLists.map(l => (
                          <button key={l.id} role="radio" aria-checked={selectedListId === l.id}
                            onClick={() => setSelectedListId(l.id)}
                            className="w-full flex items-center gap-3 px-3.5 min-h-[44px] text-left hover:bg-s3/60">
                            <span className={`w-4 h-4 rounded-full flex-shrink-0 ${selectedListId === l.id ? 'border-[5px] border-[color:var(--brand-fill)]' : 'border-[1.5px] border-line-strong'}`} aria-hidden />
                            <span className="flex-1 truncate text-[14px] text-t2">{l.name}</span>
                            <span className="text-[12.5px] text-t4 tabular-nums">{l.totalCount.toLocaleString('pt-BR')}</span>
                          </button>
                        ))}
                      </div>
                      <div className="flex justify-end gap-2">
                        <button onClick={() => { setShowAddToList(false); setSelectedListId('') }} className="h-9 px-3 rounded-[10px] text-[13.5px] text-t3 hover:text-t1 hover:bg-s2">Cancelar</button>
                        <button onClick={handleAddToList} disabled={!selectedListId || addingToList}
                          className="h-9 px-4 rounded-[10px] text-[13.5px] font-semibold bg-brand-fill text-brand-fill-text hover:bg-brand-fill-hover disabled:opacity-50 inline-flex items-center gap-1.5">
                          {addingToList && <Loader2 size={14} className="animate-spin" aria-hidden />} Adicionar
                        </button>
                      </div>
                    </div>
                  )}

                  {lead.contactId ? (
                    <ContactCampaignHistory contactId={lead.contactId} />
                  ) : (
                    <p className="text-[13.5px] text-t4">
                      Converta em contato para ver listas, campanhas e vendas ligadas a esta pessoa.
                    </p>
                  )}
                </section>
              </div>
            )}
          </div>

          {/* ── Rodapé ─────────────────────────────────────────────────────── */}
          <footer className="flex-shrink-0 px-6 pt-3 border-t border-line flex items-center gap-2" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>
            {!isLinked && !isDiscarded && (
              <button onClick={handleConvert} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] text-[13.5px] font-medium text-t2 hover:text-t1 hover:bg-s2">
                <UserCheck size={15} strokeWidth={1.8} aria-hidden /> Criar contato
              </button>
            )}
            <div className="flex-1" />
            {isDiscarded ? (
              <button onClick={handleRestore} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] text-[13.5px] font-medium text-t2 hover:text-t1 hover:bg-s2">
                <RotateCcw size={15} strokeWidth={1.8} aria-hidden /> Restaurar
              </button>
            ) : (
              <button onClick={() => setShowDiscard(true)} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] text-[13.5px] font-medium text-error hover:bg-error-bg">
                Descartar
              </button>
            )}
            {showDeleteConfirm ? (
              <div className="flex items-center gap-1.5" role="alertdialog" aria-label="Confirmar exclusão definitiva">
                <span className="text-[13px] text-error">Excluir de vez?</span>
                <button onClick={handleDelete} className="h-8 px-3 rounded-[10px] text-[13px] font-semibold bg-error text-white">Excluir</button>
                <button onClick={() => setShowDeleteConfirm(false)} className="h-8 px-3 rounded-[10px] text-[13px] text-t2 hover:bg-s2">Não</button>
              </div>
            ) : (
              <button onClick={() => setShowDeleteConfirm(true)} className="ficha-icone hover:!text-error" title="Excluir lead" aria-label="Excluir lead definitivamente">
                <Trash2 size={16} strokeWidth={1.8} />
              </button>
            )}
          </footer>
        </div>
      </div>

      {/* ── Discard overlay ──────────────────────────────────────────────────── */}
      {showDiscard && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- fundo do diálogo: fechar por teclado é o Escape, tratado no componente */}
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
      {showTaskForm && <TaskForm isOpen={showTaskForm} onClose={() => setShowTaskForm(false)} defaultContactId={lead.contactId} defaultLeadId={lead.id} />}
    </>
  , document.body)
}
