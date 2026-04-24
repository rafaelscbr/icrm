import { create } from 'zustand'
import { Sale } from '../types'
import { generateId } from '../lib/formatters'
import { isInPeriod } from './usePeriodStore'
import { db } from '../lib/db'

interface SalesStore {
  sales: Sale[]
  loading: boolean
  load: () => Promise<void>
  add: (data: Omit<Sale, 'id' | 'createdAt'>) => Sale
  update: (id: string, data: Partial<Sale>) => void
  remove: (id: string) => void
  // Métodos legados (mês atual do sistema — mantidos para retrocompatibilidade)
  getThisMonth: () => Sale[]
  getTotalValue: () => number
  getThisMonthValue: () => number
  // Métodos que aceitam período arbitrário (year/month 0-indexed)
  getByPeriod:      (year: number, month: number) => Sale[]
  getValueByPeriod: (year: number, month: number) => number
}

export const useSalesStore = create<SalesStore>((set, get) => ({
  sales: [],
  loading: false,

  load: async () => {
    set({ loading: true })
    try {
      const sales = await db.sales.fetchAll()
      set({ sales })
    } catch (err) {
      console.error('[sales] load:', err)
    } finally {
      set({ loading: false })
    }
  },

  add: (data) => {
    const sale: Sale = { ...data, id: generateId(), createdAt: new Date().toISOString() }
    set(s => ({ sales: [sale, ...s.sales] }))
    db.sales.upsert(sale).catch(err => console.error('[sales] add:', err))
    return sale
  },

  update: (id, data) => {
    const sales = get().sales.map(s => s.id === id ? { ...s, ...data } : s)
    set({ sales })
    const updated = sales.find(s => s.id === id)
    if (updated) db.sales.upsert(updated).catch(err => console.error('[sales] update:', err))
  },

  remove: (id) => {
    set(s => ({ sales: s.sales.filter(s => s.id !== id) }))
    db.sales.delete(id).catch(err => console.error('[sales] remove:', err))
  },

  // ── Período arbitrário ────────────────────────────────────────────────────

  getByPeriod: (year, month) =>
    get().sales.filter(s => isInPeriod(s.date, year, month)),

  getValueByPeriod: (year, month) =>
    get().sales
      .filter(s => isInPeriod(s.date, year, month))
      .reduce((acc, s) => acc + s.value, 0),

  // ── Legado (mês corrente) ─────────────────────────────────────────────────

  getThisMonth: () => {
    const n = new Date()
    return get().getByPeriod(n.getFullYear(), n.getMonth())
  },

  getTotalValue: () => get().sales.reduce((acc, s) => acc + s.value, 0),

  getThisMonthValue: () => {
    const n = new Date()
    return get().getValueByPeriod(n.getFullYear(), n.getMonth())
  },
}))
