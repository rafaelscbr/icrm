import { create } from 'zustand'
import { Sale } from '../types'
import { generateId } from '../lib/formatters'
import { matchesPeriod, rangeFromPreset } from './usePeriodStore'
import { db } from '../lib/db'

interface SalesStore {
  sales:   Sale[]
  loading: boolean
  load:    () => Promise<void>
  add:     (data: Omit<Sale, 'id' | 'createdAt'>) => Sale
  update:  (id: string, data: Partial<Sale>) => void
  remove:  (id: string) => void
  getByPeriod:      (start: string, end: string) => Sale[]
  getValueByPeriod: (start: string, end: string) => number
  getTotalValue:    () => number
  getThisMonth:     () => Sale[]
  getThisMonthValue: () => number
}

export const useSalesStore = create<SalesStore>((set, get) => ({
  sales:   [],
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

  getByPeriod: (start, end) =>
    get().sales.filter(s => matchesPeriod(s.date, start, end)),

  getValueByPeriod: (start, end) =>
    get().sales
      .filter(s => matchesPeriod(s.date, start, end))
      .reduce((acc, s) => acc + s.value, 0),

  getTotalValue: () => get().sales.reduce((acc, s) => acc + s.value, 0),

  getThisMonth: () => {
    const { startDate, endDate } = rangeFromPreset('this_month')
    return get().getByPeriod(startDate, endDate)
  },

  getThisMonthValue: () => {
    const { startDate, endDate } = rangeFromPreset('this_month')
    return get().getValueByPeriod(startDate, endDate)
  },
}))
