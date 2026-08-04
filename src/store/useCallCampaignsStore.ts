/**
 * Campanhas de ligação — Prospecção Ativa · Ligação WhatsApp.
 *
 * Espelha useCampaignsStore em superfície, mas fala com as tabelas call_*.
 * Tudo que muda estado da fila passa por RPC no banco: é o que garante que dois
 * corretores puxando ao mesmo tempo recebam leads diferentes.
 */

import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { getCurrentUserId } from '../lib/auth'
import type {
  CallCampaign, CallCampaignStatus, CallCampaignParticipant,
  CallBoard, CallPerformance,
} from '../types'

interface CallCampaignRow {
  id:               string
  name:             string
  description:      string | null
  status:           string
  owner_broker_id:  string | null
  average_ticket:   number | null
  product_name:     string | null
  retry_hours:      number[]
  max_attempts:     number
  claim_minutes:    number
  created_at:       string
  updated_at:       string
}

function toCampaign(r: CallCampaignRow): CallCampaign {
  return {
    id:            r.id,
    name:          r.name,
    description:   r.description ?? undefined,
    status:        r.status as CallCampaignStatus,
    ownerBrokerId: r.owner_broker_id ?? undefined,
    averageTicket: r.average_ticket ?? undefined,
    productName:   r.product_name ?? undefined,
    retryHours:    r.retry_hours ?? [4, 24, 72, 168],
    maxAttempts:   r.max_attempts,
    claimMinutes:  r.claim_minutes,
    createdAt:     r.created_at,
    updatedAt:     r.updated_at,
  }
}

interface CallCampaignsState {
  campaigns:    CallCampaign[]
  participants: CallCampaignParticipant[]
  loading:      boolean

  load:      () => Promise<void>
  create:    (input: Partial<CallCampaign> & { name: string }) => Promise<CallCampaign>
  update:    (id: string, patch: Partial<CallCampaign>) => Promise<void>
  setStatus: (id: string, status: CallCampaignStatus) => Promise<void>
  remove:    (id: string) => Promise<void>

  addLists:         (campaignId: string, listIds: string[]) => Promise<{ added: number; ignorados: number }>
  listIdsOf:        (campaignId: string) => Promise<string[]>
  addParticipant:   (campaignId: string, brokerId: string) => Promise<void>
  removeParticipant:(id: string) => Promise<void>

  loadBoard:       (campaignId: string, limite?: number) => Promise<CallBoard>
  loadPerformance: (campaignId?: string, desde?: string) => Promise<CallPerformance>
}

export const useCallCampaignsStore = create<CallCampaignsState>((set, get) => ({
  campaigns:    [],
  participants: [],
  loading:      false,

  load: async () => {
    set({ loading: true })
    try {
      const [campRes, partRes] = await Promise.all([
        supabase.from('call_campaigns').select('*').order('created_at', { ascending: false }),
        supabase.from('call_campaign_participants').select('*'),
      ])
      if (campRes.error) throw campRes.error
      if (partRes.error) throw partRes.error

      set({
        campaigns: (campRes.data as CallCampaignRow[]).map(toCampaign),
        participants: (partRes.data as Array<{
          id: string; campaign_id: string; broker_id: string; role: string; added_at: string
        }>).map(p => ({
          id:         p.id,
          campaignId: p.campaign_id,
          brokerId:   p.broker_id,
          role:       p.role as 'owner' | 'collaborator',
          addedAt:    p.added_at,
        })),
        loading: false,
      })
    } catch (err) {
      set({ loading: false })
      throw err
    }
  },

  create: async (input) => {
    const { data, error } = await supabase
      .from('call_campaigns')
      .insert({
        name:            input.name,
        description:     input.description ?? null,
        owner_broker_id: input.ownerBrokerId ?? getCurrentUserId(),
        average_ticket:  input.averageTicket ?? null,
        product_name:    input.productName ?? null,
        retry_hours:     input.retryHours  ?? [4, 24, 72, 168],
        max_attempts:    input.maxAttempts ?? 5,
        claim_minutes:   input.claimMinutes ?? 15,
      })
      .select()
      .single()
    if (error) throw error
    await get().load()
    return toCampaign(data as CallCampaignRow)
  },

  update: async (id, patch) => {
    const { error } = await supabase.from('call_campaigns').update({
      ...(patch.name          !== undefined ? { name: patch.name } : {}),
      ...(patch.description   !== undefined ? { description: patch.description ?? null } : {}),
      ...(patch.averageTicket !== undefined ? { average_ticket: patch.averageTicket ?? null } : {}),
      ...(patch.productName   !== undefined ? { product_name: patch.productName ?? null } : {}),
      ...(patch.retryHours    !== undefined ? { retry_hours: patch.retryHours } : {}),
      ...(patch.maxAttempts   !== undefined ? { max_attempts: patch.maxAttempts } : {}),
      ...(patch.claimMinutes  !== undefined ? { claim_minutes: patch.claimMinutes } : {}),
      ...(patch.status        !== undefined ? { status: patch.status } : {}),
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) throw error
    await get().load()
  },

  setStatus: async (id, status) => {
    await get().update(id, { status })
  },

  remove: async (id) => {
    const { error } = await supabase.from('call_campaigns').delete().eq('id', id)
    if (error) throw error
    set(s => ({ campaigns: s.campaigns.filter(c => c.id !== id) }))
  },

  // Importa contatos das listas para a fila. A RPC pula quem já está na fila e
  // quem tem telefone marcado como inválido.
  addLists: async (campaignId, listIds) => {
    const { data, error } = await supabase.rpc('call_campaign_add_lists', {
      p_campaign_id: campaignId,
      p_list_ids:    listIds,
    })
    if (error) throw error
    return data as { added: number; ignorados: number }
  },

  listIdsOf: async (campaignId) => {
    const { data, error } = await supabase
      .from('call_campaign_lists').select('list_id').eq('campaign_id', campaignId)
    if (error) throw error
    return (data as Array<{ list_id: string }>).map(r => r.list_id)
  },

  addParticipant: async (campaignId, brokerId) => {
    const { error } = await supabase.from('call_campaign_participants')
      .insert({ campaign_id: campaignId, broker_id: brokerId })
    if (error) throw error
    await get().load()
  },

  removeParticipant: async (id) => {
    const { error } = await supabase.from('call_campaign_participants').delete().eq('id', id)
    if (error) throw error
    await get().load()
  },

  // Contagem por coluna + primeiros cartões. Nunca traz a fila inteira: uma
  // campanha com 20 mil contatos derrubaria o navegador e o egress.
  loadBoard: async (campaignId, limite = 25) => {
    const { data, error } = await supabase.rpc('call_campaign_board', {
      p_campaign_id: campaignId,
      p_limite:      limite,
    })
    if (error) throw error
    return data as CallBoard
  },

  loadPerformance: async (campaignId, desde) => {
    const { data, error } = await supabase.rpc('call_performance', {
      p_campaign_id: campaignId ?? null,
      p_desde:       desde ?? null,
    })
    if (error) throw error
    return data as CallPerformance
  },
}))
