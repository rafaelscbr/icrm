import { create } from 'zustand'
import { Campaign, CampaignStatus } from '../types'
import { generateId } from '../lib/formatters'
import { db } from '../lib/db'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

interface CampaignsStore {
  campaigns: Campaign[]
  loading: boolean
  load: () => Promise<void>
  /** Assina realtime de campaigns — qualquer evento recarrega (tabela pequena) */
  subscribe: () => () => void
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

  // ── Realtime ─────────────────────────────────────────────────────────────────
  // Tabela pequena (poucas campanhas) — qualquer evento recarrega do banco.
  subscribe: () => {
    const channelName = 'campaigns-realtime'
    if (supabase.getChannels().some(c => c.topic === `realtime:${channelName}`)) return () => {}

    let disposed = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let syncTimer: ReturnType<typeof setTimeout> | null = null
    let channel: ReturnType<typeof buildChannel> | null = null

    const scheduleSync = () => {
      if (syncTimer) return
      syncTimer = setTimeout(() => {
        syncTimer = null
        useCampaignsStore.getState().load()
      }, 300)
    }

    const buildChannel = () => supabase
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'campaigns' }, scheduleSync)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'campaigns' }, scheduleSync)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'campaigns' }, (payload) => {
        const id = (payload.old as { id: string }).id
        set(s => ({ campaigns: s.campaigns.filter(c => c.id !== id) }))
      })

    const connect = (isReconnect: boolean) => {
      if (disposed) return
      channel = buildChannel()
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (isReconnect) useCampaignsStore.getState().load()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (disposed) return
          if (channel) { supabase.removeChannel(channel); channel = null }
          if (retryTimer) clearTimeout(retryTimer)
          retryTimer = setTimeout(() => connect(true), 4000)
        }
      })
    }
    connect(false)

    return () => {
      disposed = true
      if (retryTimer) clearTimeout(retryTimer)
      if (syncTimer)  clearTimeout(syncTimer)
      if (channel) supabase.removeChannel(channel)
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
