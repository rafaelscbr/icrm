import { create } from 'zustand'
import { Property, PropertyStatus } from '../types'
import { generateId } from '../lib/formatters'
import { db } from '../lib/db'

interface PropertiesStore {
  properties: Property[]
  loading: boolean
  load: () => Promise<void>
  add: (data: Omit<Property, 'id' | 'createdAt' | 'updatedAt'>) => Property
  update: (id: string, data: Partial<Property>) => void
  remove: (id: string) => void
  getById: (id: string) => Property | undefined
  search: (query: string) => Property[]
  filterByStatus: (status: PropertyStatus | null) => Property[]
}

export const usePropertiesStore = create<PropertiesStore>((set, get) => ({
  properties: [],
  loading: false,

  load: async () => {
    set({ loading: true })
    try {
      const properties = await db.properties.fetchAll()
      set({ properties })
    } catch (err) {
      console.error('[properties] load:', err)
    } finally {
      set({ loading: false })
    }
  },

  add: (data) => {
    const now = new Date().toISOString()
    const property: Property = { ...data, id: generateId(), createdAt: now, updatedAt: now }
    set(s => ({ properties: [property, ...s.properties] }))
    db.properties.upsert(property).catch(err => console.error('[properties] add:', err))
    return property
  },

  update: (id, data) => {
    const now = new Date().toISOString()
    const properties = get().properties.map(p =>
      p.id === id ? { ...p, ...data, updatedAt: now } : p
    )
    set({ properties })
    const updated = properties.find(p => p.id === id)
    if (updated) db.properties.upsert(updated).catch(err => console.error('[properties] update:', err))
  },

  remove: (id) => {
    set(s => ({ properties: s.properties.filter(p => p.id !== id) }))
    db.properties.delete(id).catch(err => console.error('[properties] remove:', err))
  },

  getById: (id) => get().properties.find(p => p.id === id),

  search: (query) => {
    const q = query.toLowerCase()
    return get().properties.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.neighborhood.toLowerCase().includes(q)
    )
  },

  filterByStatus: (status) => {
    if (!status) return get().properties
    return get().properties.filter(p => p.status === status)
  },
}))
