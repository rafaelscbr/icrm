import { create } from 'zustand'
import { Lead, LeadFunnelStage, LeadDiscardReason, LeadOrigin } from '../types'
import { generateId, localDateStr } from '../lib/formatters'
import { db } from '../lib/db'
import { supabase } from '../lib/supabase'
import { getCurrentUserId } from '../lib/auth'
import { useTasksStore } from './useTasksStore'
import { useContactsStore } from './useContactsStore'
import { useLeadInteractionsStore } from './useLeadInteractionsStore'
import toast from 'react-hot-toast'

interface LeadsStore {
  leads: Lead[]
  loading: boolean
  load: () => Promise<void>
  subscribe: () => () => void
  add: (data: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'> & { createdAt?: string }) => Lead
  update: (id: string, data: Partial<Lead>) => void
  remove: (id: string) => void
  getById: (id: string) => Lead | undefined
  setStage: (id: string, stage: LeadFunnelStage) => void
  advanceFollowup: (id: string) => void
  discard: (id: string, reason: LeadDiscardReason) => void
  restore: (id: string) => void
  convertToContact: (id: string, contactId: string) => Promise<void>
  toggleFlag: (id: string) => void
  reorder: (id: string, kanbanOrder: number) => void
  search: (query: string) => Lead[]
  filterByStage: (stage: LeadFunnelStage | null) => Lead[]
  filterByOrigin: (origin: LeadOrigin | null) => Lead[]
  getActive: () => Lead[]
  getDiscarded: () => Lead[]
}

const STAGE_LABEL: Record<string, string> = {
  lead: 'Leads', followup: 'Followup', atendimento: 'Atendimento',
  visita: 'Visita', proposta: 'Proposta', venda: 'Venda',
}

export const useLeadsStore = create<LeadsStore>((set, get) => ({
  leads: [],
  loading: false,

  load: async () => {
    set({ loading: true })
    try {
      const leads = await db.leads.fetchAll()
      set({ leads })
    } catch (err) {
      console.error('[leads] load:', err)
    } finally {
      set({ loading: false })
    }
  },

  subscribe: () => {
    const channelName = 'leads-realtime'
    const existing = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`)
    if (existing) return () => {}

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leads' }, (payload) => {
        const incoming = payload.new as Record<string, unknown>
        // Usa o mapper do db — reimportar seria circular; mapeamos inline
        set(s => {
          if (s.leads.some(l => l.id === incoming.id)) return s
          const lead: Lead = {
            id: incoming.id as string,
            name: incoming.name as string,
            phone: incoming.phone as string,
            email: (incoming.email as string | null) ?? undefined,
            origin: incoming.origin as LeadOrigin,
            funnelStage: incoming.funnel_stage as LeadFunnelStage,
            followupStep: (incoming.followup_step as number) ?? 0,
            discardReason: (incoming.discard_reason as LeadDiscardReason) ?? undefined,
            discardedAt: (incoming.discarded_at as string | null) ?? undefined,
            propertyId: (incoming.property_id as string | null) ?? undefined,
            propertyName: (incoming.property_name as string | null) ?? undefined,
            averageTicket: (incoming.average_ticket as number | null) ?? undefined,
            contactId: (incoming.contact_id as string | null) ?? undefined,
            convertedAt: (incoming.converted_at as string | null) ?? undefined,
            flagged: (incoming.flagged as boolean | null) ?? undefined,
            notes: (incoming.notes as string | null) ?? undefined,
            kanbanOrder: (incoming.kanban_order as number | null) ?? undefined,
            stageChangedAt: (incoming.stage_changed_at as string | null) ?? undefined,
            brokerId: (incoming.broker_id as string | null) ?? undefined,
            createdAt: incoming.created_at as string,
            updatedAt: incoming.updated_at as string,
          }
          return { leads: [lead, ...s.leads] }
        })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leads' }, (payload) => {
        const r = payload.new as Record<string, unknown>
        set(s => ({
          leads: s.leads.map(l => l.id !== r.id ? l : {
            ...l,
            name: r.name as string,
            phone: r.phone as string,
            funnelStage: r.funnel_stage as LeadFunnelStage,
            followupStep: (r.followup_step as number) ?? 0,
            discardReason: (r.discard_reason as LeadDiscardReason) ?? undefined,
            discardedAt: (r.discarded_at as string | null) ?? undefined,
            propertyId: (r.property_id as string | null) ?? undefined,
            averageTicket: (r.average_ticket as number | null) ?? undefined,
            contactId: (r.contact_id as string | null) ?? undefined,
            flagged: (r.flagged as boolean | null) ?? undefined,
            notes: (r.notes as string | null) ?? undefined,
            kanbanOrder: (r.kanban_order as number | null) ?? undefined,
            stageChangedAt: (r.stage_changed_at as string | null) ?? undefined,
            brokerId: (r.broker_id as string | null) ?? undefined,
            updatedAt: r.updated_at as string,
          }),
        }))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'leads' }, (payload) => {
        const id = (payload.old as { id: string }).id
        set(s => ({ leads: s.leads.filter(l => l.id !== id) }))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  },

  add: (data) => {
    const now = new Date().toISOString()
    const { createdAt: customCreatedAt, ...rest } = data
    const brokerId = rest.brokerId ?? getCurrentUserId() ?? undefined

    if (!brokerId) {
      toast.error('Sessão expirada. Faça login novamente antes de criar leads.')
      throw new Error('[leads] add: brokerId ausente — usuário não autenticado')
    }

    const lead: Lead = { ...rest, brokerId, id: generateId(), createdAt: customCreatedAt ?? now, updatedAt: now, stageChangedAt: customCreatedAt ?? now }

    // Auto-link or create contact
    const { contacts, add: addContact } = useContactsStore.getState()
    const phone = lead.phone.replace(/\D/g, '')
    const existing = contacts.find(c => c.phone.replace(/\D/g, '') === phone)

    if (existing) {
      lead.contactId = existing.id
      lead.convertedAt = now
    } else {
      const newContact = addContact({
        name: lead.name,
        phone: lead.phone,
        tags: [],
        hasChildren: false,
        isMarried: false,
        permutaItems: [],
        brokerId,
      })
      lead.contactId = newContact.id
      lead.convertedAt = now
    }

    set(s => ({ leads: [lead, ...s.leads] }))
    db.leads.upsert(lead).catch(err => {
      console.error('[leads] add:', err)
      toast.error('Erro ao salvar lead no banco. Tente novamente.')
      // Reverte o otimista em caso de falha
      set(s => ({ leads: s.leads.filter(l => l.id !== lead.id) }))
    })
    return lead
  },

  update: (id, data) => {
    const now = new Date().toISOString()
    const leads = get().leads.map(l =>
      l.id === id ? { ...l, ...data, updatedAt: now, kanbanOrder: Date.now() } : l
    )
    set({ leads })
    const updated = leads.find(l => l.id === id)
    if (updated) db.leads.upsert(updated).catch(err => {
      console.error('[leads] update:', err)
      toast.error('Erro ao salvar alteração do lead.')
    })
  },

  remove: (id) => {
    set(s => ({ leads: s.leads.filter(l => l.id !== id) }))
    db.leads.delete(id).catch(err => {
      console.error('[leads] remove:', err)
      toast.error('Erro ao excluir lead.')
    })
  },

  getById: (id) => get().leads.find(l => l.id === id),

  setStage: (id, stage) => {
    const now = new Date().toISOString()
    const lead = get().leads.find(l => l.id === id)
    if (!lead) return

    let visitaTaskId = lead.visitaTaskId

    // Auto-create visita task when moving into 'visita' stage
    if (stage === 'visita' && !lead.visitaTaskId) {
      const { add: addTask, tasks } = useTasksStore.getState()
      // Avoid duplication: check if a visita task already exists for this contact
      const existing = lead.contactId
        ? tasks.find(t => t.contactId === lead.contactId && t.category === 'visita' && t.status === 'pending')
        : undefined

      if (!existing) {
        const task = addTask({
          title: `Visita — ${lead.name}`,
          category: 'visita',
          priority: 'high',
          status: 'pending',
          dueDate: localDateStr(),
          contactId: lead.contactId,
          propertyId: lead.propertyId,
          brokerId: lead.brokerId ?? getCurrentUserId() ?? undefined,
        })
        visitaTaskId = task.id
      } else {
        visitaTaskId = existing.id
      }
    }

    const leads = get().leads.map(l =>
      l.id === id
        ? { ...l, funnelStage: stage, followupStep: stage === 'followup' ? (l.followupStep || 1) : l.followupStep, visitaTaskId, updatedAt: now, kanbanOrder: Date.now(), stageChangedAt: now }
        : l
    )
    set({ leads })
    const updated = leads.find(l => l.id === id)
    if (updated) db.leads.upsert(updated).catch(err => { console.error('[leads] setStage:', err); toast.error('Erro ao atualizar etapa do lead.') })

    // Registra mudança de etapa no histórico de interações
    useLeadInteractionsStore.getState().add({
      leadId: id,
      type: 'stage_change',
      description: `Movido de ${STAGE_LABEL[lead.funnelStage] ?? lead.funnelStage} → ${STAGE_LABEL[stage] ?? stage}`,
      interactedAt: now,
    })
  },

  advanceFollowup: (id) => {
    const now = new Date().toISOString()
    const lead = get().leads.find(l => l.id === id)
    if (!lead) return

    let nextStage: LeadFunnelStage = lead.funnelStage
    let nextStep = lead.followupStep

    if (lead.funnelStage === 'lead') {
      nextStage = 'followup'
      nextStep = 1
    } else if (lead.funnelStage === 'followup') {
      if (lead.followupStep < 5) {
        nextStep = lead.followupStep + 1
      }
      // if already at 5, stays at 5 — user manually advances to atendimento
    }

    const leads = get().leads.map(l =>
      l.id === id ? { ...l, funnelStage: nextStage, followupStep: nextStep, updatedAt: now, kanbanOrder: Date.now() } : l
    )
    set({ leads })
    const updated = leads.find(l => l.id === id)
    if (updated) db.leads.upsert(updated).catch(err => { console.error('[leads] advanceFollowup:', err); toast.error('Erro ao salvar followup.') })
  },

  discard: (id, reason) => {
    const now = new Date().toISOString()
    const lead = get().leads.find(l => l.id === id)
    const leads = get().leads.map(l =>
      l.id === id ? { ...l, discardReason: reason, discardedAt: now, updatedAt: now } : l
    )
    set({ leads })
    const updated = leads.find(l => l.id === id)
    if (updated) db.leads.upsert(updated).catch(err => { console.error('[leads] discard:', err); toast.error('Erro ao descartar lead.') })

    // Registra descarte no histórico — preserva etapa de origem para análise de funil
    if (lead) {
      useLeadInteractionsStore.getState().add({
        leadId: id,
        type: 'discard',
        description: `Descartado em ${STAGE_LABEL[lead.funnelStage] ?? lead.funnelStage} — ${reason}`,
        interactedAt: now,
      })
    }
  },

  restore: (id) => {
    const now = new Date().toISOString()
    const leads = get().leads.map(l =>
      l.id === id ? { ...l, discardReason: undefined, discardedAt: undefined, updatedAt: now } : l
    )
    set({ leads })
    const updated = leads.find(l => l.id === id)
    if (updated) db.leads.upsert(updated).catch(err => { console.error('[leads] restore:', err); toast.error('Erro ao restaurar lead.') })
  },

  convertToContact: async (id, contactId) => {
    const now = new Date().toISOString()
    const leads = get().leads.map(l =>
      l.id === id ? { ...l, contactId, convertedAt: now, updatedAt: now, kanbanOrder: Date.now() } : l
    )
    set({ leads })
    const updated = leads.find(l => l.id === id)
    // Garante que o contato existe no banco antes de salvar o lead (evita FK violation)
    const contact = useContactsStore.getState().getById(contactId)
    if (contact) await db.contacts.upsert(contact).catch(err => { console.error('[leads] convertToContact - contact upsert:', err); toast.error('Erro ao vincular contato ao lead.') })
    if (updated) db.leads.upsert(updated).catch(err => { console.error('[leads] convertToContact:', err); toast.error('Erro ao converter lead em contato.') })
  },

  toggleFlag: (id) => {
    const lead = get().leads.find(l => l.id === id)
    if (!lead) return
    get().update(id, { flagged: !lead.flagged })
  },

  reorder: (id, kanbanOrder) => {
    const now = new Date().toISOString()
    const leads = get().leads.map(l =>
      l.id === id ? { ...l, kanbanOrder, updatedAt: now } : l
    )
    set({ leads })
    const updated = leads.find(l => l.id === id)
    if (updated) db.leads.upsert(updated).catch(err => console.error('[leads] reorder:', err))
  },

  search: (query) => {
    const q = query.toLowerCase()
    return get().leads.filter(l =>
      l.name.toLowerCase().includes(q) ||
      l.phone.includes(q) ||
      (l.email ?? '').toLowerCase().includes(q)
    )
  },

  filterByStage: (stage) => {
    if (!stage) return get().leads
    return get().leads.filter(l => l.funnelStage === stage)
  },

  filterByOrigin: (origin) => {
    if (!origin) return get().leads
    return get().leads.filter(l => l.origin === origin)
  },

  getActive: () => get().leads.filter(l => !l.discardReason),
  getDiscarded: () => get().leads.filter(l => !!l.discardReason),
}))
