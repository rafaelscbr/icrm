import { create } from 'zustand'
import { Goal, GoalCategory } from '../types'
import { generateId } from '../lib/formatters'
import { db } from '../lib/db'

const DEFAULT_GOALS: Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { name: 'Visitas semanais',        category: 'visita',       target: 2, period: 'weekly',  active: true },
  { name: 'Agenciamentos semanais',  category: 'agenciamento', target: 2, period: 'weekly',  active: true },
  { name: 'Propostas semanais',      category: 'proposta',     target: 1, period: 'weekly',  active: true },
  { name: 'Vendas mensais',          category: 'venda',        target: 1, period: 'monthly', active: true },
]

function makeGoal(data: Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>): Goal {
  const now = new Date().toISOString()
  return { ...data, id: generateId(), createdAt: now, updatedAt: now }
}

interface GoalsStore {
  goals: Goal[]
  loading: boolean
  load: () => Promise<void>
  add: (data: Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>) => Goal
  update: (id: string, data: Partial<Goal>) => void
  remove: (id: string) => void
}

export const useGoalsStore = create<GoalsStore>((set, get) => ({
  goals: [],
  loading: false,

  load: async () => {
    set({ loading: true })
    try {
      const goals = await db.goals.fetchAll()
      if (goals.length === 0) {
        const defaults = DEFAULT_GOALS.map(makeGoal)
        await Promise.all(defaults.map(g => db.goals.upsert(g)))
        set({ goals: defaults })
      } else {
        set({ goals })
      }
    } catch (err) {
      console.error('[goals] load:', err)
    } finally {
      set({ loading: false })
    }
  },

  add: (data) => {
    const goal = makeGoal(data)
    set(s => ({ goals: [...s.goals, goal] }))
    db.goals.upsert(goal).catch(err => console.error('[goals] add:', err))
    return goal
  },

  update: (id, data) => {
    const goals = get().goals.map(g =>
      g.id === id ? { ...g, ...data, updatedAt: new Date().toISOString() } : g
    )
    set({ goals })
    const updated = goals.find(g => g.id === id)
    if (updated) db.goals.upsert(updated).catch(err => console.error('[goals] update:', err))
  },

  remove: (id) => {
    set(s => ({ goals: s.goals.filter(g => g.id !== id) }))
    db.goals.delete(id).catch(err => console.error('[goals] remove:', err))
  },
}))

// ─── Progress helpers ────────────────────────────────────────────────────────

function getWeekRangeDates(): { start: string; end: string } {
  const now = new Date()
  const day = now.getDay()
  const diffToMon = day === 0 ? -6 : 1 - day
  const mon = new Date(now)
  mon.setDate(now.getDate() + diffToMon)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  return { start: fmt(mon), end: fmt(sun) }
}

function getMonthRangeDates(): { start: string; end: string } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const lastDay = new Date(year, month + 1, 0).getDate()
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    start: `${year}-${pad(month + 1)}-01`,
    end:   `${year}-${pad(month + 1)}-${pad(lastDay)}`,
  }
}

function toDateStr(iso?: string): string {
  if (!iso) return ''
  return iso.split('T')[0]
}

import { Task, Sale } from '../types'

export function calcProgress(goal: Goal, tasks: Task[], sales: Sale[]): number {
  if (goal.category === 'venda') {
    const { start, end } = getMonthRangeDates()
    return sales.filter(s => s.date >= start && s.date <= end).length
  }

  const { start, end } = goal.period === 'weekly' ? getWeekRangeDates() : getMonthRangeDates()

  return tasks.filter(t => {
    if (t.status !== 'done') return false
    if (t.category !== (goal.category as GoalCategory)) return false
    const dateStr = toDateStr(t.completedAt) || toDateStr(t.updatedAt)
    return dateStr >= start && dateStr <= end
  }).length
}

// Conta visitas AGENDADAS no período (qualquer status exceto cancelado)
export function calcScheduledVisits(tasks: Task[], period: 'weekly' | 'monthly'): number {
  const { start, end } = period === 'weekly' ? getWeekRangeDates() : getMonthRangeDates()
  return tasks.filter(t => {
    if (t.category !== 'visita') return false
    if (t.status === 'cancelled') return false
    const dateStr = toDateStr(t.createdAt)
    return dateStr >= start && dateStr <= end
  }).length
}
