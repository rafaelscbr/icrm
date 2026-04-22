import { create } from 'zustand'
import { Sale } from '../types'
import { generateId, isThisMonth } from '../lib/formatters'
import { db } from '../lib/db'

interface SalesStore {
  sales: Sale[]
  loading: boolean
  load: () => Promise<void>
  add: (data: Omit<Sale, 'id' | 'createdAt'>) => Sale
  update: (id: string, data: Partial<Sale>) => void
  remove: (id: string) => void
  getThisMonth: () => Sale[]
  getTotalValue: () => number
  getThisMonthValue: () => number
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

  getThisMonth: () => get().sales.filter(s => isThisMonth(s.date)),

  getTotalValue: () => get().sales.reduce((acc, s) => acc + s.value, 0),

  getThisMonthValue: () =>
    get().sales.filter(s => isThisMonth(s.date)).reduce((acc, s) => acc + s.value, 0),
}))
