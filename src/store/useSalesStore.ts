import { create } from 'zustand'
import { Sale } from '../types'
import { generateId } from '../lib/formatters'
import { matchesPeriod, rangeFromPreset } from './usePeriodStore'
import { db } from '../lib/db'
import { supabase } from '../lib/supabase'

const sortByDate = (sales: Sale[]) =>
  [...sales].sort((a, b) => b.date.localeCompare(a.date))

interface SalesStore {
  sales:   Sale[]
  loading: boolean
  load:    () => Promise<void>
  subscribe: () => () => void
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
      set({ sales: sortByDate(sales) })
    } catch (err) {
      console.error('[sales] load:', err)
    } finally {
      set({ loading: false })
    }
  },

  subscribe: () => {
    const channelName = 'sales-realtime'
    const existing = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`)
    if (existing) return () => {}

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sales' }, (payload) => {
        const r = payload.new as Record<string, unknown>
        const sale: Sale = {
          id: r.id as string,
          clientId: r.client_id as string,
          propertyId: (r.property_id as string | null) ?? undefined,
          propertyName: r.property_name as string,
          date: r.date as string,
          value: r.value as number,
          type: r.type as Sale['type'],
          notes: (r.notes as string | null) ?? undefined,
          commissionPct:   (r.commission_pct   as number | null) ?? undefined,
          commissionFixed: (r.commission_fixed as number | null) ?? undefined,
          brokerPct:       (r.broker_pct       as number | null) ?? undefined,
          brokerId:        (r.broker_id        as string | null) ?? undefined,
          createdAt: r.created_at as string,
        }
        set(s => s.sales.some(x => x.id === sale.id) ? s : { sales: sortByDate([sale, ...s.sales]) })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sales' }, (payload) => {
        const r = payload.new as Record<string, unknown>
        set(s => ({
          sales: sortByDate(s.sales.map(x => x.id !== r.id ? x : {
            ...x,
            clientId: r.client_id as string,
            propertyId: (r.property_id as string | null) ?? undefined,
            propertyName: r.property_name as string,
            date: r.date as string,
            value: r.value as number,
            type: r.type as Sale['type'],
            notes: (r.notes as string | null) ?? undefined,
            commissionPct:   (r.commission_pct   as number | null) ?? undefined,
            commissionFixed: (r.commission_fixed as number | null) ?? undefined,
            brokerPct:       (r.broker_pct       as number | null) ?? undefined,
            brokerId:        (r.broker_id        as string | null) ?? undefined,
          })),
        }))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'sales' }, (payload) => {
        const id = (payload.old as { id: string }).id
        set(s => ({ sales: s.sales.filter(x => x.id !== id) }))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  },

  add: (data) => {
    const sale: Sale = { ...data, id: generateId(), createdAt: new Date().toISOString() }
    set(s => ({ sales: sortByDate([sale, ...s.sales]) }))
    db.sales.upsert(sale).catch(err => console.error('[sales] add:', err))
    return sale
  },

  update: (id, data) => {
    const sales = sortByDate(get().sales.map(s => s.id === id ? { ...s, ...data } : s))
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
