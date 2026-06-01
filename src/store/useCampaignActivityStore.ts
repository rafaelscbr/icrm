import { create } from 'zustand'
import { CampaignActivity } from '../types'
import { db } from '../lib/db'
import { supabase } from '../lib/supabase'

interface CampaignActivityStore {
  activities: CampaignActivity[]
  loading: boolean
  loadForCampaign: (campaignId: string) => Promise<void>
  subscribe: (campaignId: string) => () => void
  getForCampaign: (campaignId: string) => CampaignActivity[]
}

export const useCampaignActivityStore = create<CampaignActivityStore>((set, get) => ({
  activities: [],
  loading: false,

  loadForCampaign: async (campaignId) => {
    set({ loading: true })
    try {
      const list = await db.campaignActivity.fetchForCampaign(campaignId)
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

  subscribe: (campaignId) => {
    const channelName = `campaign-activity-${campaignId}`
    const existing = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`)
    if (existing) return () => {}

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'campaign_activity_log',
          filter: `campaign_id=eq.${campaignId}` },
        (payload) => {
          const r = payload.new as {
            id: string; campaign_id: string; lead_id: string | null; lead_name: string | null
            broker_id: string | null; broker_name: string | null
            action_type: string; metadata: Record<string, unknown> | null; created_at: string
          }
          const activity: CampaignActivity = {
            id:          r.id,
            campaignId:  r.campaign_id,
            leadId:      r.lead_id    ?? undefined,
            leadName:    r.lead_name  ?? undefined,
            brokerId:    r.broker_id  ?? undefined,
            brokerName:  r.broker_name ?? undefined,
            actionType:  r.action_type as CampaignActivity['actionType'],
            metadata:    r.metadata   ?? undefined,
            createdAt:   r.created_at,
          }
          set(s => {
            if (s.activities.some(a => a.id === activity.id)) return s
            return { activities: [activity, ...s.activities] }
          })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  },

  getForCampaign: (campaignId) =>
    get().activities.filter(a => a.campaignId === campaignId),
}))
