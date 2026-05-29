import { useState } from 'react'
import {
  CheckCircle2, Circle, CalendarDays,
  Home, Building2, FileText, TrendingUp, Zap, Plus
} from 'lucide-react'
import { Modal } from '../ui/Modal'
import { TaskForm } from '../../modules/tasks/TaskForm'
import { ChecklistBadge } from './ChecklistBadge'
import { useTasksStore } from '../../store/useTasksStore'
import { Task, TaskCategory } from '../../types'

// ─── config ───────────────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<TaskCategory, { icon: typeof Home; color: string; label: string }> = {
  visita:             { icon: Home,       color: 'text-cyan-400',    label: 'Visita'                },
  agenciamento:       { icon: Building2,  color: 'text-indigo-400',  label: 'Agenciamento'          },
  proposta:           { icon: FileText,   color: 'text-amber-400',   label: 'Proposta'              },
  busca_imovel:       { icon: TrendingUp, color: 'text-violet-400',  label: 'Busca de Imóvel'       },
  prospeccao_imoveis: { icon: TrendingUp, color: 'text-emerald-400', label: 'Prospecção de Imóveis' },
  campanhas:          { icon: Zap,        color: 'text-pink-400',    label: 'Campanhas'             },
  administrativo:     { icon: FileText,   color: 'text-slate-300',   label: 'Administrativo'        },
  souza_financeiro:   { icon: Zap,        color: 'text-green-400',   label: 'Souza Financeiro'      },
  outro:              { icon: Zap,        color: 'text-slate-400',   label: 'Outro'                 },
}
const CATEGORY_ORDER: TaskCategory[] = ['visita', 'agenciamento', 'proposta', 'busca_imovel', 'prospeccao_imoveis', 'campanhas', 'administrativo', 'souza_financeiro', 'outro']

function fmtDate(d?: string) {
  if (!d) return null
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── TaskLine ─────────────────────────────────────────────────────────────────

function TaskLine({ task, isLast }: { task: Task; isLast: boolean }) {
  const isDone = task.status === 'done'
  return (
    <div className={`flex items-start gap-3 py-3 ${!isLast ? 'border-b border-line' : ''}`}>
      {isDone
        ? <CheckCircle2 size={15} className="text-success mt-0.5 flex-shrink-0" />
        : <Circle       size={15} className="text-t4 mt-0.5 flex-shrink-0" />
      }
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${isDone ? 'line-through text-t3' : 'text-t1'}`}>
          {task.title}
        </p>
        {task.description && (
          <p className="text-xs text-slate-600 truncate mt-0.5">{task.description}</p>
        )}
        {/* Checklist progress */}
        {task.checklist && task.checklist.length > 0 && (
          <div className="mt-1.5">
            <ChecklistBadge checklist={task.checklist} size="sm" />
          </div>
        )}
        <div className="flex items-center gap-3 flex-wrap mt-1">
          {task.dueDate && (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <CalendarDays size={10} /> {fmtDate(task.dueDate)}{task.dueTime ? ` às ${task.dueTime}` : ''}
            </span>
          )}
          {task.category && (() => {
            const cfg     = CATEGORY_CONFIG[task.category]
            const CatIcon = cfg.icon
            return (
              <span className={`flex items-center gap-1 text-xs font-medium ${cfg.color}`}>
                <CatIcon size={10} /> {cfg.label}
              </span>
            )
          })()}
          {isDone && task.completedAt && (
            <span className="text-xs text-green-400/60">
              ✓ concluída em {fmtDate(task.completedAt.split('T')[0])}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface TasksLinkedModalProps {
  isOpen:    boolean
  onClose:   () => void
  title:     string              // nome do lead ou imóvel
  subtitle?: string              // ex: "Proprietário" ou "Apartamento · R$ 800k"
  contactId?:  string
  propertyId?: string
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function TasksLinkedModal({
  isOpen, onClose, title, subtitle, contactId, propertyId
}: TasksLinkedModalProps) {
  const { tasks } = useTasksStore()
  const [newTaskOpen, setNewTaskOpen] = useState(false)
  const [tab, setTab] = useState<'pending' | 'done'>('pending')

  // Filtra tarefas vinculadas a este contato ou imóvel
  const linked = tasks.filter(t =>
    (contactId  && t.contactId  === contactId)  ||
    (propertyId && t.propertyId === propertyId)
  )

  const pending = linked.filter(t => t.status !== 'done')
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
  const done    = linked.filter(t => t.status === 'done')
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))

  // Agrupamento por categoria para a lista visível
  const current = tab === 'pending' ? pending : done
  const byCategory = CATEGORY_ORDER.map(cat => ({
    cat,
    cfg:   CATEGORY_CONFIG[cat],
    tasks: current.filter(t => (t.category ?? 'outro') === cat),
  })).filter(g => g.tasks.length > 0)

  const uncategorized = current.filter(t => !t.category)

  // Tarefa pré-populada com o vínculo já definido
  const preLinkedTask = contactId
    ? { contactId } as Partial<Task>
    : { propertyId } as Partial<Task>

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={`Tarefas — ${title}`} size="md">
        {/* Subtitle */}
        {subtitle && (
          <p className="text-xs text-t3 -mt-3 mb-4">{subtitle}</p>
        )}

        {/* Stats + Nova tarefa */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--s2)', border: '1px solid var(--line)' }}>
            <button
              onClick={() => setTab('pending')}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer"
              style={tab === 'pending'
                ? { background: 'var(--brand-tint)', color: 'var(--brand-text)', border: '1px solid var(--brand)/25' }
                : { color: 'var(--t3)', border: '1px solid transparent' }}
            >
              Pendentes ({pending.length})
            </button>
            <button
              onClick={() => setTab('done')}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer"
              style={tab === 'done'
                ? { background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success-line)' }
                : { color: 'var(--t3)', border: '1px solid transparent' }}
            >
              Concluídas ({done.length})
            </button>
          </div>

          <button
            onClick={() => setNewTaskOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer text-white"
            style={{ background: 'var(--brand)' }}
          >
            <Plus size={12} /> Nova tarefa
          </button>
        </div>

        {/* Lista */}
        {current.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-2" style={{ background: 'var(--s2)' }}>
              {tab === 'pending'
                ? <Circle size={18} className="text-t4" />
                : <CheckCircle2 size={18} className="text-t4" />
              }
            </div>
            <p className="text-sm text-t3">
              {tab === 'pending' ? 'Nenhuma tarefa pendente' : 'Nenhuma tarefa concluída'}
            </p>
            {tab === 'pending' && (
              <button
                onClick={() => setNewTaskOpen(true)}
                className="mt-3 text-xs text-brand hover:text-brand-dark underline cursor-pointer"
              >
                Criar primeira tarefa
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {byCategory.map(({ cat, cfg, tasks: catTasks }) => {
              const CatIcon = cfg.icon
              return (
                <div key={cat}>
                  <p className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider mb-1 ${cfg.color}`}>
                    <CatIcon size={11} /> {cfg.label} · {catTasks.length}
                  </p>
                  <div className="rounded-xl px-3" style={{ background: 'var(--s2)', border: '1px solid var(--line)' }}>
                    {catTasks.map((t, i) => (
                      <TaskLine key={t.id} task={t} isLast={i === catTasks.length - 1} />
                    ))}
                  </div>
                </div>
              )
            })}

            {uncategorized.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-1">
                  Sem categoria · {uncategorized.length}
                </p>
                <div className="rounded-xl px-3" style={{ background: 'var(--s2)', border: '1px solid var(--line)' }}>
                  {uncategorized.map((t, i) => (
                    <TaskLine key={t.id} task={t} isLast={i === uncategorized.length - 1} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Criar nova tarefa já com vínculo preenchido */}
      <TaskForm
        isOpen={newTaskOpen}
        onClose={() => setNewTaskOpen(false)}
        task={preLinkedTask as Task | undefined}
      />
    </>
  )
}
