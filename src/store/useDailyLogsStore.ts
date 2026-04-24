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

/** Retorna YYYY-MM-DD no fuso local do dispositivo (não UTC). */
function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function todayStr() {
  return localDateStr()
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
      const raw = await db.dailyLogs.fetchAll()

      // ── Deduplicar por data ──────────────────────────────────────────────────
      // A ausência de UNIQUE constraint em "date" permitia que múltiplos registros
      // fossem criados para o mesmo dia (bug do getTodayLog() no render + onConflict errado).
      // Mantém o registro mais completo por data: preferência a closed > mais dados > mais recente.
      const byDate = new Map<string, DailyLog>()
      for (const log of raw) {
        const prev = byDate.get(log.date)
        if (!prev) {
          byDate.set(log.date, log)
        } else {
          const prevScore = (prev.closed ? 200 : 0) + prev.newLeads + prev.ownerCalls + (prev.funnelFollowup ? 1 : 0)
          const logScore  = (log.closed  ? 200 : 0) + log.newLeads  + log.ownerCalls  + (log.funnelFollowup  ? 1 : 0)
          // Empate: prefere o mais recente
          if (logScore > prevScore || (logScore === prevScore && log.updatedAt > prev.updatedAt)) {
            byDate.set(log.date, log)
          }
        }
      }

      const logs = Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date))

      // ── Garante log de hoje ──────────────────────────────────────────────────
      // Criado aqui (após fetch), NUNCA durante o render — evita duplicatas.
      const today = todayStr()
      if (!byDate.has(today)) {
        const log = createLog(today)
        logs.unshift(log)
        db.dailyLogs.upsert(log).catch(() => toast.error('Erro ao criar registro do dia'))
      }

      set({ logs })
    } catch (err) {
      console.error('[dailyLogs] load:', err)
    } finally {
      set({ loading: false })
    }
  },

  getTodayLog: () => {
    const today = todayStr()
    // Apenas lê o store — nunca cria durante o render (evita duplicatas no banco).
    // Se ainda não carregou (loading), retorna placeholder sem salvar.
    return get().logs.find(l => l.date === today) ?? createLog(today)
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

/** Exportado para usar nas telas que precisam de datas locais. */
export { localDateStr }
