import { create } from 'zustand'
import { Goal, GoalCategory } from '../types'
import { generateId } from '../lib/formatters'
import { db } from '../lib/db'

const DEFAULT_GOALS: Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { name: 'Visitas semanais',        category: 'visita',       target: 2, period: 'weekly',  active: true },
  { name: 'Visitas mensais',         category: 'visita',       target: 8, period: 'monthly', active: true },
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
      let goals = await db.goals.fetchAll()
      if (goals.length === 0) {
        const defaults = DEFAULT_GOALS.map(makeGoal)
        await Promise.all(defaults.map(g => db.goals.upsert(g)))
        goals = defaults
      } else {
        // Migration: weekly agenciamento target was incorrectly set to 8 (that's the monthly value)
        const wrong = goals.find(g => g.category === 'agenciamento' && g.period === 'weekly' && g.target === 8)
        if (wrong) {
          const fixed = { ...wrong, target: 2, updatedAt: new Date().toISOString() }
          await db.goals.upsert(fixed)
          goals = goals.map(g => g.id === wrong.id ? fixed : g)
        }
      }
      set({ goals })
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

/** Formata Date para YYYY-MM-DD usando fuso LOCAL (não UTC). */
function localFmt(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getWeekRangeDates(): { start: string; end: string } {
  const now = new Date()
  const day = now.getDay()
  const diffToMon = day === 0 ? -6 : 1 - day
  const mon = new Date(now)
  mon.setDate(now.getDate() + diffToMon)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  return { start: localFmt(mon), end: localFmt(sun) }
}

function getMonthRangeDates(): { start: string; end: string } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const pad = (n: number) => String(n).padStart(2, '0')
  const lastDay = new Date(year, month + 1, 0).getDate()
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

/** Computes progress for any goal within an explicit YYYY-MM-DD date range. */
export function calcProgressForRange(goal: Goal, tasks: Task[], sales: Sale[], start: string, end: string): number {
  if (goal.category === 'venda') {
    return sales.filter(s => s.date >= start && s.date <= end).length
  }
  return tasks.filter(t => {
    if (t.status !== 'done') return false
    if (t.category !== (goal.category as GoalCategory)) return false
    const dateStr = toDateStr(t.dueDate) || toDateStr(t.completedAt)
    if (!dateStr) return false
    return dateStr >= start && dateStr <= end
  }).length
}

export function calcProgress(goal: Goal, tasks: Task[], sales: Sale[]): number {
  if (goal.category === 'venda') {
    const { start, end } = getMonthRangeDates()
    return sales.filter(s => s.date >= start && s.date <= end).length
  }

  const { start, end } = goal.period === 'weekly' ? getWeekRangeDates() : getMonthRangeDates()

  return tasks.filter(t => {
    if (t.status !== 'done') return false
    if (t.category !== (goal.category as GoalCategory)) return false
    // Semana: somente dueDate (data real agendada da tarefa).
    // Mês: dueDate ou completedAt — nunca updatedAt, pois updatedAt muda
    // toda vez que a tarefa é editada e infla o contador indevidamente.
    const dateStr = goal.period === 'weekly'
      ? toDateStr(t.dueDate)
      : toDateStr(t.dueDate) || toDateStr(t.completedAt)
    if (!dateStr) return false
    return dateStr >= start && dateStr <= end
  }).length
}

// Conta visitas AGENDADAS no período (qualquer status exceto cancelado)
export function calcScheduledVisits(tasks: Task[], period: 'weekly' | 'monthly'): number {
  const { start, end } = period === 'weekly' ? getWeekRangeDates() : getMonthRangeDates()
  return tasks.filter(t => {
    if (t.category !== 'visita') return false
    if (t.status === 'cancelled') return false
    const dateStr = toDateStr(t.dueDate) || toDateStr(t.createdAt)
    return dateStr >= start && dateStr <= end
  }).length
}

// Retorna todas as métricas de visita de uma só vez
export function getVisitMetrics(tasks: Task[]) {
  const week  = getWeekRangeDates()
  const month = getMonthRangeDates()

  const visitTasks = tasks.filter(t => t.category === 'visita')

  return {
    // Todas as visitas agendadas no mês (qualquer status exceto cancelado)
    agendadasMes: visitTasks.filter(t => {
      if (t.status === 'cancelled') return false
      const d = toDateStr(t.dueDate) || toDateStr(t.createdAt)
      return d >= month.start && d <= month.end
    }).length,

    // Visitas realizadas na semana: usa APENAS dueDate (data real da visita).
    realizadasSemana: visitTasks.filter(t => {
      if (t.status !== 'done') return false
      const d = toDateStr(t.dueDate)
      if (!d) return false
      return d >= week.start && d <= week.end
    }).length,

    // Visitas realizadas no mês: dueDate ou completedAt (nunca updatedAt).
    realizadasMes: visitTasks.filter(t => {
      if (t.status !== 'done') return false
      const d = toDateStr(t.dueDate) || toDateStr(t.completedAt)
      if (!d) return false
      return d >= month.start && d <= month.end
    }).length,
  }
}
