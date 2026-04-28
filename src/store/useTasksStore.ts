import { create } from 'zustand'
import { Task, TaskStatus } from '../types'
import { generateId, localDateStr } from '../lib/formatters'
import { db } from '../lib/db'
import { loadChecklists, saveChecklist, removeChecklist } from '../lib/taskChecklists'

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
      const clMap = loadChecklists()
      set({ tasks: tasks.map(t => ({ ...t, checklist: clMap[t.id] })) })
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
    // Persist checklist to localStorage (not Supabase — needs migration for DB)
    if (task.checklist?.length) saveChecklist(task.id, task.checklist)
    const { checklist: _cl, ...taskForDb } = task
    db.tasks.upsert(taskForDb as Task).catch(err => console.error('[tasks] add:', err))
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
    // Persist checklist to localStorage
    if (updated.checklist !== undefined) {
      if (updated.checklist.length > 0) saveChecklist(id, updated.checklist)
      else removeChecklist(id)
    }
    const { checklist: _cl, ...updatedForDb } = updated
    db.tasks.upsert(updatedForDb as Task).catch(err => console.error('[tasks] update:', err))
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
