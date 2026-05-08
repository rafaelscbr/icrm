import { create } from 'zustand'
import { LeadInteraction } from '../types'
import { generateId } from '../lib/formatters'
import { db } from '../lib/db'

interface LeadInteractionsStore {
  byLead:      Record<string, LeadInteraction[]>
  loaded:      Set<string>
  loadForLead: (leadId: string) => Promise<void>
  add:         (data: Omit<LeadInteraction, 'id' | 'createdAt'>) => LeadInteraction
  remove:      (id: string, leadId: string) => void
  getForLead:  (leadId: string) => LeadInteraction[]
}

export const useLeadInteractionsStore = create<LeadInteractionsStore>((set, get) => ({
  byLead: {},
  loaded: new Set(),

  loadForLead: async (leadId) => {
    if (get().loaded.has(leadId)) return
    try {
      const items = await db.leadInteractions.fetchForLead(leadId)
      set(s => ({
        byLead: { ...s.byLead, [leadId]: items },
        loaded: new Set([...s.loaded, leadId]),
      }))
    } catch {
      // error already toasted by db layer
    }
  },

  add: (data) => {
    const now = new Date().toISOString()
    const item: LeadInteraction = { ...data, id: generateId(), createdAt: now }
    set(s => ({
      byLead: {
        ...s.byLead,
        [data.leadId]: [item, ...(s.byLead[data.leadId] ?? [])],
      },
    }))
    db.leadInteractions.upsert(item).catch(err => console.error('[interactions] add:', err))
    return item
  },

  remove: (id, leadId) => {
    set(s => ({
      byLead: {
        ...s.byLead,
        [leadId]: (s.byLead[leadId] ?? []).filter(i => i.id !== id),
      },
    }))
    db.leadInteractions.delete(id).catch(err => console.error('[interactions] remove:', err))
  },

  getForLead: (leadId) => get().byLead[leadId] ?? [],
}))
