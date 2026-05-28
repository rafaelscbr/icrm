import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { LocationData } from '../lib/geolocation'

export interface BrokerPresence {
  userId:         string
  name:           string
  role:           'admin' | 'broker'
  currentPage:    string
  city?:          string
  region?:        string
  country?:       string
  lat?:           number
  lng?:           number
  locationSource?: 'gps' | 'ip'
  lastSeen:       string
}

type TrackPayload = Omit<BrokerPresence, 'userId'>

const PAGE_LABELS: Record<string, string> = {
  '/':            'Dashboard',
  '/leads':       'Leads',
  '/contatos':    'Contatos',
  '/imoveis':     'Imóveis',
  '/vendas':      'Vendas',
  '/campanhas':   'Campanhas',
  '/tarefas':     'Tarefas',
  '/performance': 'Performance',
  '/permuta':     'Permuta',
  '/admin':       'Administração',
  '/admin/logs':  'Logs',
}

export function pageLabel(path: string): string {
  return PAGE_LABELS[path] ?? path
}

interface PresenceStore {
  channel:       RealtimeChannel | null
  onlineBrokers: BrokerPresence[]
  _payload:      TrackPayload | null
  init:          (userId: string, name: string, role: 'admin' | 'broker', location: LocationData) => Promise<void>
  updatePage:    (path: string) => Promise<void>
  cleanup:       () => Promise<void>
}

export const usePresenceStore = create<PresenceStore>((set, get) => ({
  channel:       null,
  onlineBrokers: [],
  _payload:      null,

  init: async (userId, name, role, location) => {
    const { channel: existing } = get()
    if (existing) { existing.unsubscribe() }

    const payload: TrackPayload = {
      name,
      role,
      currentPage:    window.location.pathname,
      city:           location.city,
      region:         location.region,
      country:        location.country,
      lat:            location.lat,
      lng:            location.lng,
      locationSource: location.source,
      lastSeen:       new Date().toISOString(),
    }

    set({ _payload: payload })

    const channel = supabase.channel('broker-presence', {
      config: { presence: { key: userId } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<TrackPayload>()
        // Para cada userId, pega apenas a entrada mais recente (evita duplicatas
        // quando o mesmo usuário tem múltiplas abas ou conexões antigas pendentes)
        const brokers: BrokerPresence[] = Object.entries(state).map(([uid, presences]) => {
          const arr = presences as TrackPayload[]
          const latest = arr.reduce((a, b) =>
            new Date(a.lastSeen) >= new Date(b.lastSeen) ? a : b
          )
          return { userId: uid, ...latest }
        })
        set({ onlineBrokers: brokers })
      })
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          await channel.track(payload)
        }
      })

    set({ channel })
  },

  updatePage: async (path) => {
    const { channel, _payload } = get()
    if (!channel || !_payload) return
    const updated: TrackPayload = { ..._payload, currentPage: path, lastSeen: new Date().toISOString() }
    set({ _payload: updated })
    await channel.track(updated)
  },

  cleanup: async () => {
    const { channel } = get()
    if (channel) {
      await channel.untrack()
      channel.unsubscribe()
      set({ channel: null, onlineBrokers: [], _payload: null })
    }
  },
}))
