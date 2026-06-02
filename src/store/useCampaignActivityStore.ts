/**
 * useCampaignActivityStore
 *
 * Registra tudo que acontece numa campanha: disparos, mudanças de etapa,
 * transferências e delegações.
 *
 * Arquitetura: banco como fonte de verdade + polling periódico.
 * Sem Supabase Realtime — consistente com a decisão do useCampaignLeadsStore.
 */

import { create } from 'zustand'
import { CampaignActivity } from '../types'
import { db } from '../lib/db'

interface CampaignActivityStore {
  activities: CampaignActivity[]
  loading: boolean
  /** Carrega atividades de uma campanha a partir de uma data (ou tudo) */
  loadForCampaign: (campaignId: string, since?: string) => Promise<void>
  getForCampaign: (campaignId: string) => CampaignActivity[]
}

export const useCampaignActivityStore = create<CampaignActivityStore>((set, get) => ({
  activities: [],
  loading: false,

  loadForCampaign: async (campaignId, since) => {
    set({ loading: true })
    try {
      const list = await db.campaignActivity.fetchForCampaign(campaignId, 500, since)
      set(s => {
        const others = s.activities.filter(a => a.campaignId !== campaignId)
        return { activities: [...list, ...others] }
      })
    } catch (err) {
      console.error('[activity] load:', err)
    } finally {
      set({ loading: false })
    }
  },

  getForCampaign: (campaignId) =>
    get().activities.filter(a => a.campaignId === campaignId),
}))
