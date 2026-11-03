import { create } from 'zustand'
import { Task, TaskStatus } from '../types'
import { generateId, localDateStr } from '../lib/formatters'
import { db } from '../lib/db'
import { mensagemDeErro } from '../lib/erros'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
// Import circular com useLeadsStore é seguro: o uso é deferido (getState em runtime)
import { useLeadsStore } from './useLeadsStore'
import { useLeadInteractionsStore } from './useLeadInteractionsStore'

interface TasksStore {
  tasks: Task[]
  loading: boolean
  /** mensagem da última falha de leitura; null quando deu certo */
  erro: string | null
  load: () => Promise<void>
  subscribe: () => () => void
  /** Banco primeiro: a tarefa só entra na tela depois do upsert. Lança se falhar. */
  add: (data: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Task>
  /** Banco primeiro: a tela só muda depois do upsert. Lança se falhar. */
  update: (id: string, data: Partial<Task>) => Promise<void>
  /** Banco primeiro: só sai da tela depois do delete confirmado. Lança se falhar. */
  remove: (id: string) => Promise<void>
  /** Desfazer exclusão: grava a tarefa e os participantes de novo; só então volta à tela. */
  restaurar: (task: Task) => Promise<void>
  /** Concluir/reabrir — espera o banco. Lança se falhar. */
  toggleDone: (id: string) => Promise<void>
  getByStatus: (status: TaskStatus) => Task[]
  getOverdue: () => Task[]
  getUpcoming: () => Task[]
}

export const useTasksStore = create<TasksStore>((set, get) => ({
  tasks: [],
  loading: false,
  erro: null,

  load: async () => {
    set({ loading: true, erro: null })
    try {
      const tasks = await db.tasks.fetchAll()
      set({ tasks })
    } catch (err) {
      // A tela PRECISA saber que falhou. Sem isto ela mostraria o estado vazio
      // e afirmaria que não existe dado — ver EstadoTela.
      console.error('[tasks] load:', err)
      set({ erro: mensagemDeErro(err) })
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
          participants: [],
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
            // participants não vem no payload do tasks — preserva o valor atual
            updatedAt: r.updated_at as string,
          }),
        }))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tasks' }, (payload) => {
        const id = (payload.old as { id: string }).id
        set(s => ({ tasks: s.tasks.filter(t => t.id !== id) }))
      })
      // Quando participantes mudam (alguém é adicionado/removido), recarrega as tarefas
      // para que o novo participante veja a tarefa e o criador veja a lista atualizada.
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'task_participants' }, () => {
        get().load()
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'task_participants' }, () => {
        get().load()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  },

  // add/update/toggleDone eram otimistas e engoliam a falha no console: a
  // tarefa aparecia "criada" ou "concluída" e voltava ao estado antigo no
  // próximo carregamento (02/11/2026). Agora a tela só muda depois do banco.
  //
  // Participantes ficam numa tabela à parte. Se a tarefa gravou e só os
  // participantes falharam, a tarefa EXISTE no banco — então ela entra na
  // tela (sem os participantes) e o erro aparece, em vez de fingir que nada
  // foi criado e o corretor tentar de novo, duplicando.
  add: async (data) => {
    const now = new Date().toISOString()
    const task: Task = { ...data, id: generateId(), createdAt: now, updatedAt: now }
    await db.tasks.upsert(task)
    let gravada = task
    const parts = data.participants ?? []
    if (parts.length > 0) {
      try {
        await db.tasks.setParticipants(task.id, parts)
      } catch (err) {
        gravada = { ...task, participants: [] }
        toast.error(`Tarefa criada, mas não foi possível compartilhar: ${mensagemDeErro(err)}`)
      }
    }
    set(s => s.tasks.some(t => t.id === gravada.id) ? s : { tasks: [gravada, ...s.tasks] })
    return gravada
  },

  update: async (id, data) => {
    const atual = get().tasks.find(t => t.id === id)
    if (!atual) throw new Error('Tarefa não encontrada')
    const { participants, ...resto } = data
    const updated: Task = { ...atual, ...resto, updatedAt: new Date().toISOString() }
    await db.tasks.upsert(updated)
    let final = updated
    // Só mexe nos participantes se o campo veio no patch
    if ('participants' in data) {
      try {
        await db.tasks.setParticipants(id, participants ?? [])
        final = { ...updated, participants: participants ?? [] }
      } catch (err) {
        toast.error(`Tarefa salva, mas o compartilhamento não mudou: ${mensagemDeErro(err)}`)
      }
    }
    set(s => ({ tasks: s.tasks.map(t => t.id === id ? final : t) }))
  },

  // Antes tirava da tela e apagava em segundo plano, engolindo a falha: a
  // tarefa "excluída" voltava no próximo carregamento (01/11/2026).
  remove: async (id) => {
    await db.tasks.delete(id)
    set(s => ({ tasks: s.tasks.filter(t => t.id !== id) }))
  },

  // Os participantes saem em cascata com a tarefa (task_participants ON
  // DELETE CASCADE) — por isso voltam junto.
  restaurar: async (task) => {
    await db.tasks.upsert(task)
    if (task.participants?.length) await db.tasks.setParticipants(task.id, task.participants)
    set(s => s.tasks.some(t => t.id === task.id) ? s : { tasks: [...s.tasks, task] })
  },

  toggleDone: async (id) => {
    const task = get().tasks.find(t => t.id === id)
    if (!task) return
    const next: TaskStatus = task.status === 'done' ? 'pending' : 'done'
    await get().update(id, {
      status: next,
      completedAt: next === 'done' ? new Date().toISOString() : undefined,
    })

    // Ciclo tarefa → histórico: concluir tarefa vinculada a um lead registra
    // a interação automaticamente na timeline (fonte única do que aconteceu).
    // Só depois de a conclusão estar gravada.
    if (next === 'done' && task.contactId) {
      const lead = useLeadsStore.getState().leads.find(
        l => l.contactId === task.contactId && !l.discardReason
      )
      if (lead) {
        useLeadInteractionsStore.getState().add({
          leadId: lead.id,
          type: 'tarefa',
          description: `Tarefa concluída: ${task.title}`,
          interactedAt: new Date().toISOString(),
        }).catch(() => { /* a camada db já avisou; a tarefa está concluída */ })
      }
    }
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
