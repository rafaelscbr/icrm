import { create } from 'zustand'
import { LeadInteraction, LeadInteractionType, LeadInteractionOutcome } from '../types'
import { generateId } from '../lib/formatters'
import { db } from '../lib/db'
import { supabase } from '../lib/supabase'

interface LeadInteractionsStore {
  byLead:            Record<string, LeadInteraction[]>
  loaded:            Set<string>
  allLoaded:         boolean
  loadForLead:       (leadId: string) => Promise<void>
  loadAll:           () => Promise<void>
  subscribe:         () => () => void
  add:               (data: Omit<LeadInteraction, 'id' | 'createdAt'>) => LeadInteraction
  remove:            (id: string, leadId: string) => void
  getForLead:        (leadId: string) => LeadInteraction[]
  getAllInteractions: () => LeadInteraction[]
}

export const useLeadInteractionsStore = create<LeadInteractionsStore>((set, get) => ({
  byLead: {},
  loaded: new Set(),
  allLoaded: false,

  loadAll: async () => {
    if (get().allLoaded) return
    try {
      const items = await db.leadInteractions.fetchAll()
      const byLead: Record<string, LeadInteraction[]> = {}
      items.forEach(i => {
        if (!byLead[i.leadId]) byLead[i.leadId] = []
        byLead[i.leadId].push(i)
      })
      set(s => ({ byLead: { ...s.byLead, ...byLead }, allLoaded: true }))
    } catch {
      // error already toasted by db layer
    }
  },

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

  subscribe: () => {
    const channelName = 'lead-interactions-realtime'
    const existing = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`)
    if (existing) return () => {}

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lead_interactions' }, (payload) => {
        const r = payload.new as Record<string, unknown>
        const item: LeadInteraction = {
          id: r.id as string,
          leadId: r.lead_id as string,
          type: r.type as LeadInteractionType,
          description: (r.description as string | null) ?? undefined,
          outcome: r.outcome ? (r.outcome as LeadInteractionOutcome) : undefined,
          interactedAt: r.interacted_at as string,
          createdAt: r.created_at as string,
          brokerId: (r.broker_id as string | null) ?? undefined,
        }
        set(s => {
          const leadItems = s.byLead[item.leadId] ?? []
          if (leadItems.some(i => i.id === item.id)) return s
          return {
            byLead: {
              ...s.byLead,
              [item.leadId]: [item, ...leadItems],
            },
          }
        })
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'lead_interactions' }, (payload) => {
        const r = payload.old as Record<string, unknown>
        const id = r.id as string
        const leadId = r.lead_id as string
        set(s => ({
          byLead: {
            ...s.byLead,
            [leadId]: (s.byLead[leadId] ?? []).filter(i => i.id !== id),
          },
        }))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
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

  getForLead:        (leadId) => get().byLead[leadId] ?? [],
  getAllInteractions: ()       => Object.values(get().byLead).flat(),
}))
