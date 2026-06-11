import { create } from 'zustand'
import { Campaign, CampaignStatus } from '../types'
import { generateId } from '../lib/formatters'
import { db } from '../lib/db'
import toast from 'react-hot-toast'

interface CampaignsStore {
  campaigns: Campaign[]
  loading: boolean
  load: () => Promise<void>
  add: (data: Omit<Campaign, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Campaign>
  update: (id: string, data: Partial<Campaign>) => Promise<void>
  remove: (id: string) => void
  setStatus: (id: string, status: CampaignStatus) => void
}

export const useCampaignsStore = create<CampaignsStore>((set, get) => ({
  campaigns: [],
  loading: false,

  load: async () => {
    // Spinner apenas no primeiro carregamento — revisitas mostram o dado em tela
    if (get().campaigns.length === 0) set({ loading: true })
    try {
      const campaigns = await db.campaigns.fetchAll()
      set({ campaigns })
    } catch (err) {
      console.error('[campaigns] load:', err)
    } finally {
      set({ loading: false })
    }
  },

  add: async (data) => {
    const now = new Date().toISOString()
    const campaign: Campaign = { ...data, id: generateId(), createdAt: now, updatedAt: now }
    await db.campaigns.upsert(campaign)
    set(s => ({ campaigns: [campaign, ...s.campaigns] }))
    return campaign
  },

  update: async (id, data) => {
    const snapshot = get().campaigns.find(c => c.id === id)
    if (!snapshot) return
    const updated = { ...snapshot, ...data, updatedAt: new Date().toISOString() }
    try {
      await db.campaigns.updateRow(updated)
      set(s => ({ campaigns: s.campaigns.map(c => c.id === id ? updated : c) }))
    } catch (err) {
      console.error('[campaigns] update:', err)
      toast.error('Erro ao salvar campanha. Verifique sua conexão e tente novamente.')
      throw err
    }
  },

  remove: (id) => {
    set(s => ({ campaigns: s.campaigns.filter(c => c.id !== id) }))
    db.campaigns.delete(id).catch(err => console.error('[campaigns] remove:', err))
  },

  setStatus: (id, status) => get().update(id, { status }),
}))
