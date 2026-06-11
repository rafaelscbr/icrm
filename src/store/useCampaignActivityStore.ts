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
  allLoaded: boolean
  /** Carrega atividades de uma campanha a partir de uma data (ou tudo) */
  loadForCampaign: (campaignId: string, since?: string) => Promise<void>
  /** Carrega atividades de todas as campanhas (contagem de performance) */
  loadAll: () => Promise<void>
  getForCampaign: (campaignId: string) => CampaignActivity[]
  getAll: () => CampaignActivity[]
}

export const useCampaignActivityStore = create<CampaignActivityStore>((set, get) => ({
  activities: [],
  loading: false,
  allLoaded: false,

  loadAll: async () => {
    if (get().allLoaded) return
    set({ loading: true })
    try {
      const list = await db.campaignActivity.fetchAll()
      set({ activities: list, allLoaded: true })
    } catch (err) {
      console.error('[activity] loadAll:', err)
    } finally {
      set({ loading: false })
    }
  },

  loadForCampaign: async (campaignId, since) => {
    set({ loading: true })
    try {
      const list = await db.campaignActivity.fetchForCampaign(campaignId, 500, since)
      // Merge por id: o log é append-only, então a união preserva o que o
      // loadAll() já trouxe (contagem de performance) sem duplicar.
      set(s => {
        const ids = new Set(list.map(a => a.id))
        return { activities: [...list, ...s.activities.filter(a => !ids.has(a.id))] }
      })
    } catch (err) {
      console.error('[activity] load:', err)
    } finally {
      set({ loading: false })
    }
  },

  getForCampaign: (campaignId) =>
    get().activities.filter(a => a.campaignId === campaignId),

  getAll: () => get().activities,
}))
