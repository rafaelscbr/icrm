import { create } from 'zustand'
import toast from 'react-hot-toast'
import { DailyLog } from '../types'
import { generateId } from '../lib/formatters'
import { db } from '../lib/db'

interface DailyLogsStore {
  logs: DailyLog[]
  loading: boolean
  load: () => Promise<void>
  getTodayLog: () => DailyLog
  updateToday: (data: Partial<Pick<DailyLog, 'newLeads' | 'ownerCalls' | 'funnelFollowup' | 'notes'>>) => void
  closeDay: () => void
  reopenDay: () => void
  getLogsByRange: (start: string, end: string) => DailyLog[]
  upsertLog: (date: string, data: Partial<Pick<DailyLog, 'newLeads' | 'ownerCalls' | 'funnelFollowup' | 'notes' | 'closed'>>) => void
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function createLog(date: string): DailyLog {
  const now = new Date().toISOString()
  return {
    id: generateId(), date,
    newLeads: 0, ownerCalls: 0,
    funnelFollowup: false,
    closed: false,
    createdAt: now, updatedAt: now,
  }
}

export const useDailyLogsStore = create<DailyLogsStore>((set, get) => ({
  logs: [],
  loading: false,

  load: async () => {
    set({ loading: true })
    try {
      const logs = await db.dailyLogs.fetchAll()
      set({ logs })
    } catch (err) {
      console.error('[dailyLogs] load:', err)
    } finally {
      set({ loading: false })
    }
  },

  getTodayLog: () => {
    const today = todayStr()
    const existing = get().logs.find(l => l.date === today)
    if (existing) return existing
    const log = createLog(today)
    set(s => ({ logs: [log, ...s.logs] }))
    db.dailyLogs.upsert(log).catch(() => toast.error('Erro ao criar registro do dia'))
    return log
  },

  updateToday: (data) => {
    const today = todayStr()
    const now = new Date().toISOString()
    const logs = get().logs.map(l =>
      l.date === today && !l.closed ? { ...l, ...data, updatedAt: now } : l
    )
    set({ logs })
    const updated = logs.find(l => l.date === today)
    if (updated) db.dailyLogs.upsert(updated).catch(() => toast.error('Erro ao salvar alterações do dia'))
  },

  closeDay: () => {
    const today = todayStr()
    const now = new Date().toISOString()
    const logs = get().logs.map(l =>
      l.date === today ? { ...l, closed: true, closedAt: now, updatedAt: now } : l
    )
    set({ logs })
    const updated = logs.find(l => l.date === today)
    if (updated) {
      db.dailyLogs.upsert(updated)
        .then(() => toast.success('Dia fechado com sucesso!'))
        .catch(() => toast.error('Erro ao fechar o dia — tente novamente'))
    }
  },

  reopenDay: () => {
    const today = todayStr()
    const now = new Date().toISOString()
    const logs = get().logs.map(l =>
      l.date === today ? { ...l, closed: false, closedAt: undefined, updatedAt: now } : l
    )
    set({ logs })
    const updated = logs.find(l => l.date === today)
    if (updated) db.dailyLogs.upsert(updated).catch(() => toast.error('Erro ao reabrir o dia'))
  },

  getLogsByRange: (start, end) =>
    get().logs.filter(l => l.date >= start && l.date <= end),

  upsertLog: (date, data) => {
    const now = new Date().toISOString()
    const existing = get().logs.find(l => l.date === date)
    let logs: DailyLog[]
    let upserted: DailyLog
    if (existing) {
      upserted = { ...existing, ...data, updatedAt: now }
      logs = get().logs.map(l => l.date === date ? upserted : l)
    } else {
      upserted = { ...createLog(date), ...data, updatedAt: now }
      logs = [...get().logs, upserted]
    }
    set({ logs })
    db.dailyLogs.upsert(upserted).catch(() => toast.error('Erro ao salvar registro'))
  },
}))
