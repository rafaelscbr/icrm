import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Calendar, User, Building2, Plus, ExternalLink,
  CheckCircle2, ListChecks, X, UserCheck, ChevronRight, ChevronLeft,
  Clock, Flag, FileText, Zap, Users,
} from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Task, TaskCategory, TaskPriority, ChecklistItem } from '../../types'
import { generateId } from '../../lib/formatters'
import { useTasksStore } from '../../store/useTasksStore'
import { useContactsStore } from '../../store/useContactsStore'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { useAuthStore } from '../../store/useAuthStore'
import { buildGoogleCalendarUrl } from '../../lib/googleCalendar'
import { localDateStr } from '../../lib/formatters'
import { ContactForm } from '../contacts/ContactForm'
import toast from 'react-hot-toast'

interface TaskFormProps {
  isOpen: boolean
  onClose: () => void
  task?: Task
  defaultContactId?: string
}

const CATEGORY_OPTIONS: { value: TaskCategory; label: string; icon: string }[] = [
  { value: 'visita',             label: 'Visita',          icon: '🏠' },
  { value: 'proposta',           label: 'Proposta',        icon: '📋' },
  { value: 'agenciamento',       label: 'Agenciamento',    icon: '🤝' },
  { value: 'busca_imovel',       label: 'Busca de Imóvel', icon: '🔍' },
  { value: 'prospeccao_imoveis', label: 'Prospecção',      icon: '📡' },
  { value: 'campanhas',          label: 'Campanha',        icon: '📢' },
  { value: 'administrativo',     label: 'Admin',           icon: '⚙️' },
  { value: 'souza_financeiro',   label: 'Souza Financeiro', icon: '$'  },
  { value: 'outro',              label: 'Outro',            icon: '💬' },
]

const PRIORITY_OPTIONS: { value: TaskPriority; label: string; color: string; bg: string; border: string; dot: string }[] = [
  { value: 'low',    label: 'Baixa',  color: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', dot: 'bg-emerald-400' },
  { value: 'medium', label: 'Média',  color: 'text-amber-300',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   dot: 'bg-amber-400'   },
  { value: 'high',   label: 'Alta',   color: 'text-red-300',     bg: 'bg-red-500/10',     border: 'border-red-500/30',     dot: 'bg-red-400'     },
]

const inputBase =
  'w-full bg-s3/50 border border-line hover:border-line-strong rounded-xl px-3 py-3 min-h-[44px] text-sm text-slate-100 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all duration-150'

function todayStr()    { return localDateStr() }
function tomorrowStr() { const d = new Date(); d.setDate(d.getDate() + 1); return localDateStr(d) }
function nextWeekStr() { const d = new Date(); d.setDate(d.getDate() + 7); return localDateStr(d) }

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const STEP_LABELS = ['O que?', 'Quando?', 'Detalhes']

export function TaskForm({ isOpen, onClose, task, defaultContactId }: TaskFormProps) {
  const { add, update }                              = useTasksStore()
  const { contacts }                                 = useContactsStore()
  const { properties }                               = usePropertiesStore()
  const { isAdmin, profile, allProfiles, fetchAllProfiles } = useAuthStore()
  const isEditing = Boolean(task)

  const today = todayStr()

  // ── State ─────────────────────────────────────────────────────────────────
  const [step,        setStep]        = useState(0)
  const [direction,   setDirection]   = useState<1 | -1>(1)
  const [animating,   setAnimating]   = useState(false)

  const [title,       setTitle]       = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [dueDate,     setDueDate]     = useState(task?.dueDate ?? today)
  const [dueTime,     setDueTime]     = useState(task?.dueTime ?? '')
  const [priority,    setPriority]    = useState<TaskPriority>(task?.priority ?? 'medium')
  const [category,    setCategory]    = useState<TaskCategory | ''>(task?.category ?? '')
  const [contactId,   setContactId]   = useState(task?.contactId ?? defaultContactId ?? '')
  const [propertyId,  setPropertyId]  = useState(task?.propertyId ?? '')
  const [assignedToId,   setAssignedToId]   = useState(task?.assignedToId ?? '')
  const [participantIds, setParticipantIds] = useState<string[]>(task?.participants ?? [])
  const [markDone,    setMarkDone]    = useState(task?.status === 'done')
  const [completedDate, setCompletedDate] = useState(task?.completedAt ? task.completedAt.split('T')[0] : today)

  const [showContactDrop,  setShowContactDrop]  = useState(false)
  const [contactSearch,    setContactSearch]    = useState(
    task?.contactId ? (contacts.find(c => c.id === task.contactId)?.name ?? '')
    : defaultContactId ? (contacts.find(c => c.id === defaultContactId)?.name ?? '')
    : ''
  )
  const [showPropertyDrop, setShowPropertyDrop] = useState(false)
  const [propertySearch,   setPropertySearch]   = useState(
    task?.propertyId ? (properties.find(p => p.id === task.propertyId)?.name ?? '') : ''
  )
  const [showCustomDate,   setShowCustomDate]   = useState(false)
  const [showDesc,         setShowDesc]         = useState(Boolean(task?.description))
  const [newContactOpen,   setNewContactOpen]   = useState(false)
  const [titleError,       setTitleError]       = useState('')

  const [checklist,     setChecklist]     = useState<ChecklistItem[]>(task?.checklist ?? [])
  const [showChecklist, setShowChecklist] = useState(Boolean(task?.checklist?.length))
  const [newItemText,   setNewItemText]   = useState('')
  const newItemRef = useRef<HTMLInputElement>(null)
  const titleRef   = useRef<HTMLInputElement>(null)

  const assignableProfiles = useMemo(() => {
    if (isAdmin) return allProfiles.filter(p => p.role === 'broker' && p.active && p.id !== profile?.id)
    return allProfiles.filter(p => p.role === 'admin' && p.active)
  }, [isAdmin, allProfiles, profile?.id])

  // Perfis disponíveis para compartilhamento — todos exceto o próprio usuário
  const shareableProfiles = useMemo(() =>
    allProfiles.filter(p => p.active && p.id !== profile?.id),
    [allProfiles, profile?.id]
  )

  function toggleParticipant(userId: string) {
    setParticipantIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    )
  }

  // ── Reset on open ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    setStep(0); setDirection(1); setAnimating(false)
    setTitle(task?.title ?? '')
    setDescription(task?.description ?? '')
    setDueDate(task?.dueDate ?? todayStr())
    setDueTime(task?.dueTime ?? '')
    setPriority(task?.priority ?? 'medium')
    setCategory(task?.category ?? '')
    const resolvedContactId = task?.contactId ?? defaultContactId ?? ''
    setContactId(resolvedContactId)
    setPropertyId(task?.propertyId ?? '')
    setContactSearch(resolvedContactId ? (contacts.find(c => c.id === resolvedContactId)?.name ?? '') : '')
    setPropertySearch(task?.propertyId ? (properties.find(p => p.id === task.propertyId)?.name ?? '') : '')
    setAssignedToId(task?.assignedToId ?? '')
    setParticipantIds(task?.participants ?? [])
    setMarkDone(task?.status === 'done')
    setCompletedDate(task?.completedAt ? task.completedAt.split('T')[0] : todayStr())
    setChecklist(task?.checklist ?? [])
    setShowChecklist(Boolean(task?.checklist?.length))
    setNewItemText('')
    setShowDesc(Boolean(task?.description))
    setShowCustomDate(false)
    setTitleError('')
    if (allProfiles.length === 0) fetchAllProfiles()
    setTimeout(() => titleRef.current?.focus(), 50)
  }, [task, isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navigation ────────────────────────────────────────────────────────────
  function goTo(next: number) {
    if (next === step || animating) return
    setDirection(next > step ? 1 : -1)
    setAnimating(true)
    setTimeout(() => { setStep(next); setAnimating(false) }, 180)
  }

  function handleNext() {
    if (step === 0) {
      if (!title.trim()) { setTitleError('Dê um nome para a tarefa'); titleRef.current?.focus(); return }
      setTitleError('')
    }
    if (step < 2) goTo(step + 1)
  }

  function handleBack() { if (step > 0) goTo(step - 1) }

  // ── Submit ────────────────────────────────────────────────────────────────
  function handleSubmit() {
    if (!title.trim()) { setTitleError('Dê um nome para a tarefa'); goTo(0); return }

    const data = {
      title:       title.trim(),
      description: description.trim() || undefined,
      dueDate:     dueDate  || undefined,
      dueTime:     dueTime  || undefined,
      priority,
      category:    (category as TaskCategory) || undefined,
      status:      markDone ? ('done' as const) : (task?.status ?? ('pending' as const)),
      completedAt: markDone ? `${completedDate}T12:00:00.000Z` : undefined,
      contactId:   contactId  || undefined,
      propertyId:  propertyId || undefined,
      checklist:   checklist.length > 0 ? checklist : undefined,
      assignedToId:  assignedToId || undefined,
      participants:  participantIds.length > 0 ? participantIds : [],
    }

    if (isEditing && task) { update(task.id, data); toast.success('Tarefa atualizada') }
    else                   { add(data);              toast.success('Tarefa criada')     }
    onClose()
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const filteredContacts = contactSearch.trim()
    ? contacts.filter(c => c.name.toLowerCase().includes(contactSearch.toLowerCase()))
    : contacts.slice(0, 6)

  const filteredProperties = propertySearch.trim()
    ? properties.filter(p => p.name.toLowerCase().includes(propertySearch.toLowerCase()))
    : properties.slice(0, 6)

  const calendarUrl = useMemo(() => {
    if (!title.trim() || !dueDate) return null
    const contact  = contacts.find(c => c.id === contactId)
    const property = properties.find(p => p.id === propertyId)
    const parts: string[] = []
    if (description.trim()) parts.push(description.trim())
    if (contact)  parts.push(`Lead: ${contact.name}`)
    if (property) parts.push(`Imóvel: ${property.name}`)
    return buildGoogleCalendarUrl({ title: title.trim(), description: parts.join('\n') || undefined, date: dueDate, time: dueTime || undefined })
  }, [title, dueDate, dueTime, description, contactId, propertyId, contacts, properties])

  // Quick-date options
  const DATE_SHORTCUTS = [
    { label: 'Hoje',          value: todayStr()    },
    { label: 'Amanhã',        value: tomorrowStr() },
    { label: 'Próx. semana',  value: nextWeekStr() },
  ]

  // ── Step content ──────────────────────────────────────────────────────────
  const steps = [
    // ── Step 0: O que? ────────────────────────────────────────────────────
    <div key="step0" className="flex flex-col gap-5">
      {/* Título */}
      <div className="flex flex-col gap-2">
        <div className={`relative rounded-xl border-2 transition-all duration-150
          ${titleError ? 'border-red-500/60' : title ? 'border-indigo-500/50' : 'border-line hover:border-line-strong'}`}
        >
          <input
            ref={titleRef}
            value={title}
            onChange={e => { setTitle(e.target.value); if (e.target.value.trim()) setTitleError('') }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleNext() } }}
            placeholder="O que precisa ser feito?"
            className="w-full bg-transparent px-4 py-4 text-lg font-medium text-slate-100 placeholder:text-t4 focus:outline-none"
          />
        </div>
        {titleError && <p className="text-xs text-red-400 px-1">{titleError}</p>}
      </div>

      {/* Categoria — pills */}
      <div className="flex flex-col gap-2.5">
        <p className="text-xs font-semibold text-t3 uppercase tracking-wider">Categoria</p>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setCategory(category === opt.value ? '' : opt.value)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer border
                ${category === opt.value
                  ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-200'
                  : 'bg-s3/40 border-line text-t3 hover:border-line-strong hover:text-t1'
                }`}
            >
              <span>{opt.icon}</span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Descrição — expansível */}
      {!showDesc ? (
        <button
          type="button"
          onClick={() => { setShowDesc(true); setTimeout(() => document.getElementById('task-desc')?.focus(), 50) }}
          className="flex items-center gap-2 text-xs text-t4 hover:text-t3 transition-colors cursor-pointer self-start"
        >
          <FileText size={13} />
          <span>Adicionar descrição</span>
        </button>
      ) : (
        <div className="relative">
          <textarea
            id="task-desc"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Detalhes adicionais..."
            rows={2}
            className="w-full bg-s3/40 border border-line hover:border-line-strong rounded-xl px-4 py-3 text-sm text-t2 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/40 transition-all resize-none"
          />
          {!description && (
            <button
              type="button"
              onClick={() => setShowDesc(false)}
              className="absolute top-2 right-2 text-t5 hover:text-t3 transition-colors cursor-pointer"
            >
              <X size={12} />
            </button>
          )}
        </div>
      )}
    </div>,

    // ── Step 1: Quando? ───────────────────────────────────────────────────
    <div key="step1" className="flex flex-col gap-5">
      {/* Data — shortcuts */}
      <div className="flex flex-col gap-2.5">
        <p className="text-xs font-semibold text-t3 uppercase tracking-wider flex items-center gap-1.5">
          <Calendar size={12} /> Data
        </p>
        <div className="flex gap-2 flex-wrap">
          {DATE_SHORTCUTS.map(s => (
            <button
              key={s.value}
              type="button"
              onClick={() => { setDueDate(s.value); setShowCustomDate(false) }}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-all cursor-pointer
                ${dueDate === s.value && !showCustomDate
                  ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-200'
                  : 'bg-s3/40 border-line text-t3 hover:border-line-strong hover:text-t1'
                }`}
            >
              {s.label}
              {dueDate === s.value && !showCustomDate && (
                <span className="ml-2 text-[11px] text-indigo-400/70">{fmtDate(dueDate)}</span>
              )}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowCustomDate(v => !v)}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-all cursor-pointer flex items-center gap-1.5
              ${showCustomDate
                ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-200'
                : 'bg-s3/40 border-line text-t3 hover:border-line-strong hover:text-t1'
              }`}
          >
            <Calendar size={13} />
            {showCustomDate ? fmtDate(dueDate) : 'Outra data'}
          </button>
        </div>
        {showCustomDate && (
          <input
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            autoFocus
            className={`${inputBase} mt-1`}
          />
        )}
      </div>

      {/* Horário */}
      <div className="flex flex-col gap-2.5">
        <p className="text-xs font-semibold text-t3 uppercase tracking-wider flex items-center gap-1.5">
          <Clock size={12} /> Horário <span className="text-t5 normal-case font-normal tracking-normal">(opcional)</span>
        </p>
        <input
          type="time"
          value={dueTime}
          onChange={e => setDueTime(e.target.value)}
          className={inputBase}
        />
      </div>

      {/* Prioridade — cards */}
      <div className="flex flex-col gap-2.5">
        <p className="text-xs font-semibold text-t3 uppercase tracking-wider flex items-center gap-1.5">
          <Flag size={12} /> Prioridade
        </p>
        <div className="grid grid-cols-3 gap-2">
          {PRIORITY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPriority(opt.value)}
              className={`flex flex-col items-center gap-2 px-3 py-3 rounded-xl border-2 transition-all cursor-pointer
                ${priority === opt.value
                  ? `${opt.bg} ${opt.border} ${opt.color}`
                  : 'bg-s3/30 border-line text-t3 hover:border-line-strong hover:text-t2'
                }`}
            >
              <div className={`w-2.5 h-2.5 rounded-full transition-colors ${priority === opt.value ? opt.dot : 'bg-slate-700'}`} />
              <span className="text-sm font-semibold">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Google Agenda */}
      <a
        href={calendarUrl ?? '#'}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => { if (!calendarUrl) { e.preventDefault(); toast.error('Preencha o título para adicionar ao Google Agenda') } }}
        className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border transition-all group no-underline
          ${calendarUrl
            ? 'border-line hover:border-brand/40 hover:bg-indigo-500/5 cursor-pointer'
            : 'border-line opacity-30 cursor-not-allowed'
          }`}
      >
        <div className="w-7 h-7 rounded-lg bg-s3/50 flex items-center justify-center flex-shrink-0">
          <Calendar size={14} className="text-brand" />
        </div>
        <div className="flex-1 text-left">
          <p className="text-xs font-medium text-t2 group-hover:text-brand-text transition-colors">
            Adicionar ao Google Agenda
          </p>
          <p className="text-xs text-t4">
            {dueDate ? `${fmtDate(dueDate)}${dueTime ? ` às ${dueTime}` : ''}` : '—'}
          </p>
        </div>
        <ExternalLink size={13} className="text-t4 group-hover:text-brand transition-colors" />
      </a>
    </div>,

    // ── Step 2: Detalhes ──────────────────────────────────────────────────
    <div key="step2" className="flex flex-col gap-5">
      {/* Vincular lead */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold text-t3 uppercase tracking-wider flex items-center gap-1.5">
          <User size={12} /> Lead vinculado <span className="font-normal normal-case tracking-normal text-t5">(opcional)</span>
        </label>
        <div className="relative">
          <input
            value={contactSearch}
            onChange={e => { setContactSearch(e.target.value); setContactId(''); setShowContactDrop(true) }}
            onFocus={() => setShowContactDrop(true)}
            onBlur={() => setTimeout(() => setShowContactDrop(false), 150)}
            placeholder="Buscar contato..."
            className={inputBase}
          />
          {contactId && (
            <button type="button" onClick={() => { setContactId(''); setContactSearch('') }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-t4 hover:text-red-400 transition-colors cursor-pointer">
              <X size={14} />
            </button>
          )}
          {showContactDrop && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-page border border-line rounded-xl shadow-xl z-10 overflow-hidden">
              {filteredContacts.map(c => (
                <button key={c.id} type="button"
                  onMouseDown={() => { setContactId(c.id); setContactSearch(c.name); setShowContactDrop(false) }}
                  className="w-full text-left px-4 py-2.5 text-sm text-t2 hover:bg-s3/50 transition-colors cursor-pointer flex items-center gap-2"
                >
                  <div className="w-6 h-6 bg-brand-tint rounded-full flex items-center justify-center text-[10px] font-bold text-brand-text flex-shrink-0">
                    {c.name[0].toUpperCase()}
                  </div>
                  <span>{c.name}</span>
                  {c.company && <span className="text-t4 text-xs ml-auto">{c.company}</span>}
                </button>
              ))}
              <button type="button"
                onMouseDown={() => { setShowContactDrop(false); setNewContactOpen(true) }}
                className="w-full text-left px-4 py-2.5 text-xs text-brand hover:bg-indigo-500/10 border-t border-line flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Plus size={12} /> Criar novo contato
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Vincular imóvel */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold text-t3 uppercase tracking-wider flex items-center gap-1.5">
          <Building2 size={12} /> Imóvel vinculado <span className="font-normal normal-case tracking-normal text-t5">(opcional)</span>
        </label>
        <div className="relative">
          <input
            value={propertySearch}
            onChange={e => { setPropertySearch(e.target.value); setPropertyId(''); setShowPropertyDrop(true) }}
            onFocus={() => setShowPropertyDrop(true)}
            onBlur={() => setTimeout(() => setShowPropertyDrop(false), 150)}
            placeholder="Buscar imóvel..."
            className={inputBase}
          />
          {propertyId && (
            <button type="button" onClick={() => { setPropertyId(''); setPropertySearch('') }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-t4 hover:text-red-400 transition-colors cursor-pointer">
              <X size={14} />
            </button>
          )}
          {showPropertyDrop && filteredProperties.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-page border border-line rounded-xl shadow-xl z-10 overflow-hidden">
              {filteredProperties.map(p => (
                <button key={p.id} type="button"
                  onMouseDown={() => { setPropertyId(p.id); setPropertySearch(p.name); setShowPropertyDrop(false) }}
                  className="w-full text-left px-4 py-2.5 text-sm text-t2 hover:bg-s3/50 transition-colors cursor-pointer"
                >
                  {p.name}
                  {p.neighborhood && <span className="text-t4 ml-2 text-xs">{p.neighborhood}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delegação */}
      {assignableProfiles.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <label className="text-xs font-semibold text-t3 uppercase tracking-wider flex items-center gap-1.5">
            <UserCheck size={12} className={assignedToId ? 'text-violet-400' : ''} />
            {isAdmin ? 'Atribuir para corretor' : 'Delegar para admin'}
            <span className="font-normal normal-case tracking-normal text-t5">(opcional)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setAssignedToId('')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer
                ${!assignedToId
                  ? 'bg-s3/70 border-line-strong text-t1'
                  : 'border-line text-t3 hover:text-t2 hover:border-line-strong'
                }`}
            >
              {isAdmin ? 'Minha tarefa' : 'Não delegar'}
            </button>
            {assignableProfiles.map(p => (
              <button key={p.id} type="button" onClick={() => setAssignedToId(assignedToId === p.id ? '' : p.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer
                  ${assignedToId === p.id
                    ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                    : 'border-line text-t3 hover:text-t1 hover:border-line-strong'
                  }`}
              >
                <div className="w-4 h-4 rounded-full bg-violet-500/30 flex items-center justify-center text-[9px] font-bold text-violet-300 flex-shrink-0">
                  {p.name[0].toUpperCase()}
                </div>
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Compartilhar com */}
      {shareableProfiles.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <label className="text-xs font-semibold text-t3 uppercase tracking-wider flex items-center gap-1.5">
            <Users size={12} className={participantIds.length > 0 ? 'text-cyan-400' : ''} />
            Compartilhar com
            <span className="font-normal normal-case tracking-normal text-t5">(opcional · todos podem ver e editar)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {shareableProfiles.map(p => {
              const active = participantIds.includes(p.id)
              return (
                <button key={p.id} type="button" onClick={() => toggleParticipant(p.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer
                    ${active
                      ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                      : 'border-line text-t3 hover:text-t1 hover:border-line-strong'
                    }`}
                >
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0
                    ${active ? 'bg-cyan-500/30 text-cyan-300' : 'bg-s3/50 text-t3'}`}>
                    {p.name[0].toUpperCase()}
                  </div>
                  {p.name}
                </button>
              )
            })}
          </div>
          {participantIds.length > 0 && (
            <p className="text-[10px] text-cyan-400/70 flex items-center gap-1">
              <Users size={9} />
              {participantIds.length} participante{participantIds.length !== 1 ? 's' : ''} · todos recebem as atualizações em tempo real
            </p>
          )}
        </div>
      )}

      {/* Checklist */}
      <div>
        <button type="button"
          onClick={() => { setShowChecklist(v => !v); if (!showChecklist) setTimeout(() => newItemRef.current?.focus(), 50) }}
          className={`flex items-center gap-2 text-xs font-medium transition-colors cursor-pointer mb-3
            ${showChecklist ? 'text-brand' : 'text-t3 hover:text-t2'}`}
        >
          <ListChecks size={14} />
          {showChecklist ? 'Checklist' : 'Adicionar checklist'}
          {!showChecklist && checklist.length > 0 && (
            <span className="text-brand bg-brand-tint px-1.5 py-0.5 rounded-md text-[10px] font-bold">
              {checklist.filter(i => i.done).length}/{checklist.length}
            </span>
          )}
        </button>

        {showChecklist && (
          <div className="flex flex-col gap-2 pl-1 border-l-2 border-brand/25 ml-1">
            {checklist.length > 0 && (() => {
              const done = checklist.filter(i => i.done).length
              const pct  = Math.round((done / checklist.length) * 100)
              return (
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex-1 h-1.5 bg-s3/50 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-300 ${pct === 100 ? 'bg-green-500' : 'bg-indigo-500'}`}
                      style={{ width: `${pct}%` }} />
                  </div>
                  <span className={`text-[11px] font-bold tabular-nums flex-shrink-0 ${pct === 100 ? 'text-green-400' : 'text-t3'}`}>
                    {done}/{checklist.length}
                  </span>
                </div>
              )
            })()}

            {checklist.map(item => (
              <div key={item.id} className="flex items-center gap-2 group">
                <button type="button"
                  onClick={() => setChecklist(cl => cl.map(i => i.id === item.id ? { ...i, done: !i.done } : i))}
                  className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all cursor-pointer
                    ${item.done ? 'bg-green-500 border-green-500' : 'border-white/25 hover:border-indigo-400'}`}
                >
                  {item.done && <CheckCircle2 size={10} className="text-white" />}
                </button>
                <span className={`flex-1 text-sm transition-colors ${item.done ? 'line-through text-t4' : 'text-t2'}`}>
                  {item.text}
                </span>
                <button type="button"
                  onClick={() => setChecklist(cl => cl.filter(i => i.id !== item.id))}
                  className="opacity-0 group-hover:opacity-100 p-1 text-t5 hover:text-red-400 transition-all cursor-pointer"
                >
                  <X size={11} />
                </button>
              </div>
            ))}

            <div className="flex items-center gap-2 mt-1">
              <div className="w-4 h-4 rounded border border-line-input flex-shrink-0" />
              <input
                ref={newItemRef}
                value={newItemText}
                onChange={e => setNewItemText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    const text = newItemText.trim()
                    if (!text) return
                    setChecklist(cl => [...cl, { id: generateId(), text, done: false }])
                    setNewItemText('')
                  }
                }}
                placeholder="Adicionar item..."
                className="flex-1 bg-transparent text-sm text-t2 placeholder:text-t5 focus:outline-none focus:placeholder:text-t4 transition-colors"
              />
              <button type="button"
                onClick={() => {
                  const text = newItemText.trim()
                  if (!text) return
                  setChecklist(cl => [...cl, { id: generateId(), text, done: false }])
                  setNewItemText('')
                  newItemRef.current?.focus()
                }}
                className="text-indigo-500 hover:text-brand transition-colors cursor-pointer p-1 rounded-lg hover:bg-indigo-500/10"
              >
                <Plus size={13} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Marcar como concluída */}
      <div className={`flex flex-col gap-3 px-4 py-3 rounded-xl border transition-all
        ${markDone ? 'bg-green-500/8 border-green-500/25' : 'bg-s2/50 border-line'}`}>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setMarkDone(v => !v)}
            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all cursor-pointer flex-shrink-0
              ${markDone ? 'bg-green-500 border-green-500' : 'border-line-strong hover:border-green-500/50'}`}
          >
            {markDone && <CheckCircle2 size={12} className="text-white" />}
          </button>
          <span className={`text-sm font-medium transition-colors ${markDone ? 'text-green-300' : 'text-t3'}`}>
            Marcar como concluída
          </span>
        </div>
        {markDone && (
          <div className="flex items-center gap-3 pl-8">
            <label className="text-xs text-t3 whitespace-nowrap">Data de conclusão</label>
            <input
              type="date"
              value={completedDate}
              max={today}
              onChange={e => setCompletedDate(e.target.value)}
              className={`${inputBase} flex-1`}
            />
          </div>
        )}
      </div>
    </div>,
  ]

  // ── Render ────────────────────────────────────────────────────────────────
  const stepTitles = isEditing
    ? ['Editar tarefa', 'Editar tarefa', 'Editar tarefa']
    : ['Nova tarefa', 'Nova tarefa', 'Nova tarefa']

  // ── Footer fixo — fora do scroll, sempre visível no mobile ─────────────────
  const footer = (
    <div className="flex items-center gap-2 w-full">
      {/* Voltar / Cancelar */}
      {step > 0 ? (
        <button type="button" onClick={handleBack}
          className="flex items-center justify-center gap-1 px-3 min-h-[48px] rounded-xl text-sm text-t3 hover:text-t2 border border-line hover:border-line-strong transition-all cursor-pointer"
        >
          <ChevronLeft size={15} />
          <span className="hidden sm:inline">Voltar</span>
        </button>
      ) : (
        <button type="button" onClick={onClose}
          className="flex items-center justify-center gap-1 px-3 min-h-[48px] rounded-xl text-sm text-t3 hover:text-t2 border border-line hover:border-line-strong transition-all cursor-pointer"
        >
          <span>Cancelar</span>
        </button>
      )}

      <div className="flex-1" />

      {/* Criar rápido — só no step 1 */}
      {step === 1 && (
        <button type="button" onClick={handleSubmit}
          className="flex items-center gap-1.5 px-3 min-h-[48px] rounded-xl text-sm text-t3 hover:text-t1 border border-line hover:border-line-strong transition-all cursor-pointer"
        >
          <Zap size={14} />
          <span className="hidden sm:inline">Criar rápido</span>
        </button>
      )}

      {/* Próximo / Salvar */}
      {step < 2 ? (
        <button type="button" onClick={handleNext}
          className="flex items-center gap-1.5 px-5 min-h-[48px] rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all cursor-pointer shadow-lg shadow-indigo-500/20"
        >
          Próximo <ChevronRight size={15} />
        </button>
      ) : (
        <button type="button" onClick={handleSubmit}
          className="flex items-center gap-1.5 px-5 min-h-[48px] rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all cursor-pointer shadow-lg shadow-indigo-500/20"
        >
          {isEditing ? 'Salvar' : 'Criar tarefa'} ✓
        </button>
      )}
    </div>
  )

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={stepTitles[step]} size="md" footer={footer}>
        <div className="flex flex-col gap-5">

          {/* Step indicator */}
          <div className="flex items-center gap-1">
            {STEP_LABELS.map((label, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  if (i === 0 || (i === 1 && title.trim()) || (i === 2 && title.trim())) {
                    if (i < step) goTo(i)
                    else if (i === 1 && step === 0) handleNext()
                    else if (i === 2 && step < 2 && title.trim()) goTo(i)
                  }
                }}
                className="flex items-center gap-1.5 group cursor-pointer"
              >
                <div className={`flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-bold transition-all
                  ${i < step  ? 'bg-indigo-500 text-white'
                  : i === step ? 'bg-indigo-500 text-white ring-2 ring-indigo-500/30 ring-offset-1 ring-offset-surface'
                  : 'bg-s3/50 text-t4'}`}
                >
                  {i < step ? '✓' : i + 1}
                </div>
                <span className={`text-xs font-medium transition-colors hidden sm:block
                  ${i === step ? 'text-t1' : i < step ? 'text-indigo-400' : 'text-t4'}`}>
                  {label}
                </span>
                {i < STEP_LABELS.length - 1 && (
                  <div className={`w-6 h-px mx-1 transition-colors ${i < step ? 'bg-indigo-500/50' : 'bg-line'}`} />
                )}
              </button>
            ))}
          </div>

          {/* Animated step content */}
          <div className="overflow-hidden">
            <div
              className="transition-all duration-180"
              style={{
                opacity: animating ? 0 : 1,
                transform: animating ? `translateX(${direction * 20}px)` : 'translateX(0)',
              }}
            >
              {steps[step]}
            </div>
          </div>
        </div>
      </Modal>

      <ContactForm
        isOpen={newContactOpen}
        onClose={() => setNewContactOpen(false)}
        onCreated={c => { setContactId(c.id); setContactSearch(c.name) }}
      />
    </>
  )
}
