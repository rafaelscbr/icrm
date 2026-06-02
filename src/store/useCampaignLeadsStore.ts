/**
 * useCampaignLeadsStore
 *
 * Arquitetura: banco de dados como fonte de verdade única.
 *
 * Fluxo simples e confiável:
 * 1. Qualquer ação (disparo, mudança de etapa) → salva no banco imediatamente
 * 2. Polling periódico (configurável no CampaignDetail) recarrega do banco
 * 3. Todos os usuários (admin/corretor) enxergam exatamente o mesmo dado
 *
 * Sem Supabase Realtime channels — elimina SECURITY DEFINER issues, race
 * conditions e toda a complexidade de gestão de canais websocket.
 */

import { create } from 'zustand'
import { Campaign, CampaignLead, FunnelStage, LeadSituation } from '../types'
import { generateId, normalizePhone } from '../lib/formatters'
import { db }       from '../lib/db'
import { supabase } from '../lib/supabase'
import toast        from 'react-hot-toast'

type NewLead = Omit<CampaignLead, 'id' | 'funnelStage' | 'createdAt' | 'updatedAt'>

interface CampaignLeadsStore {
  leads: CampaignLead[]
  loading: boolean
  load: () => Promise<void>
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

  // ── Carrega todos os leads do banco ──────────────────────────────────────────
  // Chamado ao abrir uma campanha e pelo polling periódico.
  // Usa merge inteligente para não sobrescrever atualizações otimistas pendentes:
  // se o estado local tem updatedAt mais recente que o banco, o upsert ainda não
  // chegou ao servidor — mantém a versão local para evitar re-exibir na fila.
  load: async () => {
    set({ loading: true })
    try {
      const raw = await db.campaignLeads.fetchAll()

      // Deduplica por (campaignId + telefone) — descarta duplicatas de import
      const seen = new Set<string>()
      const fresh = raw.filter(l => {
        const key = `${l.campaignId}:${l.phone.replace(/\D/g, '')}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      // Merge: preserva escritas otimistas pendentes.
      // Para cada lead do banco, se o estado local tem updatedAt posterior, mantém local.
      const currentLeads = get().leads
      const currentMap   = new Map(currentLeads.map(l => [l.id, l]))
      const freshIds     = new Set(fresh.map(l => l.id))

      const merged = fresh.map(dbLead => {
        const local = currentMap.get(dbLead.id)
        // updatedAt local > banco → escrita ainda pendente, preserva otimista
        return local && local.updatedAt > dbLead.updatedAt ? local : dbLead
      })

      // Inclui leads locais que ainda não chegaram ao banco (addBulk recente)
      const pendingLocal = currentLeads.filter(l => !freshIds.has(l.id))
      merged.push(...pendingLocal)

      set({ leads: merged })
    } catch (err) {
      console.error('[campaignLeads] load:', err)
    } finally {
      set({ loading: false })
    }
  },

  // ── Importação em massa (XLSX) ────────────────────────────────────────────
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

    set(s => ({ leads: [...s.leads, ...created] }))
    if (created.length > 0) {
      db.campaignLeads.upsertMany(created).catch(err => console.error('[campaignLeads] addBulk:', err))
    }
    return { added: created.length, skipped }
  },

  // ── Adiciona lead individual ──────────────────────────────────────────────
  add: (data) => {
    const now = new Date().toISOString()
    const lead: CampaignLead = { ...data, id: generateId(), funnelStage: 'new', createdAt: now, updatedAt: now }
    set(s => ({ leads: [...s.leads, lead] }))
    db.campaignLeads.upsert(lead).catch(err => console.error('[campaignLeads] add:', err))
    return lead
  },

  // ── Atualiza lead (otimista → banco) ────────────────────────────────────
  // Usa updateRow (.update()) em vez de upsert (.upsert()) para evitar o
  // problema de RLS onde o corretor não consegue fazer INSERT ON CONFLICT
  // em linhas cujo broker_id pertence ao admin.
  update: (id, data) => {
    const leads = get().leads.map(l =>
      l.id === id ? { ...l, ...data, updatedAt: new Date().toISOString() } : l
    )
    set({ leads })
    const updated = leads.find(l => l.id === id)
    if (updated) {
      db.campaignLeads.updateRow(updated).catch(err => {
        console.error('[campaignLeads] update:', err)
        toast.error('Erro ao salvar alteração. Tente novamente.')
      })
    }
  },

  remove: (id) => {
    set(s => ({ leads: s.leads.filter(l => l.id !== id) }))
    db.campaignLeads.delete(id).catch(err => console.error('[campaignLeads] remove:', err))
  },

  removeForCampaign: (campaignId) => {
    set(s => ({ leads: s.leads.filter(l => l.campaignId !== campaignId) }))
    db.campaignLeads.deleteForCampaign(campaignId).catch(err => console.error('[campaignLeads] removeForCampaign:', err))
  },

  // ── Muda etapa do funil ────────────────────────────────────────────────
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

  // ── Registra disparo de mensagem ─────────────────────────────────────────
  markContacted: (id, message, messageIndex, sentBy) => {
    const lead = get().leads.find(l => l.id === id)
    if (!lead) return
    const now = new Date().toISOString()
    const patch: Partial<CampaignLead> = {}
    if (!lead.firstContactAt) patch.firstContactAt = now
    if (lead.funnelStage === 'new') patch.funnelStage = 'sent'
    if (message) patch.lastMessage = message
    if (messageIndex !== undefined) patch.messageIndex = messageIndex
    if (sentBy) {
      patch.lastSentById   = sentBy.id
      patch.lastSentByName = sentBy.name
      patch.lastSentAt     = now
    }
    // Incrementa dispatch_count
    patch.dispatchCount = (lead.dispatchCount ?? 0) + 1
    get().update(id, patch)

    // Registra no log de atividade da campanha
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

    // Grava no histórico do contato (lead_campaign_dispatches).
    // Busca o contact pelo phone normalizado para funcionar com qualquer
    // formato armazenado ("(47) 9xxxx" ou "479xxxx").
    if (sentBy) {
      const capturedLead   = lead
      const capturedSentBy = sentBy
      ;(async () => {
        try {
          const normPhone = normalizePhone(capturedLead.phone) ?? capturedLead.phone
          const { data: contact } = await supabase
            .from('contacts').select('id').eq('phone', normPhone).maybeSingle()
          if (!contact) return
          await db.dispatches.insert({
            contactId:    contact.id,
            campaignId:   capturedLead.campaignId,
            brokerId:     capturedSentBy.id,
            messageIndex: messageIndex,
            channel:      'whatsapp',
          })
        } catch (err) {
          console.error('[dispatch] history:', err)
        }
      })()
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
