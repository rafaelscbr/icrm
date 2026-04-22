import { create } from 'zustand'
import { CampaignLead, FunnelStage, LeadSituation } from '../types'
import { generateId } from '../lib/formatters'
import { db } from '../lib/db'

type NewLead = Omit<CampaignLead, 'id' | 'funnelStage' | 'createdAt' | 'updatedAt'>

interface CampaignLeadsStore {
  leads: CampaignLead[]
  loading: boolean
  load: () => Promise<void>
  addBulk: (data: NewLead[]) => { added: number; skipped: number }
  add: (data: NewLead) => CampaignLead
  update: (id: string, data: Partial<CampaignLead>) => void
  remove: (id: string) => void
  removeForCampaign: (campaignId: string) => void
  setStage: (id: string, stage: FunnelStage, extra?: Partial<CampaignLead>) => void
  setSituation: (id: string, situation: LeadSituation | undefined) => void
  markContacted: (id: string) => void
  getForCampaign: (campaignId: string) => CampaignLead[]
}

export const useCampaignLeadsStore = create<CampaignLeadsStore>((set, get) => ({
  leads: [],
  loading: false,

  load: async () => {
    set({ loading: true })
    try {
      const leads = await db.campaignLeads.fetchAll()
      set({ leads })
    } catch (err) {
      console.error('[campaignLeads] load:', err)
    } finally {
      set({ loading: false })
    }
  },

  addBulk: (data) => {
    const now = new Date().toISOString()
    const existing = get().leads
    const created: CampaignLead[] = []
    let skipped = 0

    for (const d of data) {
      const phone = d.phone.replace(/\D/g, '')
      const dup = existing.find(
        l => l.campaignId === d.campaignId && l.phone.replace(/\D/g, '') === phone
      )
      if (dup) { skipped++; continue }
      created.push({ ...d, id: generateId(), funnelStage: 'new', createdAt: now, updatedAt: now })
    }

    const leads = [...existing, ...created]
    set({ leads })
    if (created.length > 0) {
      db.campaignLeads.upsertMany(created).catch(err => console.error('[campaignLeads] addBulk:', err))
    }
    return { added: created.length, skipped }
  },

  add: (data) => {
    const now = new Date().toISOString()
    const lead: CampaignLead = { ...data, id: generateId(), funnelStage: 'new', createdAt: now, updatedAt: now }
    set(s => ({ leads: [...s.leads, lead] }))
    db.campaignLeads.upsert(lead).catch(err => console.error('[campaignLeads] add:', err))
    return lead
  },

  update: (id, data) => {
    const leads = get().leads.map(l =>
      l.id === id ? { ...l, ...data, updatedAt: new Date().toISOString() } : l
    )
    set({ leads })
    const updated = leads.find(l => l.id === id)
    if (updated) db.campaignLeads.upsert(updated).catch(err => console.error('[campaignLeads] update:', err))
  },

  remove: (id) => {
    set(s => ({ leads: s.leads.filter(l => l.id !== id) }))
    db.campaignLeads.delete(id).catch(err => console.error('[campaignLeads] remove:', err))
  },

  removeForCampaign: (campaignId) => {
    set(s => ({ leads: s.leads.filter(l => l.campaignId !== campaignId) }))
    db.campaignLeads.deleteForCampaign(campaignId).catch(err => console.error('[campaignLeads] removeForCampaign:', err))
  },

  setStage: (id, stage, extra) => {
    get().update(id, { funnelStage: stage, ...extra })
  },

  setSituation: (id, situation) => {
    get().update(id, { situation })
  },

  markContacted: (id) => {
    const lead = get().leads.find(l => l.id === id)
    if (!lead) return
    const patch: Partial<CampaignLead> = {}
    if (!lead.firstContactAt) patch.firstContactAt = new Date().toISOString()
    if (lead.funnelStage === 'new') patch.funnelStage = 'sent'
    if (Object.keys(patch).length) get().update(id, patch)
  },

  getForCampaign: (campaignId) =>
    get().leads.filter(l => l.campaignId === campaignId),
}))
