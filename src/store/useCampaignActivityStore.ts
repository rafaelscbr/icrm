/**
 * useCampaignActivityStore
 *
 * Registra tudo que acontece numa campanha: disparos, mudanças de etapa,
 * transferências e delegações.
 *
 * Arquitetura: banco como fonte de verdade. O log é append-only, então o
 * INSERT do realtime pode ser aplicado direto (sem race condition possível);
 * o polling do ActivityTab segue como fallback se o socket cair.
 */

import { create } from 'zustand'
import { CampaignActivity, CampaignActivityType } from '../types'
import { db } from '../lib/db'
import { supabase } from '../lib/supabase'

interface CampaignActivityStore {
  activities: CampaignActivity[]
  loading: boolean
  allLoaded: boolean
  /** Carrega atividades de uma campanha a partir de uma data (ou tudo) */
  loadForCampaign: (campaignId: string, since?: string) => Promise<void>
  /** Carrega atividades de todas as campanhas (contagem de performance) */
  loadAll: () => Promise<void>
  /** Assina realtime do log — INSERTs entram direto (append-only) */
  subscribe: () => () => void
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

  // ── Realtime ─────────────────────────────────────────────────────────────────
  subscribe: () => {
    const channelName = 'campaign-activity-realtime'
    if (supabase.getChannels().some(c => c.topic === `realtime:${channelName}`)) return () => {}

    let disposed = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let channel: ReturnType<typeof buildChannel> | null = null

    const buildChannel = () => supabase
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'campaign_activity_log' }, (payload) => {
        const r = payload.new as Record<string, unknown>
        set(s => {
          if (s.activities.some(a => a.id === r.id)) return s
          const activity: CampaignActivity = {
            id:         r.id as string,
            campaignId: r.campaign_id as string,
            leadId:     (r.lead_id     as string | null) ?? undefined,
            leadName:   (r.lead_name   as string | null) ?? undefined,
            brokerId:   (r.broker_id   as string | null) ?? undefined,
            brokerName: (r.broker_name as string | null) ?? undefined,
            actionType: r.action_type as CampaignActivityType,
            metadata:   (r.metadata as Record<string, unknown> | null) ?? undefined,
            createdAt:  r.created_at as string,
          }
          return { activities: [activity, ...s.activities] }
        })
      })

    const connect = () => {
      if (disposed) return
      channel = buildChannel()
      channel.subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (disposed) return
          if (channel) { supabase.removeChannel(channel); channel = null }
          if (retryTimer) clearTimeout(retryTimer)
          retryTimer = setTimeout(connect, 4000)
        }
      })
    }
    connect()

    return () => {
      disposed = true
      if (retryTimer) clearTimeout(retryTimer)
      if (channel) supabase.removeChannel(channel)
    }
  },

  getForCampaign: (campaignId) =>
    get().activities.filter(a => a.campaignId === campaignId),

  getAll: () => get().activities,
}))
