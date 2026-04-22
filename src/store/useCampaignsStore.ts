import { create } from 'zustand'
import { Campaign, CampaignStatus } from '../types'
import { generateId } from '../lib/formatters'
import { db } from '../lib/db'

interface CampaignsStore {
  campaigns: Campaign[]
  loading: boolean
  load: () => Promise<void>
  add: (data: Omit<Campaign, 'id' | 'createdAt' | 'updatedAt'>) => Campaign
  update: (id: string, data: Partial<Campaign>) => void
  remove: (id: string) => void
  setStatus: (id: string, status: CampaignStatus) => void
}

export const useCampaignsStore = create<CampaignsStore>((set, get) => ({
  campaigns: [],
  loading: false,

  load: async () => {
    set({ loading: true })
    try {
      const campaigns = await db.campaigns.fetchAll()
      set({ campaigns })
    } catch (err) {
      console.error('[campaigns] load:', err)
    } finally {
      set({ loading: false })
    }
  },

  add: (data) => {
    const now = new Date().toISOString()
    const campaign: Campaign = { ...data, id: generateId(), createdAt: now, updatedAt: now }
    set(s => ({ campaigns: [campaign, ...s.campaigns] }))
    db.campaigns.upsert(campaign).catch(err => console.error('[campaigns] add:', err))
    return campaign
  },

  update: (id, data) => {
    const campaigns = get().campaigns.map(c =>
      c.id === id ? { ...c, ...data, updatedAt: new Date().toISOString() } : c
    )
    set({ campaigns })
    const updated = campaigns.find(c => c.id === id)
    if (updated) db.campaigns.upsert(updated).catch(err => console.error('[campaigns] update:', err))
  },

  remove: (id) => {
    set(s => ({ campaigns: s.campaigns.filter(c => c.id !== id) }))
    db.campaigns.delete(id).catch(err => console.error('[campaigns] remove:', err))
  },

  setStatus: (id, status) => get().update(id, { status }),
}))
