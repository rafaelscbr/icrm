import { useState, useEffect, FormEvent, useMemo, useRef } from 'react'
import { Calendar, User, Building2, Plus, ExternalLink, ChevronDown, ChevronUp, CheckCircle2, ListChecks, X } from 'lucide-react'
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
import { buildGoogleCalendarUrl } from '../../lib/googleCalendar'
import { localDateStr } from '../../lib/formatters'
import { ContactForm } from '../contacts/ContactForm'
import toast from 'react-hot-toast'

interface TaskFormProps {
  isOpen: boolean
  onClose: () => void
  task?: Task
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
  'w-full bg-white/5 border border-white/10 hover:border-white/20 rounded-xl px-3 py-3 min-h-[44px] text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all duration-150'

function todayStr() { return localDateStr() }

export function TaskForm({ isOpen, onClose, task }: TaskFormProps) {
  const { add, update } = useTasksStore()
  const { contacts }    = useContactsStore()
  const { properties }  = usePropertiesStore()
  const isEditing = Boolean(task)

  const today = todayStr()

  // Data padrão: hoje (para nova tarefa), data da tarefa (para edição)
  const [title,       setTitle]       = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [dueDate,     setDueDate]     = useState(task?.dueDate ?? today)
  const [dueTime,     setDueTime]     = useState(task?.dueTime ?? '')
  const [priority,    setPriority]    = useState<TaskPriority>(task?.priority ?? 'medium')
  const [category,    setCategory]    = useState<TaskCategory | ''>(task?.category ?? '')
  const [contactId,   setContactId]   = useState(task?.contactId ?? '')
  const [propertyId,  setPropertyId]  = useState(task?.propertyId ?? '')

  const [showContactDrop,  setShowContactDrop]  = useState(false)
  const [contactSearch,    setContactSearch]    = useState(
    task?.contactId ? (contacts.find(c => c.id === task.contactId)?.name ?? '') : ''
  )
  const [showPropertyDrop, setShowPropertyDrop] = useState(false)
  const [propertySearch,   setPropertySearch]   = useState(
    task?.propertyId ? (properties.find(p => p.id === task.propertyId)?.name ?? '') : ''
  )
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

  useEffect(() => {
    if (!isOpen) return
    setTitle(task?.title ?? '')
    setDescription(task?.description ?? '')
    // Nova tarefa → padrão hoje; edição → data existente
    setDueDate(task?.dueDate ?? todayStr())
    setDueTime(task?.dueTime ?? '')
    setPriority(task?.priority ?? 'medium')
    setCategory(task?.category ?? '')
    setContactId(task?.contactId ?? '')
    setPropertyId(task?.propertyId ?? '')
    setContactSearch(task?.contactId ? (contacts.find(c => c.id === task.contactId)?.name ?? '') : '')
    setPropertySearch(task?.propertyId ? (properties.find(p => p.id === task.propertyId)?.name ?? '') : '')
    setShowOptional(Boolean(task?.contactId || task?.propertyId))
    setMarkDone(task?.status === 'done')
    setCompletedDate(task?.completedAt ? task.completedAt.split('T')[0] : todayStr())
    setChecklist(task?.checklist ?? [])
    setShowChecklist(Boolean(task?.checklist?.length))
    setNewItemText('')
    setErrors({})
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
                ? 'border-white/10 hover:border-indigo-500/40 hover:bg-indigo-500/5 cursor-pointer'
                : 'border-white/5 opacity-40 cursor-not-allowed'
              }`}
          >
            <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
              <Calendar size={14} className="text-indigo-400" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-xs font-medium text-slate-300 group-hover:text-indigo-300 transition-colors">
                Adicionar ao Google Agenda
              </p>
              <p className="text-xs text-slate-600">
                {dueDate
                  ? `${dueDate.split('-').reverse().join('/')}${dueTime ? ` às ${dueTime}` : ''}`
                  : 'Preencha o título primeiro'}
              </p>
            </div>
            <ExternalLink size={13} className="text-slate-600 group-hover:text-indigo-400 transition-colors" />
          </a>

          {/* Marcar como concluída */}
          <div className={`flex flex-col gap-3 px-4 py-3 rounded-xl border transition-all
            ${markDone ? 'bg-green-500/8 border-green-500/25' : 'bg-white/3 border-white/8'}`}>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMarkDone(v => !v)}
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all cursor-pointer flex-shrink-0
                  ${markDone ? 'bg-green-500 border-green-500' : 'border-white/20 hover:border-green-500/50'}`}
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
                ${showChecklist ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <ListChecks size={14} />
              {showChecklist ? 'Checklist' : 'Adicionar checklist'}
              {!showChecklist && checklist.length > 0 && (
                <span className="text-indigo-400 bg-indigo-500/15 px-1.5 py-0.5 rounded-md text-[10px] font-bold">
                  {checklist.filter(i => i.done).length}/{checklist.length}
                </span>
              )}
            </button>

            {showChecklist && (
              <div className="flex flex-col gap-2 pl-1 border-l-2 border-indigo-500/20 ml-1">
                {/* Progress bar */}
                {checklist.length > 0 && (() => {
                  const done = checklist.filter(i => i.done).length
                  const pct  = Math.round((done / checklist.length) * 100)
                  return (
                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
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
                  <div className="w-4 h-4 rounded border border-white/15 flex-shrink-0" />
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
                    className="text-indigo-500 hover:text-indigo-400 transition-colors cursor-pointer p-1 rounded-lg hover:bg-indigo-500/10"
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
              <div className="flex flex-col gap-4 pl-1 border-l-2 border-white/8 ml-1">

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
                    <div className="absolute top-full left-0 right-0 mt-1 bg-[#1A1D27] border border-white/10 rounded-xl shadow-xl z-10 overflow-hidden">
                      {filteredContacts.map(c => (
                        <button key={c.id} type="button"
                          onMouseDown={() => { setContactId(c.id); setContactSearch(c.name); setShowContactDrop(false) }}
                          className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5 transition-colors cursor-pointer flex items-center gap-2"
                        >
                          <div className="w-5 h-5 bg-indigo-500/20 rounded-full flex items-center justify-center text-[10px] font-bold text-indigo-300 flex-shrink-0">
                            {c.name[0].toUpperCase()}
                          </div>
                          <span>{c.name}</span>
                          {c.company && <span className="text-slate-600 text-xs ml-auto">{c.company}</span>}
                        </button>
                      ))}
                      <button
                        type="button"
                        onMouseDown={() => { setShowContactDrop(false); setNewContactOpen(true) }}
                        className="w-full text-left px-4 py-2.5 text-xs text-indigo-400 hover:bg-indigo-500/10 border-t border-white/5 flex items-center gap-2 transition-colors cursor-pointer"
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
                    <div className="absolute top-full left-0 right-0 mt-1 bg-[#1A1D27] border border-white/10 rounded-xl shadow-xl z-10 overflow-hidden">
                      {filteredProperties.map(p => (
                        <button key={p.id} type="button"
                          onMouseDown={() => { setPropertyId(p.id); setPropertySearch(p.name); setShowPropertyDrop(false) }}
                          className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5 transition-colors cursor-pointer"
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
