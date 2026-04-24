import { useEffect, useState } from 'react'
import {
  CheckCircle2, Circle, Clock, Trash2, Pencil, User,
  Building2, AlertTriangle, CheckCheck, ListTodo, CalendarClock,
  Flame, TrendingUp, Home, FileText, Zap, ChevronDown, ChevronUp
} from 'lucide-react'
import { PageLayout } from '../../components/layout/PageLayout'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { TaskForm } from './TaskForm'
import { useTasksStore } from '../../store/useTasksStore'
import { useContactsStore } from '../../store/useContactsStore'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { Task, TaskPriority, TaskCategory } from '../../types'
import { buildGoogleCalendarUrl } from '../../lib/googleCalendar'
import toast from 'react-hot-toast'

// ─── helpers ────────────────────────────────────────────────────────────────

const PRIORITY_DOT: Record<TaskPriority, string> = {
  high:   'bg-red-400',
  medium: 'bg-yellow-400',
  low:    'bg-slate-600',
}

const CATEGORY_CONFIG: Record<TaskCategory, { icon: typeof Home; color: string; label: string; motto: string }> = {
  visita:        { icon: Home,      color: 'text-cyan-400',    label: 'Visita',           motto: 'bora fechar negócio! 🏠'                },
  agenciamento:  { icon: Building2, color: 'text-indigo-400',  label: 'Agenciamento',     motto: 'hora de ampliar o portfólio! 📋'        },
  proposta:      { icon: FileText,  color: 'text-amber-400',   label: 'Proposta',         motto: 'proposta enviada é venda garantida! 💰'  },
  busca_imovel:  { icon: TrendingUp, color: 'text-violet-400', label: 'Busca de Imóvel',  motto: 'encontre o imóvel certo para o lead! 🔍' },
  outro:         { icon: Zap,       color: 'text-slate-400',   label: 'Outro',            motto: ''                                        },
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function todayStr() { return new Date().toISOString().split('T')[0] }

function sortKey(t: Task): string {
  const d = t.dueDate ?? '9999-12-31'
  const h = t.dueTime ?? '23:59'
  return `${d}T${h}`
}

function formatDateLabel(date?: string, time?: string): { label: string; isToday: boolean; overdue: boolean } {
  if (!date) return { label: 'Sem data', isToday: false, overdue: false }
  const today = todayStr()
  const isToday  = date === today
  const overdue  = date < today
  const d = new Date(date + 'T00:00:00')
  const dayLabel = isToday ? 'Hoje' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  return { label: time ? `${dayLabel} às ${time}` : dayLabel, isToday, overdue }
}

// ─── SmartBanner ─────────────────────────────────────────────────────────────

function SmartBanner({ tasks }: { tasks: Task[] }) {
  const today   = todayStr()
  const pending = tasks.filter(t => t.status !== 'done' && t.dueDate === today)
  const overdue = tasks.filter(t => t.status !== 'done' && t.dueDate && t.dueDate < today)
  const total   = pending.length

  const counts: Partial<Record<TaskCategory, number>> = {}
  pending.forEach(t => {
    if (t.category) counts[t.category] = (counts[t.category] ?? 0) + 1
  })

  const lines: string[] = []
  if ((counts.visita ?? 0) > 0) {
    const n = counts.visita!
    lines.push(`${n} visita${n > 1 ? 's' : ''} agendada${n > 1 ? 's' : ''} — ${CATEGORY_CONFIG.visita.motto}`)
  }
  if ((counts.agenciamento ?? 0) > 0) {
    const n = counts.agenciamento!
    lines.push(`${n} agenciamento${n > 1 ? 's' : ''} para hoje — ${CATEGORY_CONFIG.agenciamento.motto}`)
  }
  if ((counts.proposta ?? 0) > 0) {
    const n = counts.proposta!
    lines.push(`${n} proposta${n > 1 ? 's' : ''} para apresentar — ${CATEGORY_CONFIG.proposta.motto}`)
  }
  if ((counts.busca_imovel ?? 0) > 0) {
    const n = counts.busca_imovel!
    lines.push(`${n} busca${n > 1 ? 's' : ''} de imóvel — ${CATEGORY_CONFIG.busca_imovel.motto}`)
  }

  const greeting = getGreeting()

  let headline = ''
  let sub = ''
  let accent = 'from-indigo-500/20 to-violet-500/10'

  if (total === 0 && overdue.length === 0) {
    headline = `${greeting}, Chefe! 🎉`
    sub = 'Agenda limpa hoje. Aproveite para prospectar ou adiantar tarefas futuras.'
    accent = 'from-green-500/15 to-emerald-500/5'
  } else if (total === 0 && overdue.length > 0) {
    headline = `${greeting}, Chefe!`
    sub = `Nada para hoje, mas você tem ${overdue.length} tarefa${overdue.length > 1 ? 's' : ''} em atraso. Hora de colocar em dia! ⚡`
    accent = 'from-red-500/15 to-orange-500/5'
  } else {
    headline = `${greeting}, Chefe! Temos ${total} tarefa${total > 1 ? 's' : ''} para hoje.`
    sub = lines.length > 0 ? lines.join(' · ') : 'Foco no que importa — cada tarefa concluída é um passo à frente!'
    accent = total >= 5 ? 'from-amber-500/20 to-orange-500/10' : 'from-indigo-500/20 to-violet-500/10'
  }

  return (
    <div className={`bg-gradient-to-r ${accent} border border-white/10 rounded-2xl px-6 py-5 mb-6`}>
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center flex-shrink-0 text-xl">
          {total === 0 && overdue.length === 0 ? '✅' : total >= 5 ? '🔥' : '💼'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-slate-100 mb-0.5">{headline}</p>
          <p className="text-sm text-slate-400 leading-relaxed">{sub}</p>
          {overdue.length > 0 && total > 0 && (
            <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1">
              <AlertTriangle size={11} /> {overdue.length} tarefa{overdue.length > 1 ? 's' : ''} em atraso — não deixe acumular!
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── TaskRow ─────────────────────────────────────────────────────────────────

interface TaskRowProps {
  task:         Task
  contacts:     ReturnType<typeof useContactsStore.getState>['contacts']
  properties:   ReturnType<typeof usePropertiesStore.getState>['properties']
  isLast:       boolean
  showCategory?: boolean
  onToggle:     () => void
  onEdit:       () => void
  onDelete:     () => void
  onCalendar:   () => void
}

function TaskRow({ task: t, contacts, properties, isLast, showCategory = true, onToggle, onEdit, onDelete, onCalendar }: TaskRowProps) {
  const contact  = contacts.find(c => c.id === t.contactId)
  const property = properties.find(p => p.id === t.propertyId)
  const { label: dateLabel, isToday, overdue } = formatDateLabel(t.dueDate, t.dueTime)
  const isDone   = t.status === 'done'
  const CatIcon  = t.category ? CATEGORY_CONFIG[t.category].icon : null
  const catColor = t.category ? CATEGORY_CONFIG[t.category].color : ''

  return (
    <div className={`flex items-start gap-4 px-5 py-4 transition-colors hover:bg-white/3 group relative
      ${!isLast ? 'border-b border-white/5' : ''}
      ${isDone ? 'opacity-55' : ''}
      ${isToday && !isDone ? 'bg-indigo-500/3' : ''}
    `}>
      {/* Accent bar */}
      {isToday && !isDone && (
        <div className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full bg-indigo-400" />
      )}
      {overdue && !isDone && (
        <div className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full bg-red-400" />
      )}

      {/* Checkbox */}
      <button onClick={onToggle} className="mt-0.5 flex-shrink-0 cursor-pointer transition-all hover:scale-110">
        {isDone
          ? <CheckCircle2 size={20} className="text-green-400" />
          : <Circle       size={20} className="text-slate-600 hover:text-indigo-400 transition-colors" />
        }
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <p className={`text-sm font-medium ${isDone ? 'line-through text-slate-500' : 'text-slate-100'}`}>
            {t.title}
          </p>
          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_DOT[t.priority]}`} />
          {isToday && !isDone && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-500/25 text-indigo-300 border border-indigo-500/30">
              HOJE
            </span>
          )}
          {overdue && !isDone && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-red-500/20 text-red-400 border border-red-500/25">
              ATRASADA
            </span>
          )}
        </div>

        {t.description && (
          <p className="text-xs text-slate-500 mb-1.5 truncate">{t.description}</p>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <span className={`flex items-center gap-1 text-xs font-medium
            ${overdue && !isDone ? 'text-red-400' : isToday && !isDone ? 'text-indigo-400' : 'text-slate-500'}`}>
            <Clock size={11} />
            {dateLabel}
          </span>

          {showCategory && CatIcon && (
            <span className={`flex items-center gap-1 text-xs font-medium ${catColor}`}>
              <CatIcon size={11} />
              {CATEGORY_CONFIG[t.category!].label}
            </span>
          )}

          {contact && (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <User size={11} className="text-indigo-400" /> {contact.name}
            </span>
          )}
          {property && (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <Building2 size={11} className="text-cyan-400" /> {property.name}
            </span>
          )}

          {isDone && t.completedAt && (
            <span className="flex items-center gap-1 text-xs text-green-400/70">
              <CheckCircle2 size={10} />
              Concluída em {new Date(t.completedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        {t.dueDate && (
          <button onClick={onCalendar}
            className="p-2 rounded-lg hover:bg-indigo-500/10 text-slate-600 hover:text-indigo-400 transition-colors cursor-pointer"
            title="Google Agenda">
            <CalendarClock size={13} />
          </button>
        )}
        <button onClick={onEdit}
          className="p-2 rounded-lg hover:bg-white/8 text-slate-600 hover:text-slate-300 transition-colors cursor-pointer">
          <Pencil size={13} />
        </button>
        <button onClick={onDelete}
          className="p-2 rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-colors cursor-pointer">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

// ─── Section ─────────────────────────────────────────────────────────────────

function Section({
  title, icon, count, color, tasks, contacts, properties,
  onToggle, onEdit, onDelete, onCalendar,
  collapsible = false, defaultOpen = true, showCategory = true,
}: {
  title: string; icon: React.ReactNode; count: number; color: string
  tasks: Task[]; contacts: any[]; properties: any[]
  onToggle: (id: string) => void; onEdit: (t: Task) => void
  onDelete: (t: Task) => void; onCalendar: (t: Task) => void
  collapsible?: boolean; defaultOpen?: boolean; showCategory?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  if (tasks.length === 0) return null

  return (
    <div className="mb-5">
      <button
        onClick={() => collapsible && setOpen(v => !v)}
        className={`flex items-center gap-2 mb-3 ${collapsible ? 'cursor-pointer group' : 'cursor-default'}`}
      >
        <span className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider ${color}`}>
          {icon} {title}
        </span>
        <span className="text-xs font-bold px-1.5 py-0.5 rounded-md bg-white/8 text-slate-400">{count}</span>
        {collapsible && (open
          ? <ChevronUp size={12} className="text-slate-600 group-hover:text-slate-400 ml-1" />
          : <ChevronDown size={12} className="text-slate-600 group-hover:text-slate-400 ml-1" />
        )}
      </button>

      {open && (
        <Card className="!p-0 overflow-hidden">
          {tasks.map((t, i) => (
            <TaskRow
              key={t.id}
              task={t}
              contacts={contacts}
              properties={properties}
              isLast={i === tasks.length - 1}
              showCategory={showCategory}
              onToggle={() => onToggle(t.id)}
              onEdit={() => onEdit(t)}
              onDelete={() => onDelete(t)}
              onCalendar={() => onCalendar(t)}
            />
          ))}
        </Card>
      )}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function TasksPage() {
  const { tasks, load, remove, toggleDone } = useTasksStore()
  const { contacts, load: loadContacts }    = useContactsStore()
  const { properties, load: loadProperties } = usePropertiesStore()

  const [formOpen,     setFormOpen]     = useState(false)
  const [editing,      setEditing]      = useState<Task | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<Task | undefined>()
  const [showDone,     setShowDone]     = useState(false)

  useEffect(() => { load(); loadContacts(); loadProperties() }, [load, loadContacts, loadProperties])

  const today = todayStr()

  // urgency prefix: 0=overdue 1=today 2=upcoming 3=no date
  function urgencyPrefix(t: Task): string {
    if (t.dueDate && t.dueDate < today) return '0'
    if (t.dueDate === today)            return '1'
    if (t.dueDate && t.dueDate > today) return '2'
    return '3'
  }
  function fullKey(t: Task) { return urgencyPrefix(t) + sortKey(t) }

  const pending = tasks.filter(t => t.status === 'pending')

  // Stats (for strip)
  const overdueCount  = pending.filter(t => t.dueDate && t.dueDate < today).length
  const todayCount    = pending.filter(t => t.dueDate === today).length
  const upcomingCount = pending.filter(t => t.dueDate && t.dueDate > today).length

  // Group pending by category, sorted by urgency then date within each group
  const CATEGORY_ORDER: TaskCategory[] = ['visita', 'agenciamento', 'proposta', 'busca_imovel', 'outro']
  const byCategory = CATEGORY_ORDER.map(cat => ({
    cat,
    tasks: pending
      .filter(t => (t.category ?? 'outro') === cat)
      .sort((a, b) => fullKey(a).localeCompare(fullKey(b))),
  }))

  const doneList = tasks
    .filter(t => t.status === 'done')
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))

  const pendingCount = pending.length
  const doneCount    = doneList.length

  function handleDelete() {
    if (!deleteTarget) return
    remove(deleteTarget.id)
    toast.success('Tarefa excluída')
    setDeleteTarget(undefined)
  }

  function openCalendar(t: Task) {
    if (!t.dueDate) return
    const contact  = contacts.find(c => c.id === t.contactId)
    const property = properties.find(p => p.id === t.propertyId)
    const parts: string[] = []
    if (t.description) parts.push(t.description)
    if (contact)  parts.push(`Lead: ${contact.name}`)
    if (property) parts.push(`Imóvel: ${property.name}`)
    const url = buildGoogleCalendarUrl({ title: t.title, description: parts.join('\n') || undefined, date: t.dueDate, time: t.dueTime })
    window.open(url, '_blank')
  }

  const isEmpty = tasks.length === 0

  const sharedProps = {
    contacts,
    properties,
    onToggle:   toggleDone,
    onEdit:     (t: Task) => { setEditing(t); setFormOpen(true) },
    onDelete:   setDeleteTarget,
    onCalendar: openCalendar,
  }

  return (
    <PageLayout
      title="Tarefas"
      subtitle={`${pendingCount} pendente${pendingCount !== 1 ? 's' : ''} · ${doneCount} concluída${doneCount !== 1 ? 's' : ''}`}
      ctaLabel="Nova Tarefa"
      onCta={() => { setEditing(undefined); setFormOpen(true) }}
    >
      {/* Smart greeting banner */}
      {!isEmpty && <SmartBanner tasks={tasks} />}

      {/* Stats strip */}
      {!isEmpty && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Hoje',       value: todayCount,    color: 'text-indigo-400', bg: 'bg-indigo-500/10', icon: <Flame size={13} />         },
            { label: 'Em atraso',  value: overdueCount,  color: 'text-red-400',    bg: 'bg-red-500/10',    icon: <AlertTriangle size={13} /> },
            { label: 'Próximas',   value: upcomingCount, color: 'text-cyan-400',   bg: 'bg-cyan-500/10',   icon: <TrendingUp size={13} />    },
            { label: 'Concluídas', value: doneCount,     color: 'text-green-400',  bg: 'bg-green-500/10',  icon: <CheckCheck size={13} />    },
          ].map(s => (
            <div key={s.label} className={`flex items-center gap-3 px-4 py-3 rounded-xl ${s.bg} border border-white/8`}>
              <span className={s.color}>{s.icon}</span>
              <div>
                <p className={`text-xl font-bold tabular-nums leading-none ${s.color}`}>{s.value}</p>
                <p className="text-[11px] text-slate-600 mt-0.5">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {isEmpty ? (
        <EmptyState
          icon={<ListTodo size={24} />}
          title="Nenhuma tarefa ainda"
          description="Crie tarefas para organizar seu dia e não perder nenhum follow-up."
          ctaLabel="Nova Tarefa"
          onCta={() => { setEditing(undefined); setFormOpen(true) }}
        />
      ) : (
        <>
          {byCategory.map(({ cat, tasks: catTasks }) => {
            const cfg     = CATEGORY_CONFIG[cat]
            const CatIcon = cfg.icon
            return (
              <Section
                key={cat}
                title={cfg.label}
                icon={<CatIcon size={12} />}
                count={catTasks.length}
                color={cfg.color}
                tasks={catTasks}
                showCategory={false}
                collapsible
                defaultOpen
                {...sharedProps}
              />
            )
          })}

          {/* Done section toggle */}
          {doneList.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setShowDone(v => !v)}
                className="flex items-center gap-2 text-xs text-slate-600 hover:text-slate-400 transition-colors cursor-pointer mb-3"
              >
                {showDone ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                <CheckCircle2 size={12} className="text-green-500" />
                <span>{doneList.length} tarefa{doneList.length !== 1 ? 's' : ''} concluída{doneList.length !== 1 ? 's' : ''}</span>
              </button>
              {showDone && (
                <Card className="!p-0 overflow-hidden opacity-70">
                  {doneList.map((t, i) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      contacts={contacts}
                      properties={properties}
                      isLast={i === doneList.length - 1}
                      onToggle={() => toggleDone(t.id)}
                      onEdit={() => { setEditing(t); setFormOpen(true) }}
                      onDelete={() => setDeleteTarget(t)}
                      onCalendar={() => openCalendar(t)}
                    />
                  ))}
                </Card>
              )}
            </div>
          )}
        </>
      )}

      <TaskForm key={editing?.id ?? 'new'} isOpen={formOpen} onClose={() => setFormOpen(false)} task={editing} />

      <Modal isOpen={Boolean(deleteTarget)} onClose={() => setDeleteTarget(undefined)} title="Excluir tarefa" size="sm">
        <p className="text-sm text-slate-400 mb-6">
          Tem certeza que deseja excluir <span className="text-slate-200 font-medium">"{deleteTarget?.title}"</span>?
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setDeleteTarget(undefined)}>Cancelar</Button>
          <Button variant="danger"    className="flex-1" onClick={handleDelete}>Excluir</Button>
        </div>
      </Modal>
    </PageLayout>
  )
}
