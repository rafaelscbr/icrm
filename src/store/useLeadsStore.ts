import { create } from 'zustand'
import { Lead, LeadFunnelStage, LeadDiscardReason, LeadOrigin } from '../types'
import { generateId } from '../lib/formatters'
import { db } from '../lib/db'

interface LeadsStore {
  leads: Lead[]
  loading: boolean
  load: () => Promise<void>
  add: (data: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>) => Lead
  update: (id: string, data: Partial<Lead>) => void
  remove: (id: string) => void
  getById: (id: string) => Lead | undefined
  setStage: (id: string, stage: LeadFunnelStage) => void
  advanceFollowup: (id: string) => void
  discard: (id: string, reason: LeadDiscardReason) => void
  restore: (id: string) => void
  convertToContact: (id: string, contactId: string) => void
  search: (query: string) => Lead[]
  filterByStage: (stage: LeadFunnelStage | null) => Lead[]
  filterByOrigin: (origin: LeadOrigin | null) => Lead[]
  getActive: () => Lead[]
  getDiscarded: () => Lead[]
}

export const useLeadsStore = create<LeadsStore>((set, get) => ({
  leads: [],
  loading: false,

  load: async () => {
    set({ loading: true })
    try {
      const leads = await db.leads.fetchAll()
      set({ leads })
    } catch (err) {
      console.error('[leads] load:', err)
    } finally {
      set({ loading: false })
    }
  },

  add: (data) => {
    const now = new Date().toISOString()
    const lead: Lead = { ...data, id: generateId(), createdAt: now, updatedAt: now }
    set(s => ({ leads: [lead, ...s.leads] }))
    db.leads.upsert(lead).catch(err => console.error('[leads] add:', err))
    return lead
  },

  update: (id, data) => {
    const now = new Date().toISOString()
    const leads = get().leads.map(l =>
      l.id === id ? { ...l, ...data, updatedAt: now } : l
    )
    set({ leads })
    const updated = leads.find(l => l.id === id)
    if (updated) db.leads.upsert(updated).catch(err => console.error('[leads] update:', err))
  },

  remove: (id) => {
    set(s => ({ leads: s.leads.filter(l => l.id !== id) }))
    db.leads.delete(id).catch(err => console.error('[leads] remove:', err))
  },

  getById: (id) => get().leads.find(l => l.id === id),

  setStage: (id, stage) => {
    const now = new Date().toISOString()
    const leads = get().leads.map(l =>
      l.id === id
        ? { ...l, funnelStage: stage, followupStep: stage === 'followup' ? (l.followupStep || 1) : l.followupStep, updatedAt: now }
        : l
    )
    set({ leads })
    const updated = leads.find(l => l.id === id)
    if (updated) db.leads.upsert(updated).catch(err => console.error('[leads] setStage:', err))
  },

  advanceFollowup: (id) => {
    const now = new Date().toISOString()
    const lead = get().leads.find(l => l.id === id)
    if (!lead) return

    let nextStage: LeadFunnelStage = lead.funnelStage
    let nextStep = lead.followupStep

    if (lead.funnelStage === 'lead') {
      nextStage = 'followup'
      nextStep = 1
    } else if (lead.funnelStage === 'followup') {
      if (lead.followupStep < 5) {
        nextStep = lead.followupStep + 1
      }
      // if already at 5, stays at 5 — user manually advances to atendimento
    }

    const leads = get().leads.map(l =>
      l.id === id ? { ...l, funnelStage: nextStage, followupStep: nextStep, updatedAt: now } : l
    )
    set({ leads })
    const updated = leads.find(l => l.id === id)
    if (updated) db.leads.upsert(updated).catch(err => console.error('[leads] advanceFollowup:', err))
  },

  discard: (id, reason) => {
    const now = new Date().toISOString()
    const leads = get().leads.map(l =>
      l.id === id ? { ...l, discardReason: reason, discardedAt: now, updatedAt: now } : l
    )
    set({ leads })
    const updated = leads.find(l => l.id === id)
    if (updated) db.leads.upsert(updated).catch(err => console.error('[leads] discard:', err))
  },

  restore: (id) => {
    const now = new Date().toISOString()
    const leads = get().leads.map(l =>
      l.id === id ? { ...l, discardReason: undefined, discardedAt: undefined, updatedAt: now } : l
    )
    set({ leads })
    const updated = leads.find(l => l.id === id)
    if (updated) db.leads.upsert(updated).catch(err => console.error('[leads] restore:', err))
  },

  convertToContact: (id, contactId) => {
    const now = new Date().toISOString()
    const leads = get().leads.map(l =>
      l.id === id ? { ...l, contactId, convertedAt: now, updatedAt: now } : l
    )
    set({ leads })
    const updated = leads.find(l => l.id === id)
    if (updated) db.leads.upsert(updated).catch(err => console.error('[leads] convertToContact:', err))
  },

  search: (query) => {
    const q = query.toLowerCase()
    return get().leads.filter(l =>
      l.name.toLowerCase().includes(q) ||
      l.phone.includes(q) ||
      (l.email ?? '').toLowerCase().includes(q)
    )
  },

  filterByStage: (stage) => {
    if (!stage) return get().leads
    return get().leads.filter(l => l.funnelStage === stage)
  },

  filterByOrigin: (origin) => {
    if (!origin) return get().leads
    return get().leads.filter(l => l.origin === origin)
  },

  getActive: () => get().leads.filter(l => !l.discardReason),
  getDiscarded: () => get().leads.filter(l => !!l.discardReason),
}))
