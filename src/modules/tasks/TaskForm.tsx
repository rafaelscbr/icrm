import { useState, useEffect, FormEvent, useMemo, useRef } from 'react'
import { Calendar, User, Building2, Plus, ExternalLink, ChevronDown, ChevronUp, CheckCircle2, ListChecks, X, UserCheck } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { Select } from '../../components/ui/Select'
import { Button } from '../../components/ui/Button'
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

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'low',    label: 'Baixa' },
  { value: 'medium', label: 'Média' },
  { value: 'high',   label: 'Alta'  },
]

const CATEGORY_OPTIONS: { value: TaskCategory; label: string }[] = [
  { value: 'visita',             label: 'Visita'                 },
  { value: 'agenciamento',       label: 'Agenciamento'           },
  { value: 'proposta',           label: 'Proposta'               },
  { value: 'busca_imovel',       label: 'Busca de Imóvel'        },
  { value: 'prospeccao_imoveis', label: 'Prospecção de Imóveis'  },
  { value: 'campanhas',          label: 'Campanhas'              },
  { value: 'administrativo',     label: 'Administrativo'         },
  { value: 'outro',              label: 'Outro'                  },
]

// Classes base para inputs inline (busca de contato/imóvel)
const inputBase =
  'w-full bg-s3/50 border border-line hover:border-line-strong rounded-xl px-3 py-3 min-h-[44px] text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all duration-150'

function todayStr() { return localDateStr() }

export function TaskForm({ isOpen, onClose, task, defaultContactId }: TaskFormProps) {
  const { add, update }                              = useTasksStore()
  const { contacts }                                 = useContactsStore()
  const { properties }                               = usePropertiesStore()
  const { isAdmin, profile, allProfiles, fetchAllProfiles } = useAuthStore()
  const isEditing = Boolean(task)

  const today = todayStr()

  // Data padrão: hoje (para nova tarefa), data da tarefa (para edição)
  const [title,       setTitle]       = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [dueDate,     setDueDate]     = useState(task?.dueDate ?? today)
  const [dueTime,     setDueTime]     = useState(task?.dueTime ?? '')
  const [priority,    setPriority]    = useState<TaskPriority>(task?.priority ?? 'medium')
  const [category,    setCategory]    = useState<TaskCategory | ''>(task?.category ?? '')
  const [contactId,   setContactId]   = useState(task?.contactId ?? defaultContactId ?? '')
  const [propertyId,  setPropertyId]  = useState(task?.propertyId ?? '')

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
  const [assignedToId,  setAssignedToId]  = useState(task?.assignedToId ?? '')
  const [showOptional,  setShowOptional]  = useState(Boolean(task?.contactId || task?.propertyId))
  const [markDone,      setMarkDone]      = useState(task?.status === 'done')
  const [completedDate, setCompletedDate] = useState(
    task?.completedAt ? task.completedAt.split('T')[0] : today
  )
  const [newContactOpen, setNewContactOpen] = useState(false)
  const [errors,         setErrors]         = useState<Record<string, string>>({})

  // Checklist
  const [checklist,      setChecklist]      = useState<ChecklistItem[]>(task?.checklist ?? [])
  const [showChecklist,  setShowChecklist]  = useState(Boolean(task?.checklist?.length))
  const [newItemText,    setNewItemText]    = useState('')
  const newItemRef = useRef<HTMLInputElement>(null)

  // Perfis disponíveis para delegação
  // Admin → vê corretores ativos (exceto si mesmo)
  // Corretor → vê admins ativos
  const assignableProfiles = useMemo(() => {
    if (isAdmin) return allProfiles.filter(p => p.role === 'broker' && p.active && p.id !== profile?.id)
    return allProfiles.filter(p => p.role === 'admin' && p.active)
  }, [isAdmin, allProfiles, profile?.id])

  useEffect(() => {
    if (!isOpen) return
    setTitle(task?.title ?? '')
    setDescription(task?.description ?? '')
    // Nova tarefa → padrão hoje; edição → data existente
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
    setShowOptional(Boolean(resolvedContactId || task?.propertyId))
    setMarkDone(task?.status === 'done')
    setCompletedDate(task?.completedAt ? task.completedAt.split('T')[0] : todayStr())
    setChecklist(task?.checklist ?? [])
    setShowChecklist(Boolean(task?.checklist?.length))
    setNewItemText('')
    setErrors({})
    // Carrega perfis para seleção de delegação (se ainda não carregados)
    if (allProfiles.length === 0) fetchAllProfiles()
  }, [task, isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredContacts = contactSearch.trim()
    ? contacts.filter(c => c.name.toLowerCase().includes(contactSearch.toLowerCase()))
    : contacts.slice(0, 6)

  const filteredProperties = propertySearch.trim()
    ? properties.filter(p => p.name.toLowerCase().includes(propertySearch.toLowerCase()))
    : properties.slice(0, 6)

  // URL do Google Agenda — gerada sempre que título ou data mudam
  // Usa <a href> em vez de window.open() para funcionar no Safari PWA
  const calendarUrl = useMemo(() => {
    if (!title.trim() || !dueDate) return null
    const contact  = contacts.find(c => c.id === contactId)
    const property = properties.find(p => p.id === propertyId)
    const parts: string[] = []
    if (description.trim()) parts.push(description.trim())
    if (contact)  parts.push(`Lead: ${contact.name}`)
    if (property) parts.push(`Imóvel: ${property.name}`)
    return buildGoogleCalendarUrl({
      title:       title.trim(),
      description: parts.join('\n') || undefined,
      date:        dueDate,
      time:        dueTime || undefined,
    })
  }, [title, dueDate, dueTime, description, contactId, propertyId, contacts, properties])

  function validate() {
    const errs: Record<string, string> = {}
    if (!title.trim()) errs.title = 'Título é obrigatório'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!validate()) return

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
      assignedToId: assignedToId || undefined,
    }

    if (isEditing && task) {
      update(task.id, data)
      toast.success('Tarefa atualizada')
    } else {
      add(data)
      toast.success('Tarefa criada')
    }
    onClose()
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? 'Editar Tarefa' : 'Nova Tarefa'} size="md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">

          {/* Título */}
          <Input
            label="Título"
            required
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            error={errors.title}
            placeholder="Ex: Ligar para cliente, Enviar proposta..."
          />

          {/* Descrição */}
          <Textarea
            label="Descrição"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Detalhes da tarefa..."
            rows={2}
          />

          {/* Data + Horário + Prioridade */}
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Data"
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
            />
            <Input
              label="Horário"
              type="time"
              value={dueTime}
              onChange={e => setDueTime(e.target.value)}
            />
            <Select
              label="Prioridade"
              value={priority}
              onChange={e => setPriority(e.target.value as TaskPriority)}
            >
              {PRIORITY_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </div>

          {/* Categoria */}
          <Select
            label="Categoria"
            value={category}
            onChange={e => setCategory(e.target.value as TaskCategory | '')}
          >
            <option value="">Nenhuma</option>
            {CATEGORY_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>

          {/* Google Agenda — sempre visível quando há título; usa <a> para funcionar no Safari */}
          <a
            href={calendarUrl ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => { if (!calendarUrl) { e.preventDefault(); toast.error('Preencha o título para adicionar ao Google Agenda') } }}
            className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border transition-all group no-underline
              ${calendarUrl
                ? 'border-line hover:border-brand/40 hover:bg-indigo-500/5 cursor-pointer'
                : 'border-line opacity-40 cursor-not-allowed'
              }`}
          >
            <div className="w-7 h-7 rounded-lg bg-s3/50 flex items-center justify-center flex-shrink-0">
              <Calendar size={14} className="text-brand" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-xs font-medium text-slate-300 group-hover:text-brand-text transition-colors">
                Adicionar ao Google Agenda
              </p>
              <p className="text-xs text-slate-600">
                {dueDate
                  ? `${dueDate.split('-').reverse().join('/')}${dueTime ? ` às ${dueTime}` : ''}`
                  : 'Preencha o título primeiro'}
              </p>
            </div>
            <ExternalLink size={13} className="text-slate-600 group-hover:text-brand transition-colors" />
          </a>

          {/* Marcar como concluída */}
          <div className={`flex flex-col gap-3 px-4 py-3 rounded-xl border transition-all
            ${markDone ? 'bg-green-500/8 border-green-500/25' : 'bg-s2/50 border-line'}`}>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMarkDone(v => !v)}
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all cursor-pointer flex-shrink-0
                  ${markDone ? 'bg-green-500 border-green-500' : 'border-line-strong hover:border-green-500/50'}`}
              >
                {markDone && <CheckCircle2 size={12} className="text-white" />}
              </button>
              <span className={`text-sm font-medium transition-colors ${markDone ? 'text-green-300' : 'text-slate-400'}`}>
                Marcar como concluída
              </span>
            </div>
            {markDone && (
              <div className="flex items-center gap-3 pl-8">
                <label className="text-xs text-slate-500 whitespace-nowrap">Data de conclusão</label>
                <Input
                  type="date"
                  value={completedDate}
                  max={today}
                  onChange={e => setCompletedDate(e.target.value)}
                  className="flex-1"
                />
              </div>
            )}
          </div>

          {/* Checklist */}
          <div>
            <button
              type="button"
              onClick={() => {
                setShowChecklist(v => !v)
                if (!showChecklist) setTimeout(() => newItemRef.current?.focus(), 50)
              }}
              className={`flex items-center gap-2 text-xs font-medium transition-colors cursor-pointer mb-3
                ${showChecklist ? 'text-brand' : 'text-slate-500 hover:text-slate-300'}`}
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
                {/* Progress bar */}
                {checklist.length > 0 && (() => {
                  const done = checklist.filter(i => i.done).length
                  const pct  = Math.round((done / checklist.length) * 100)
                  return (
                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex-1 h-1.5 bg-s3/50 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${pct === 100 ? 'bg-green-500' : 'bg-indigo-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className={`text-[11px] font-bold tabular-nums flex-shrink-0 ${pct === 100 ? 'text-green-400' : 'text-slate-500'}`}>
                        {done}/{checklist.length}
                      </span>
                    </div>
                  )
                })()}

                {/* Items */}
                {checklist.map(item => (
                  <div key={item.id} className="flex items-center gap-2 group">
                    <button
                      type="button"
                      onClick={() => setChecklist(cl => cl.map(i => i.id === item.id ? { ...i, done: !i.done } : i))}
                      className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all cursor-pointer
                        ${item.done
                          ? 'bg-green-500 border-green-500'
                          : 'border-white/25 hover:border-indigo-400'}`}
                    >
                      {item.done && <CheckCircle2 size={10} className="text-white" />}
                    </button>
                    <span className={`flex-1 text-sm transition-colors ${item.done ? 'line-through text-slate-600' : 'text-slate-300'}`}>
                      {item.text}
                    </span>
                    <button
                      type="button"
                      onClick={() => setChecklist(cl => cl.filter(i => i.id !== item.id))}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-700 hover:text-red-400 transition-all cursor-pointer"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}

                {/* New item input */}
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
                    className="flex-1 bg-transparent text-sm text-slate-300 placeholder:text-slate-700 focus:outline-none focus:placeholder:text-slate-600 transition-colors"
                  />
                  <button
                    type="button"
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

          {/* Vincular lead ou imóvel */}
          <div>
            <button
              type="button"
              onClick={() => setShowOptional(v => !v)}
              className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-pointer mb-3"
            >
              {showOptional ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              Vincular lead ou imóvel (opcional)
            </button>

            {showOptional && (
              <div className="flex flex-col gap-4 pl-1 border-l-2 border-line ml-1">

                {/* Busca de contato */}
                <div className="flex flex-col gap-1.5 relative">
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <User size={11} /> Lead vinculado
                  </label>
                  <input
                    value={contactSearch}
                    onChange={e => { setContactSearch(e.target.value); setContactId(''); setShowContactDrop(true) }}
                    onFocus={() => setShowContactDrop(true)}
                    onBlur={() => setTimeout(() => setShowContactDrop(false), 150)}
                    placeholder="Buscar contato..."
                    className={inputBase}
                  />
                  {contactId && (
                    <button
                      type="button"
                      onClick={() => { setContactId(''); setContactSearch('') }}
                      className="absolute right-3 top-10 text-slate-600 hover:text-red-400 transition-colors cursor-pointer text-xs"
                    >
                      ✕
                    </button>
                  )}
                  {showContactDrop && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-page border border-line rounded-xl shadow-xl z-10 overflow-hidden">
                      {filteredContacts.map(c => (
                        <button key={c.id} type="button"
                          onMouseDown={() => { setContactId(c.id); setContactSearch(c.name); setShowContactDrop(false) }}
                          className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-s3/50 transition-colors cursor-pointer flex items-center gap-2"
                        >
                          <div className="w-5 h-5 bg-brand-tint rounded-full flex items-center justify-center text-[10px] font-bold text-brand-text flex-shrink-0">
                            {c.name[0].toUpperCase()}
                          </div>
                          <span>{c.name}</span>
                          {c.company && <span className="text-slate-600 text-xs ml-auto">{c.company}</span>}
                        </button>
                      ))}
                      <button
                        type="button"
                        onMouseDown={() => { setShowContactDrop(false); setNewContactOpen(true) }}
                        className="w-full text-left px-4 py-2.5 text-xs text-brand hover:bg-indigo-500/10 border-t border-line flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <Plus size={12} /> Criar novo contato
                      </button>
                    </div>
                  )}
                </div>

                {/* Busca de imóvel */}
                <div className="flex flex-col gap-1.5 relative">
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Building2 size={11} /> Imóvel vinculado
                  </label>
                  <input
                    value={propertySearch}
                    onChange={e => { setPropertySearch(e.target.value); setPropertyId(''); setShowPropertyDrop(true) }}
                    onFocus={() => setShowPropertyDrop(true)}
                    onBlur={() => setTimeout(() => setShowPropertyDrop(false), 150)}
                    placeholder="Buscar imóvel..."
                    className={inputBase}
                  />
                  {propertyId && (
                    <button
                      type="button"
                      onClick={() => { setPropertyId(''); setPropertySearch('') }}
                      className="absolute right-3 top-10 text-slate-600 hover:text-red-400 transition-colors cursor-pointer text-xs"
                    >
                      ✕
                    </button>
                  )}
                  {showPropertyDrop && filteredProperties.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-page border border-line rounded-xl shadow-xl z-10 overflow-hidden">
                      {filteredProperties.map(p => (
                        <button key={p.id} type="button"
                          onMouseDown={() => { setPropertyId(p.id); setPropertySearch(p.name); setShowPropertyDrop(false) }}
                          className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-s3/50 transition-colors cursor-pointer"
                        >
                          {p.name}
                          <span className="text-slate-600 ml-2 text-xs">{p.neighborhood}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>

          {/* ── Delegação ────────────────────────────────────────────────── */}
          {assignableProfiles.length > 0 && (
            <div className={`flex flex-col gap-2 px-4 py-3 rounded-xl border transition-all
              ${assignedToId ? 'bg-violet-500/8 border-violet-500/30' : 'bg-s2/50 border-line'}`}>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <UserCheck size={12} className={assignedToId ? 'text-violet-400' : 'text-slate-500'} />
                {isAdmin ? 'Atribuir para corretor' : 'Delegar para admin'}
              </label>
              <div className="flex flex-wrap gap-2">
                {/* Opção: nenhum (eu mesmo) */}
                <button
                  type="button"
                  onClick={() => setAssignedToId('')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border
                    ${!assignedToId
                      ? 'bg-s3/70 border-line-strong text-slate-200'
                      : 'border-line text-slate-500 hover:text-slate-300 hover:border-line-strong'
                    }`}
                >
                  {isAdmin ? 'Nenhum (minha tarefa)' : 'Não delegar'}
                </button>
                {assignableProfiles.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setAssignedToId(assignedToId === p.id ? '' : p.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border
                      ${assignedToId === p.id
                        ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                        : 'border-line text-slate-400 hover:text-slate-200 hover:border-line-strong'
                      }`}
                  >
                    <div className="w-4 h-4 rounded-full bg-violet-500/30 flex items-center justify-center text-[9px] font-bold text-violet-300 flex-shrink-0">
                      {p.name[0].toUpperCase()}
                    </div>
                    {p.name}
                    {p.role === 'admin' && <span className="text-[9px] text-violet-400/70">admin</span>}
                  </button>
                ))}
              </div>
              {assignedToId && (
                <p className="text-[11px] text-violet-400/70 mt-0.5">
                  {isAdmin
                    ? `Esta tarefa aparecerá na lista de ${assignableProfiles.find(p => p.id === assignedToId)?.name ?? ''}`
                    : 'O admin será notificado sobre esta tarefa delegada'
                  }
                </p>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button type="submit" className="flex-1">{isEditing ? 'Salvar alterações' : 'Criar tarefa'}</Button>
          </div>
        </form>
      </Modal>

      {/* Formulário de novo contato */}
      <ContactForm
        isOpen={newContactOpen}
        onClose={() => setNewContactOpen(false)}
        onCreated={c => { setContactId(c.id); setContactSearch(c.name) }}
      />
    </>
  )
}
