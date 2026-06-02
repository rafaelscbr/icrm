import { create } from 'zustand'
import { Campaign, CampaignLead, FunnelStage, LeadSituation } from '../types'
import { generateId } from '../lib/formatters'
import { db } from '../lib/db'
import { supabase } from '../lib/supabase'

type NewLead = Omit<CampaignLead, 'id' | 'funnelStage' | 'createdAt' | 'updatedAt'>

// Mapeia uma linha crua do postgres_changes para CampaignLead
// DEVE conter TODOS os campos do tipo — omitir um campo faz o realtime
// apagar informação que o corretor acabou de gravar.
function rowToLead(r: Record<string, unknown>): CampaignLead {
  return {
    id:                   r.id as string,
    campaignId:           r.campaign_id as string,
    name:                 r.name as string,
    phone:                r.phone as string,
    email:                (r.email as string | null)         ?? undefined,
    extra:                (r.extra as string | null)         ?? undefined,
    funnelStage:          r.funnel_stage as FunnelStage,
    situation:            (r.situation as LeadSituation | null) ?? undefined,
    notes:                (r.notes as string | null)         ?? undefined,
    firstContactAt:       (r.first_contact_at as string | null)  ?? undefined,
    lastMessage:          (r.last_message as string | null)  ?? undefined,
    messageIndex:         (r.message_index as number | null) ?? undefined,
    proposalValue:        (r.proposal_value as number | null) ?? undefined,
    propertyId:           (r.property_id as string | null)   ?? undefined,
    stageUpdatedAt:       (r.stage_updated_at as string | null) ?? undefined,
    transferredAt:        (r.transferred_at as string | null) ?? undefined,
    transferredToLeadId:  (r.transferred_to_lead_id as string | null) ?? undefined,
    brokerId:             (r.broker_id as string | null)      ?? undefined,
    // campos de rastreabilidade — obrigatório para badge "quem disparou"
    lastSentById:         (r.last_sent_by_id as string | null)   ?? undefined,
    lastSentByName:       (r.last_sent_by_name as string | null) ?? undefined,
    lastSentAt:           (r.last_sent_at as string | null)      ?? undefined,
    assignedToId:         (r.assigned_to_id as string | null)    ?? undefined,
    assignedToName:       (r.assigned_to_name as string | null)  ?? undefined,
    createdAt:            r.created_at as string,
    updatedAt:            r.updated_at as string,
  }
}

interface CampaignLeadsStore {
  leads: CampaignLead[]
  loading: boolean
  load: () => Promise<void>
  subscribe: () => () => void
  addBulk: (data: NewLead[]) => { added: number; skipped: number }
  add: (data: NewLead) => CampaignLead
  update: (id: string, data: Partial<CampaignLead>) => void
  remove: (id: string) => void
  removeForCampaign: (campaignId: string) => void
  setStage: (id: string, stage: FunnelStage, extra?: Partial<CampaignLead>, actorBy?: { id: string; name: string }) => void
  setSituation: (id: string, situation: LeadSituation | undefined) => void
  markContacted: (id: string, message?: string, messageIndex?: number, sentBy?: { id: string; name: string }) => void
  markAsTransferred: (id: string, leadId: string) => void
  backfillMessageIndex: (campaign: Campaign) => Promise<number>
  transferLeadsToBroker: (campaignId: string, brokerId: string | null) => Promise<void>
  getForCampaign: (campaignId: string) => CampaignLead[]
}

export const useCampaignLeadsStore = create<CampaignLeadsStore>((set, get) => ({
  leads: [],
  loading: false,

  load: async () => {
    set({ loading: true })
    try {
      const raw = await db.campaignLeads.fetchAll()

      // Deduplica por (campaignId + telefone limpo)
      const seen = new Set<string>()
      const fetched = raw.filter(l => {
        const key = `${l.campaignId}:${l.phone.replace(/\D/g, '')}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      // MERGE em vez de replace: preserva atualizações do realtime que chegaram
      // durante o fetch (evita race condition load vs realtime)
      set(s => {
        const storeMap = new Map(s.leads.map(l => [l.id, l]))
        const merged = fetched.map(fetchedLead => {
          const inStore = storeMap.get(fetchedLead.id)
          // Mantém versão do store se for mais recente (veio via realtime)
          if (inStore && inStore.updatedAt > fetchedLead.updatedAt) return inStore
          return fetchedLead
        })
        return { leads: merged }
      })
    } catch (err) {
      console.error('[campaignLeads] load:', err)
    } finally {
      set({ loading: false })
    }
  },

  // Subscription realtime — escuta INSERT, UPDATE e DELETE na tabela campaign_leads.
  // Retorna função de cleanup para usar no useEffect.
  subscribe: () => {
    const CHANNEL = 'campaign-leads-realtime'

    // Remove canal existente se estiver em estado quebrado (não 'joined')
    // Isso garante reconexão após queda de rede ou navegação
    const existing = supabase.getChannels().find(c => c.topic === `realtime:${CHANNEL}`)
    if (existing) {
      if (existing.state === 'joined') {
        // Canal saudável — apenas retorna cleanup sem criar novo
        return () => {}
      }
      // Canal existente mas morto — remove para recriar
      supabase.removeChannel(existing)
    }

    const channel = supabase
      .channel(CHANNEL)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'campaign_leads' },
        (payload) => {
          const incoming = rowToLead(payload.new as Record<string, unknown>)
          set(s => {
            if (s.leads.some(l => l.id === incoming.id)) return s
            return { leads: [incoming, ...s.leads] }
          })
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'campaign_leads' },
        (payload) => {
          const incoming = rowToLead(payload.new as Record<string, unknown>)
          set(s => {
            const exists = s.leads.some(l => l.id === incoming.id)
            if (!exists) {
              // Lead não está no store (ainda carregando) — adiciona imediatamente
              return { leads: [incoming, ...s.leads] }
            }
            return { leads: s.leads.map(l => l.id === incoming.id ? incoming : l) }
          })
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'campaign_leads' },
        (payload) => {
          const id = (payload.old as { id: string }).id
          set(s => ({ leads: s.leads.filter(l => l.id !== id) }))
        }
      )
      .subscribe((status) => {
        // Se o canal cair após reconectar, recarrega os dados do banco
        // para garantir que não perdemos eventos durante a desconexão
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[campaign_leads] realtime desconectado — recarregando dados...')
          useCampaignLeadsStore.getState().load()
        }
      })

    return () => { supabase.removeChannel(channel) }
  },

  addBulk: (data) => {
    const now = new Date().toISOString()
    const existing = get().leads
    const created: CampaignLead[] = []
    let skipped = 0

    for (const d of data) {
      const phone = d.phone.replace(/\D/g, '')
      const dup = existing.find(
        l => l.campaignId === d.campaignId && l.phone.replace(/\D/g, '') === phone
      )
      if (dup) { skipped++; continue }
      created.push({ ...d, id: generateId(), funnelStage: 'new', createdAt: now, updatedAt: now })
    }

    const leads = [...existing, ...created]
    set({ leads })
    if (created.length > 0) {
      db.campaignLeads.upsertMany(created).catch(err => console.error('[campaignLeads] addBulk:', err))
    }
    return { added: created.length, skipped }
  },

  add: (data) => {
    const now = new Date().toISOString()
    const lead: CampaignLead = { ...data, id: generateId(), funnelStage: 'new', createdAt: now, updatedAt: now }
    set(s => ({ leads: [...s.leads, lead] }))
    db.campaignLeads.upsert(lead).catch(err => console.error('[campaignLeads] add:', err))
    return lead
  },

  update: (id, data) => {
    const leads = get().leads.map(l =>
      l.id === id ? { ...l, ...data, updatedAt: new Date().toISOString() } : l
    )
    set({ leads })
    const updated = leads.find(l => l.id === id)
    if (updated) db.campaignLeads.upsert(updated).catch(err => console.error('[campaignLeads] update:', err))
  },

  remove: (id) => {
    set(s => ({ leads: s.leads.filter(l => l.id !== id) }))
    db.campaignLeads.delete(id).catch(err => console.error('[campaignLeads] remove:', err))
  },

  removeForCampaign: (campaignId) => {
    set(s => ({ leads: s.leads.filter(l => l.campaignId !== campaignId) }))
    db.campaignLeads.deleteForCampaign(campaignId).catch(err => console.error('[campaignLeads] removeForCampaign:', err))
  },

  setStage: (id, stage, extra, actorBy) => {
    const lead = get().leads.find(l => l.id === id)
    get().update(id, { funnelStage: stage, stageUpdatedAt: new Date().toISOString(), ...extra })
    if (lead && actorBy) {
      db.campaignActivity.insert({
        id:         `${Date.now()}-act-${Math.random().toString(36).slice(2,7)}`,
        campaignId: lead.campaignId,
        leadId:     lead.id,
        leadName:   lead.name,
        brokerId:   actorBy.id,
        brokerName: actorBy.name,
        actionType: 'stage_change',
        metadata:   { from: lead.funnelStage, to: stage },
      }).catch(err => console.error('[activity] stage_change:', err))
    }
  },

  setSituation: (id, situation) => {
    get().update(id, { situation })
  },

  markContacted: (id, message, messageIndex, sentBy) => {
    const lead = get().leads.find(l => l.id === id)
    if (!lead) return
    const now = new Date().toISOString()
    const patch: Partial<CampaignLead> = {}
    if (!lead.firstContactAt) patch.firstContactAt = now
    if (lead.funnelStage === 'new') patch.funnelStage = 'sent'
    if (message) patch.lastMessage = message
    if (messageIndex !== undefined) patch.messageIndex = messageIndex
    // Rastreabilidade: quem disparou
    if (sentBy) {
      patch.lastSentById   = sentBy.id
      patch.lastSentByName = sentBy.name
      patch.lastSentAt     = now
    }
    if (Object.keys(patch).length) get().update(id, patch)
    // Registra no activity log
    if (message && sentBy) {
      db.campaignActivity.insert({
        id:          `${Date.now()}-act-${Math.random().toString(36).slice(2,7)}`,
        campaignId:  lead.campaignId,
        leadId:      lead.id,
        leadName:    lead.name,
        brokerId:    sentBy.id,
        brokerName:  sentBy.name,
        actionType:  'dispatch',
        metadata:    { messageIndex, message },
      }).catch(err => console.error('[activity] dispatch:', err))
    }
  },

  markAsTransferred: (id, leadId) => {
    get().update(id, {
      transferredAt:       new Date().toISOString(),
      transferredToLeadId: leadId,
    })
  },

  backfillMessageIndex: async (campaign) => {
    const templates = [campaign.message, ...(campaign.messages ?? [])]
    const candidates = get().leads.filter(
      l => l.campaignId === campaign.id && l.lastMessage && l.messageIndex === undefined,
    )
    let patched = 0
    for (const lead of candidates) {
      const firstName = lead.name.trim().split(/\s+/)[0]
      const idx = templates.findIndex(t => t.replace(/\{nome\}/gi, firstName) === lead.lastMessage)
      if (idx === -1) continue
      get().update(lead.id, { messageIndex: idx })
      patched++
    }
    return patched
  },

  transferLeadsToBroker: async (campaignId, brokerId) => {
    await db.campaignLeads.transferBroker(campaignId, brokerId)
    set(s => ({
      leads: s.leads.map(l =>
        l.campaignId === campaignId ? { ...l, brokerId: brokerId ?? undefined } : l
      ),
    }))
  },

  getForCampaign: (campaignId) =>
    get().leads.filter(l => l.campaignId === campaignId),
}))
