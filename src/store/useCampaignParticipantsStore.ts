import { create } from 'zustand'
import { CampaignParticipant, CampaignParticipantRole } from '../types'
import { generateId } from '../lib/formatters'
import { db } from '../lib/db'

interface CampaignParticipantsStore {
  participants: CampaignParticipant[]
  loading: boolean
  loadForCampaign: (campaignId: string) => Promise<void>
  add: (campaignId: string, brokerId: string, brokerRole?: CampaignParticipantRole) => Promise<void>
  remove: (id: string) => Promise<void>
  getForCampaign: (campaignId: string) => CampaignParticipant[]
}

export const useCampaignParticipantsStore = create<CampaignParticipantsStore>((set, get) => ({
  participants: [],
  loading: false,

  loadForCampaign: async (campaignId) => {
    set({ loading: true })
    try {
      const list = await db.campaignParticipants.fetchForCampaign(campaignId)
      // Merge: preserva participantes de outras campanhas já em memória
      set(s => {
        const others = s.participants.filter(p => p.campaignId !== campaignId)
        return { participants: [...others, ...list] }
      })
    } catch (err) {
      console.error('[participants] load:', err)
    } finally {
      set({ loading: false })
    }
  },

  add: async (campaignId, brokerId, brokerRole = 'collaborator') => {
    const existing = get().participants.find(
      p => p.campaignId === campaignId && p.brokerId === brokerId
    )
    if (existing) return
    const p: CampaignParticipant = {
      id:         generateId(),
      campaignId,
      brokerId,
      role:       brokerRole,
      addedAt:    new Date().toISOString(),
    }
    set(s => ({ participants: [...s.participants, p] }))
    await db.campaignParticipants.upsert(p)
  },

  remove: async (id) => {
    set(s => ({ participants: s.participants.filter(p => p.id !== id) }))
    await db.campaignParticipants.delete(id)
  },

  getForCampaign: (campaignId) =>
    get().participants.filter(p => p.campaignId === campaignId),
}))
