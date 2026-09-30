import { create } from 'zustand'
import { LeadInteraction, LeadInteractionType, LeadInteractionOutcome } from '../types'
import { generateId } from '../lib/formatters'
import { db } from '../lib/db'
import { supabase } from '../lib/supabase'
import { getCurrentUserId } from '../lib/auth'

interface LeadInteractionsStore {
  /** Histórico completo por lead — alimenta a timeline, carregado sob demanda. */
  byLead:            Record<string, LeadInteraction[]>
  loaded:            Set<string>
  /**
   * Tudo que os corretores registraram, em todos os leads (sem as notas
   * automáticas do sistema) — base das métricas de Metas, Corretores e do
   * painel do funil. Só existe depois de loadAll().
   */
  todas:             LeadInteraction[]
  allLoaded:         boolean
  loadForLead:       (leadId: string) => Promise<void>
  loadAll:           () => Promise<void>
  /** Delta desde a última sync — reconciliação após reconexão ou volta à aba. */
  sincronizar:       () => Promise<void>
  subscribe:         () => () => void
  add:               (data: Omit<LeadInteraction, 'id' | 'createdAt'>) => Promise<LeadInteraction>
  remove:            (id: string, leadId: string) => Promise<void>
  getForLead:        (leadId: string) => LeadInteraction[]
  getAllInteractions: () => LeadInteraction[]
}

// ── Sync incremental de `todas` ───────────────────────────────────────────────
// A lista desce uma vez por sessão; depois, o realtime mantém ao vivo e a
// reconciliação busca só o que entrou (created_at) e o que foi excluído
// (deleted_rows, migração 075). Antes, cada volta para a aba rebaixava a
// tabela inteira — e o select sem paginação ainda cortava em 1.000 linhas.
let inflightSync: Promise<void> | null = null
let lastSyncAt: string | null = null
let lastDeleteSyncAt: string | null = null
let syncUserId: string | null = null
// created_at vem do relógio do navegador de quem registrou — folga generosa.
const SYNC_OVERLAP_MS = 60_000

const ms = (iso: string) => new Date(iso).getTime()
const recuar = (iso: string) => new Date(ms(iso) - SYNC_OVERLAP_MS).toISOString()

function maisRecente(atual: string | null, iso: string): string {
  return !atual || ms(iso) > ms(atual) ? iso : atual
}

export const useLeadInteractionsStore = create<LeadInteractionsStore>((set, get) => ({
  byLead: {},
  loaded: new Set(),
  todas: [],
  allLoaded: false,

  loadAll: () => {
    const userId = getCurrentUserId()
    if (get().allLoaded && syncUserId === userId) return Promise.resolve()
    if (inflightSync) return inflightSync
    inflightSync = (async () => {
      try {
        const todas = await db.leadInteractions.fetchDosCorretores()
        let marca: string | null = null
        for (const i of todas) marca = maisRecente(marca, i.createdAt)
        lastSyncAt = marca ?? new Date(0).toISOString()
        lastDeleteSyncAt = lastSyncAt
        syncUserId = userId
        set({ todas, allLoaded: true })
      } catch {
        // erro já exibido pela camada db
      } finally {
        inflightSync = null
      }
    })()
    return inflightSync
  },

  sincronizar: () => {
    if (!get().allLoaded || lastSyncAt === null) return Promise.resolve()
    // Outro usuário na mesma aba: o cache não é dele — recomeça do zero.
    if (syncUserId !== getCurrentUserId()) {
      set({ todas: [], allLoaded: false })
      return get().loadAll()
    }
    if (inflightSync) return inflightSync
    inflightSync = (async () => {
      try {
        const [novas, removidas] = await Promise.all([
          db.leadInteractions.fetchDosCorretores(recuar(lastSyncAt!)),
          db.leadInteractions.fetchDeletedSince(recuar(lastDeleteSyncAt ?? lastSyncAt!)),
        ])
        for (const i of novas)     lastSyncAt       = maisRecente(lastSyncAt, i.createdAt)
        for (const d of removidas) lastDeleteSyncAt = maisRecente(lastDeleteSyncAt, d.deletedAt)
        if (novas.length === 0 && removidas.length === 0) return
        const fora = new Set(removidas.map(d => d.id))
        set(s => {
          const ids = new Set(s.todas.map(i => i.id))
          return {
            todas: [...s.todas, ...novas.filter(i => !ids.has(i.id))].filter(i => !fora.has(i.id)),
          }
        })
      } catch {
        // erro já exibido pela camada db
      } finally {
        inflightSync = null
      }
    })()
    return inflightSync
  },

  loadForLead: async (leadId) => {
    if (get().loaded.has(leadId)) return
    try {
      const items = await db.leadInteractions.fetchForLead(leadId)
      set(s => ({
        byLead: { ...s.byLead, [leadId]: items },
        loaded: new Set([...s.loaded, leadId]),
      }))
    } catch {
      // error already toasted by db layer
    }
  },

  subscribe: () => {
    const channelName = 'lead-interactions-realtime'
    if (supabase.getChannels().some(c => c.topic === `realtime:${channelName}`)) return () => {}

    let disposed = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let channel: ReturnType<typeof buildChannel> | null = null

    const buildChannel = () => supabase
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lead_interactions' }, (payload) => {
        const r = payload.new as Record<string, unknown>
        const item: LeadInteraction = {
          id: r.id as string,
          leadId: r.lead_id as string,
          type: r.type as LeadInteractionType,
          description: (r.description as string | null) ?? undefined,
          outcome: r.outcome ? (r.outcome as LeadInteractionOutcome) : undefined,
          interactedAt: r.interacted_at as string,
          createdAt: r.created_at as string,
          brokerId: (r.broker_id as string | null) ?? undefined,
          fromStage: (r.from_stage as LeadInteraction['fromStage'] | null) ?? undefined,
          toStage: (r.to_stage as LeadInteraction['toStage'] | null) ?? undefined,
        }
        set(s => {
          const leadItems = s.byLead[item.leadId] ?? []
          const naTimeline = leadItems.some(i => i.id === item.id)
          // Nota automática (sem autor) vai para a timeline, não para as métricas
          const naLista = !s.allLoaded || !item.brokerId || s.todas.some(i => i.id === item.id)
          if (naTimeline && naLista) return s
          return {
            byLead: naTimeline ? s.byLead : { ...s.byLead, [item.leadId]: [item, ...leadItems] },
            todas:  naLista    ? s.todas  : [...s.todas, item],
          }
        })
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'lead_interactions' }, (payload) => {
        const r = payload.old as Record<string, unknown>
        const id = r.id as string
        const leadId = r.lead_id as string
        set(s => ({
          byLead: leadId
            ? { ...s.byLead, [leadId]: (s.byLead[leadId] ?? []).filter(i => i.id !== id) }
            : s.byLead,
          todas: s.todas.filter(i => i.id !== id),
        }))
      })

    // Reconexão automática + reconciliação pelo delta (mesmo padrão do canal de leads)
    const connect = (isReconnect: boolean) => {
      if (disposed) return
      channel = buildChannel()
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (isReconnect) get().sincronizar()
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
      if (channel) supabase.removeChannel(channel)
    }
  },

  // Banco primeiro — o estado local só muda após o write ser confirmado.
  // Falha → erro toastado pela camada db + throw para o caller não exibir sucesso.
  add: async (data) => {
    const now = new Date().toISOString()
    // brokerId explícito: é o que a camada db grava (requireBrokerId) e o que
    // as métricas usam para atribuir a interação a quem agiu.
    const item: LeadInteraction = { ...data, brokerId: getCurrentUserId() ?? undefined, id: generateId(), createdAt: now }
    await db.leadInteractions.upsert(item)
    set(s => {
      const leadItems = s.byLead[data.leadId] ?? []
      // realtime pode ter chegado antes
      const naTimeline = leadItems.some(i => i.id === item.id)
      const naLista    = !s.allLoaded || s.todas.some(i => i.id === item.id)
      if (naTimeline && naLista) return s
      return {
        byLead: naTimeline ? s.byLead : { ...s.byLead, [data.leadId]: [item, ...leadItems] },
        todas:  naLista    ? s.todas  : [...s.todas, item],
      }
    })
    return item
  },

  remove: async (id, leadId) => {
    await db.leadInteractions.delete(id)
    set(s => ({
      byLead: {
        ...s.byLead,
        [leadId]: (s.byLead[leadId] ?? []).filter(i => i.id !== id),
      },
      todas: s.todas.filter(i => i.id !== id),
    }))
  },

  getForLead:        (leadId) => get().byLead[leadId] ?? [],
  getAllInteractions: ()       => get().todas,
}))
