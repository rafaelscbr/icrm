import { create } from 'zustand'
import { Task, TaskStatus } from '../types'
import { generateId, localDateStr } from '../lib/formatters'
import { db } from '../lib/db'
import { loadChecklists, removeChecklist } from '../lib/taskChecklists'

interface TasksStore {
  tasks: Task[]
  loading: boolean
  load: () => Promise<void>
  add: (data: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => Task
  update: (id: string, data: Partial<Task>) => void
  remove: (id: string) => void
  toggleDone: (id: string) => void
  getByStatus: (status: TaskStatus) => Task[]
  getOverdue: () => Task[]
  getUpcoming: () => Task[]
}

export const useTasksStore = create<TasksStore>((set, get) => ({
  tasks: [],
  loading: false,

  load: async () => {
    set({ loading: true })
    try {
      const tasks = await db.tasks.fetchAll()
      // Checklist vem do banco (coluna JSONB). localStorage mantido como fallback de migração.
      const clMap = loadChecklists()
      set({
        tasks: tasks.map(t => ({
          ...t,
          // Banco tem prioridade; localStorage só como fallback para dados antigos
          checklist: t.checklist?.length ? t.checklist : (clMap[t.id] ?? undefined),
        })),
      })
    } catch (err) {
      console.error('[tasks] load:', err)
    } finally {
      set({ loading: false })
    }
  },

  add: (data) => {
    const now = new Date().toISOString()
    const task: Task = { ...data, id: generateId(), createdAt: now, updatedAt: now }
    set(s => ({ tasks: [task, ...s.tasks] }))
    // Checklist vai direto no banco via coluna JSONB
    db.tasks.upsert(task).catch(err => console.error('[tasks] add:', err))
    return task
  },

  update: (id, data) => {
    const now = new Date().toISOString()
    const tasks = get().tasks.map(t =>
      t.id === id ? { ...t, ...data, updatedAt: now } : t
    )
    set({ tasks })
    const updated = tasks.find(t => t.id === id)
    if (!updated) return
    // Checklist salvo no banco; limpar localStorage se existir (migração)
    if (updated.checklist !== undefined) {
      removeChecklist(id)
    }
    db.tasks.upsert(updated).catch(err => console.error('[tasks] update:', err))
  },

  remove: (id) => {
    set(s => ({ tasks: s.tasks.filter(t => t.id !== id) }))
    removeChecklist(id)
    db.tasks.delete(id).catch(err => console.error('[tasks] remove:', err))
  },

  toggleDone: (id) => {
    const task = get().tasks.find(t => t.id === id)
    if (!task) return
    const next: TaskStatus = task.status === 'done' ? 'pending' : 'done'
    get().update(id, {
      status: next,
      completedAt: next === 'done' ? new Date().toISOString() : undefined,
    })
  },

  getByStatus: (status) => get().tasks.filter(t => t.status === status),

  getOverdue: () => {
    const today = localDateStr()
    return get().tasks.filter(t =>
      t.status === 'pending' && t.dueDate && t.dueDate < today
    )
  },

  getUpcoming: () => {
    const today = localDateStr()
    return get().tasks
      .filter(t => t.status === 'pending' && (!t.dueDate || t.dueDate >= today))
      .sort((a, b) => {
        if (!a.dueDate) return 1
        if (!b.dueDate) return -1
        return a.dueDate.localeCompare(b.dueDate)
      })
  },
}))
