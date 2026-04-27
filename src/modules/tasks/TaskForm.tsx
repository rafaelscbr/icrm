import { useState, useEffect, FormEvent } from 'react'
import { Calendar, User, Building2, Plus, ExternalLink, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { Select } from '../../components/ui/Select'
import { Button } from '../../components/ui/Button'
import { Task, TaskCategory, TaskPriority } from '../../types'
import { useTasksStore } from '../../store/useTasksStore'
import { useContactsStore } from '../../store/useContactsStore'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { buildGoogleCalendarUrl } from '../../lib/googleCalendar'
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
  { value: 'visita',       label: 'Visita'          },
  { value: 'agenciamento', label: 'Agenciamento'    },
  { value: 'proposta',     label: 'Proposta'        },
  { value: 'busca_imovel', label: 'Busca de Imóvel' },
  { value: 'outro',        label: 'Outro'           },
]

// Classes base para inputs "inline" que não usam o componente Input
// (busca de contato/imóvel) — idêntico ao Input component
const inputBase =
  'w-full bg-white/5 border border-white/10 hover:border-white/20 rounded-xl px-3 py-3 min-h-[44px] text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all duration-150'

export function TaskForm({ isOpen, onClose, task }: TaskFormProps) {
  const { add, update } = useTasksStore()
  const { contacts }    = useContactsStore()
  const { properties }  = usePropertiesStore()
  const isEditing = Boolean(task)

  const today = new Date().toISOString().split('T')[0]

  const [title,       setTitle]       = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [dueDate,     setDueDate]     = useState(task?.dueDate ?? '')
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

  useEffect(() => {
    if (!isOpen) return
    setTitle(task?.title ?? '')
    setDescription(task?.description ?? '')
    setDueDate(task?.dueDate ?? '')
    setDueTime(task?.dueTime ?? '')
    setPriority(task?.priority ?? 'medium')
    setCategory(task?.category ?? '')
    setContactId(task?.contactId ?? '')
    setPropertyId(task?.propertyId ?? '')
    setContactSearch(task?.contactId ? (contacts.find(c => c.id === task.contactId)?.name ?? '') : '')
    setPropertySearch(task?.propertyId ? (properties.find(p => p.id === task.propertyId)?.name ?? '') : '')
    setShowOptional(Boolean(task?.contactId || task?.propertyId))
    setMarkDone(task?.status === 'done')
    setCompletedDate(task?.completedAt ? task.completedAt.split('T')[0] : today)
    setErrors({})
  }, [task, isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredContacts = contactSearch.trim()
    ? contacts.filter(c => c.name.toLowerCase().includes(contactSearch.toLowerCase()))
    : contacts.slice(0, 6)

  const filteredProperties = propertySearch.trim()
    ? properties.filter(p => p.name.toLowerCase().includes(propertySearch.toLowerCase()))
    : properties.slice(0, 6)

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

  function handleAddToCalendar() {
    if (!title.trim() || !dueDate) {
      toast.error('Preencha o título e a data para adicionar ao Google Agenda')
      return
    }
    const contact  = contacts.find(c => c.id === contactId)
    const property = properties.find(p => p.id === propertyId)
    const parts: string[] = []
    if (description.trim()) parts.push(description.trim())
    if (contact)  parts.push(`Lead: ${contact.name}`)
    if (property) parts.push(`Imóvel: ${property.name}`)

    const url = buildGoogleCalendarUrl({
      title:       title.trim(),
      description: parts.join('\n') || undefined,
      date:        dueDate,
      time:        dueTime || undefined,
    })
    window.open(url, '_blank')
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
            label="Categoria (para metas)"
            value={category}
            onChange={e => setCategory(e.target.value as TaskCategory | '')}
          >
            <option value="">Nenhuma</option>
            {CATEGORY_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>

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

          {/* Adicionar ao Google Agenda */}
          {dueDate && (
            <button
              type="button"
              onClick={handleAddToCalendar}
              className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-white/10 hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-all group cursor-pointer"
            >
              <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                <Calendar size={14} className="text-indigo-400" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-xs font-medium text-slate-300 group-hover:text-indigo-300 transition-colors">
                  Adicionar ao Google Agenda
                </p>
                <p className="text-xs text-slate-600">
                  {dueDate.split('-').reverse().join('/')}{dueTime ? ` às ${dueTime}` : ''}
                </p>
              </div>
              <ExternalLink size={13} className="text-slate-600 group-hover:text-indigo-400 transition-colors" />
            </button>
          )}

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

      {/* Formulário de novo contato — usa o mesmo ContactForm atualizado */}
      <ContactForm
        isOpen={newContactOpen}
        onClose={() => setNewContactOpen(false)}
        onCreated={c => { setContactId(c.id); setContactSearch(c.name) }}
      />
    </>
  )
}
