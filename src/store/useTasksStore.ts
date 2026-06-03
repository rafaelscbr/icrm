import { create } from 'zustand'
import { Task, TaskStatus } from '../types'
import { generateId, localDateStr } from '../lib/formatters'
import { db } from '../lib/db'
import { supabase } from '../lib/supabase'

interface TasksStore {
  tasks: Task[]
  loading: boolean
  load: () => Promise<void>
  subscribe: () => () => void
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

  subscribe: () => {
    const channelName = 'tasks-realtime'
    const existing = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`)
    if (existing) return () => {}

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks' }, (payload) => {
        const r = payload.new as Record<string, unknown>
        const task: Task = {
          id: r.id as string,
          title: r.title as string,
          description: (r.description as string | null) ?? undefined,
          dueDate: r.due_date ? (r.due_date as string).split('T')[0] : undefined,
          dueTime: (r.due_time as string | null) ?? undefined,
          status: r.status as Task['status'],
          priority: r.priority as Task['priority'],
          category: (r.category as Task['category']) ?? undefined,
          completedAt: (r.completed_at as string | null) ?? undefined,
          contactId: (r.contact_id as string | null) ?? undefined,
          propertyId: (r.property_id as string | null) ?? undefined,
          googleEventId: (r.google_event_id as string | null) ?? undefined,
          brokerId: (r.broker_id as string | null) ?? undefined,
          assignedToId: (r.assigned_to_id as string | null) ?? undefined,
          checklist: (r.checklist as Task['checklist']) ?? undefined,
          createdAt: r.created_at as string,
          updatedAt: r.updated_at as string,
        }
        set(s => s.tasks.some(t => t.id === task.id) ? s : { tasks: [task, ...s.tasks] })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks' }, (payload) => {
        const r = payload.new as Record<string, unknown>
        set(s => ({
          tasks: s.tasks.map(t => t.id !== r.id ? t : {
            ...t,
            title: r.title as string,
            description: (r.description as string | null) ?? undefined,
            dueDate: r.due_date ? (r.due_date as string).split('T')[0] : undefined,
            dueTime: (r.due_time as string | null) ?? undefined,
            status: r.status as Task['status'],
            priority: r.priority as Task['priority'],
            category: (r.category as Task['category']) ?? undefined,
            completedAt: (r.completed_at as string | null) ?? undefined,
            contactId: (r.contact_id as string | null) ?? undefined,
            propertyId: (r.property_id as string | null) ?? undefined,
            brokerId: (r.broker_id as string | null) ?? undefined,
            assignedToId: (r.assigned_to_id as string | null) ?? undefined,
            checklist: (r.checklist as Task['checklist']) ?? undefined,
            updatedAt: r.updated_at as string,
          }),
        }))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tasks' }, (payload) => {
        const id = (payload.old as { id: string }).id
        set(s => ({ tasks: s.tasks.filter(t => t.id !== id) }))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
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
    if (!updated) return
    db.tasks.upsert(updated).catch(err => console.error('[tasks] update:', err))
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
