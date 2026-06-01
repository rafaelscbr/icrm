import { create } from 'zustand'
import { Campaign, CampaignLead, FunnelStage, LeadSituation } from '../types'
import { generateId } from '../lib/formatters'
import { db } from '../lib/db'
import { supabase } from '../lib/supabase'

type NewLead = Omit<CampaignLead, 'id' | 'funnelStage' | 'createdAt' | 'updatedAt'>

// Mapeia uma linha crua do postgres_changes para CampaignLead
function rowToLead(r: Record<string, unknown>): CampaignLead {
  return {
    id:                   r.id as string,
    campaignId:           r.campaign_id as string,
    name:                 r.name as string,
    phone:                r.phone as string,
    email:                (r.email as string | null) ?? undefined,
    extra:                (r.extra as string | null) ?? undefined,
    funnelStage:          r.funnel_stage as FunnelStage,
    situation:            (r.situation as LeadSituation | null) ?? undefined,
    notes:                (r.notes as string | null) ?? undefined,
    firstContactAt:       (r.first_contact_at as string | null) ?? undefined,
    lastMessage:          (r.last_message as string | null) ?? undefined,
    messageIndex:         (r.message_index as number | null) ?? undefined,
    proposalValue:        (r.proposal_value as number | null) ?? undefined,
    propertyId:           (r.property_id as string | null) ?? undefined,
    stageUpdatedAt:       (r.stage_updated_at as string | null) ?? undefined,
    transferredAt:        (r.transferred_at as string | null) ?? undefined,
    transferredToLeadId:  (r.transferred_to_lead_id as string | null) ?? undefined,
    brokerId:             (r.broker_id as string | null) ?? undefined,
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
  setStage: (id: string, stage: FunnelStage, extra?: Partial<CampaignLead>) => void
  setSituation: (id: string, situation: LeadSituation | undefined) => void
  markContacted: (id: string, message?: string, messageIndex?: number) => void
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

      // Deduplica por (campaignId + telefone limpo): mantém o registro mais
      // recente (fetchAll retorna created_at DESC) e descarta os extras que
      // entraram pelo import em massa com o mesmo número.
      const seen = new Set<string>()
      const leads = raw.filter(l => {
        const key = `${l.campaignId}:${l.phone.replace(/\D/g, '')}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      set({ leads })
    } catch (err) {
      console.error('[campaignLeads] load:', err)
    } finally {
      set({ loading: false })
    }
  },

  // Subscription realtime — escuta INSERT, UPDATE e DELETE na tabela campaign_leads.
  // Retorna função de cleanup para usar no useEffect.
  subscribe: () => {
    // Evita canal duplicado se já existe uma subscription ativa
    const existing = supabase.getChannels().find(c => c.topic === 'realtime:campaign-leads-realtime')
    if (existing) return () => {}

    const channel = supabase
      .channel('campaign-leads-realtime')
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
          set(s => ({
            leads: s.leads.map(l => l.id === incoming.id ? incoming : l),
          }))
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
      .subscribe()

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

  setStage: (id, stage, extra) => {
    get().update(id, { funnelStage: stage, stageUpdatedAt: new Date().toISOString(), ...extra })
  },

  setSituation: (id, situation) => {
    get().update(id, { situation })
  },

  markContacted: (id, message, messageIndex) => {
    const lead = get().leads.find(l => l.id === id)
    if (!lead) return
    const patch: Partial<CampaignLead> = {}
    if (!lead.firstContactAt) patch.firstContactAt = new Date().toISOString()
    if (lead.funnelStage === 'new') patch.funnelStage = 'sent'
    if (message) patch.lastMessage = message
    if (messageIndex !== undefined) patch.messageIndex = messageIndex
    if (Object.keys(patch).length) get().update(id, patch)
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
