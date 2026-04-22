import { create } from 'zustand'
import { Task, TaskStatus } from '../types'
import { generateId } from '../lib/formatters'
import { db } from '../lib/db'

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
      set({ tasks })
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
    if (updated) db.tasks.upsert(updated).catch(err => console.error('[tasks] update:', err))
  },

  remove: (id) => {
    set(s => ({ tasks: s.tasks.filter(t => t.id !== id) }))
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
    const today = new Date().toISOString().split('T')[0]
    return get().tasks.filter(t =>
      t.status === 'pending' && t.dueDate && t.dueDate < today
    )
  },

  getUpcoming: () => {
    const today = new Date().toISOString().split('T')[0]
    return get().tasks
      .filter(t => t.status === 'pending' && (!t.dueDate || t.dueDate >= today))
      .sort((a, b) => {
        if (!a.dueDate) return 1
        if (!b.dueDate) return -1
        return a.dueDate.localeCompare(b.dueDate)
      })
  },
}))
