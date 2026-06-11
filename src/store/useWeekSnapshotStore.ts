import { create } from 'zustand'
import { WeekSnapshot, WeekSnapshotEntry, Goal, Task, Sale } from '../types'
import { calcProgressForRange } from './useGoalsStore'
import { db } from '../lib/db'
import { getCurrentUserId } from '../lib/auth'

function localFmt(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getMondayOf(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const mon = new Date(d)
  mon.setDate(d.getDate() + diff)
  mon.setHours(0, 0, 0, 0)
  return mon
}

function getSundayOf(monday: Date): Date {
  const sun = new Date(monday)
  sun.setDate(monday.getDate() + 6)
  return sun
}

function computeScore(entries: WeekSnapshotEntry[]): number {
  if (entries.length === 0) return 0
  const sum = entries.reduce(
    (acc, e) => acc + Math.min(1, e.target > 0 ? e.achieved / e.target : 0),
    0
  )
  return Math.round((sum / entries.length) * 100)
}

interface WeekSnapshotStore {
  snapshots: WeekSnapshot[]
  loading:   boolean
  // Carrega histórico do banco para o usuário atual
  load:         (brokerId?: string) => Promise<void>
  // Verifica semanas passadas e salva no banco se ainda não estiverem registradas
  checkAndSave: (tasks: Task[], sales: Sale[], goals: Goal[]) => Promise<void>
}

export const useWeekSnapshotStore = create<WeekSnapshotStore>((set, get) => ({
  snapshots: [],
  loading:   false,

  load: async (brokerId?: string) => {
    const id = brokerId ?? getCurrentUserId()
    if (!id) return
    set({ loading: true })
    try {
      const snapshots = await db.weekSnapshots.fetchForBroker(id)
      set({ snapshots })
    } catch (err) {
      console.error('[weekSnapshots] load:', err)
    } finally {
      set({ loading: false })
    }
  },

  checkAndSave: async (tasks, sales, goals) => {
    const brokerId = getCurrentUserId()
    if (!brokerId) return

    // Acionamento fica fora do snapshot: o realizado vem de disparo_logs e não é
    // reconstituível retroativamente a partir de tasks/sales — gravaria 0 errado.
    const weeklyGoals = goals.filter(g => g.active && g.period === 'weekly' && g.category !== 'acionamento')
    if (weeklyGoals.length === 0) return

    // Find earliest date in the dataset so we don't snapshot empty pre-app weeks
    const allDates = [
      ...tasks.map(t => (t.dueDate || t.createdAt).split('T')[0]),
      ...sales.map(s => s.date),
    ].filter(Boolean).sort()
    const firstDate = allDates[0]
    if (!firstDate) return

    const existing = new Set(get().snapshots.map(s => s.id))
    const now = new Date()
    const thisMonday = getMondayOf(now)
    const newSnapshots: WeekSnapshot[] = []

    // Check up to 52 past weeks (never the current week)
    for (let i = 1; i <= 52; i++) {
      const monday = new Date(thisMonday)
      monday.setDate(thisMonday.getDate() - i * 7)
      const weekStart = localFmt(monday)

      // Skip weeks before the first recorded activity
      if (weekStart < firstDate.substring(0, 10)) break

      // ID is weekStart + brokerId for uniqueness across brokers
      const snapId = weekStart
      if (existing.has(snapId)) continue

      const sunday = getSundayOf(monday)
      const weekEnd = localFmt(sunday)

      const entries: WeekSnapshotEntry[] = weeklyGoals.map(goal => ({
        goalId:   goal.id,
        goalName: goal.name,
        category: goal.category,
        target:   goal.target,
        achieved: calcProgressForRange(goal, tasks, sales, weekStart, weekEnd),
      }))

      newSnapshots.push({
        id:       snapId,
        weekStart,
        weekEnd,
        entries,
        score:    computeScore(entries),
        savedAt:  now.toISOString(),
      })
    }

    if (newSnapshots.length === 0) return

    // Persiste no banco e atualiza o store
    await Promise.all(
      newSnapshots.map(snap =>
        db.weekSnapshots.upsert(snap, brokerId).catch(err =>
          console.error('[weekSnapshots] checkAndSave upsert:', err)
        )
      )
    )

    set(s => ({
      snapshots: [...s.snapshots, ...newSnapshots].sort(
        (a, b) => b.weekStart.localeCompare(a.weekStart)
      ),
    }))
  },
}))
