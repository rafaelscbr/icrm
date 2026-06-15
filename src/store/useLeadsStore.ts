import { create } from 'zustand'
import { Lead, LeadFunnelStage, LeadDiscardReason, LeadOrigin } from '../types'
import { generateId } from '../lib/formatters'
import { db } from '../lib/db'
import { supabase } from '../lib/supabase'
import { getCurrentUserId } from '../lib/auth'
import { useContactsStore } from './useContactsStore'
import { useLeadInteractionsStore } from './useLeadInteractionsStore'
import { useRealtimeStatusStore } from './useRealtimeStatusStore'
import toast from 'react-hot-toast'

interface LeadsStore {
  leads: Lead[]
  loading: boolean
  // Lead recém-movido para 'visita' que deve sugerir o agendamento de tarefa (modal)
  visitaSuggestLeadId: string | null
  clearVisitaSuggest: () => void
  load: () => Promise<void>
  reload: () => Promise<void>
  subscribe: () => () => void
  add: (data: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'> & { createdAt?: string }) => Promise<Lead>
  update: (id: string, data: Partial<Lead>) => Promise<void>
  remove: (id: string) => Promise<void>
  getById: (id: string) => Lead | undefined
  setStage: (id: string, stage: LeadFunnelStage) => Promise<void>
  advanceFollowup: (id: string) => Promise<void>
  discard: (id: string, reason: LeadDiscardReason) => Promise<void>
  restore: (id: string) => Promise<void>
  convertToContact: (id: string, contactId: string) => Promise<void>
  transfer: (id: string, toBrokerId: string) => Promise<void>
  toggleFlag: (id: string) => Promise<void>
  reorder: (id: string, kanbanOrder: number) => Promise<void>
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
  visitaSuggestLeadId: null,
  clearVisitaSuggest: () => set({ visitaSuggestLeadId: null }),

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

  // Reconciliação silenciosa — atualiza os dados sem ligar a flag `loading`,
  // para a tela não trocar pelo spinner nem perder o contexto do usuário.
  reload: async () => {
    try {
      const leads = await db.leads.fetchAll()
      set({ leads })
    } catch (err) {
      console.error('[leads] reload:', err)
    }
  },

  subscribe: () => {
    const channelName = 'leads-realtime'
    if (supabase.getChannels().some(c => c.topic === `realtime:${channelName}`)) return () => {}

    let disposed = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let channel: ReturnType<typeof buildChannel> | null = null

    const buildChannel = () => supabase
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
            firstContactAt: (incoming.first_contact_at as string | null) ?? undefined,
            slaDueAt: (incoming.sla_due_at as string | null) ?? undefined,
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
            firstContactAt: (r.first_contact_at as string | null) ?? undefined,
            slaDueAt: (r.sla_due_at as string | null) ?? undefined,
            brokerId: (r.broker_id as string | null) ?? undefined,
            updatedAt: r.updated_at as string,
          }),
        }))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'leads' }, (payload) => {
        const id = (payload.old as { id: string }).id
        set(s => ({ leads: s.leads.filter(l => l.id !== id) }))
      })

    // Reconexão automática: se o canal cair (aba inativa, rede, token vencido),
    // refaz o subscribe e recarrega do banco para recuperar eventos perdidos.
    const connect = (isReconnect: boolean) => {
      if (disposed) return
      channel = buildChannel()
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          useRealtimeStatusStore.getState().setConnected(true)
          if (isReconnect) get().reload() // reconciliação silenciosa — banco é a fonte de verdade
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          useRealtimeStatusStore.getState().setConnected(false)
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

  // Banco primeiro — o lead só entra na tela após confirmação do banco.
  add: async (data) => {
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
      // Garante o contato persistido antes do lead (FK contact_id)
      await db.contacts.upsert(newContact)
      lead.contactId = newContact.id
      lead.convertedAt = now
    }

    await db.leads.upsert(lead)
    set(s => s.leads.some(l => l.id === lead.id) ? s : { leads: [lead, ...s.leads] })
    return lead
  },

  update: async (id, data) => {
    const snapshot = get().leads.find(l => l.id === id)
    if (!snapshot) return
    const now = new Date().toISOString()
    const updated = { ...snapshot, ...data, updatedAt: now, kanbanOrder: Date.now() }
    try {
      await db.leads.upsert(updated)
      set(s => ({ leads: s.leads.map(l => l.id === id ? updated : l) }))
    } catch (err) {
      console.error('[leads] update:', err)
      toast.error('Erro ao salvar alteração do lead. Verifique sua conexão e tente novamente.')
      throw err
    }
  },

  remove: async (id) => {
    await db.leads.delete(id)
    set(s => ({ leads: s.leads.filter(l => l.id !== id) }))
  },

  getById: (id) => get().leads.find(l => l.id === id),

  setStage: async (id, stage) => {
    const now = new Date().toISOString()
    const lead = get().leads.find(l => l.id === id)
    if (!lead) return

    // Entrou na etapa 'visita' agora (vindo de outra etapa) e ainda não tem tarefa?
    const suggestVisita = stage === 'visita' && lead.funnelStage !== 'visita' && !lead.visitaTaskId

    const updated = {
      ...lead,
      funnelStage: stage,
      followupStep: stage === 'followup' ? (lead.followupStep || 1) : lead.followupStep,
      updatedAt: now,
      kanbanOrder: Date.now(),
      stageChangedAt: now,
    }

    try {
      await db.leads.upsert(updated)
      set(s => ({ leads: s.leads.map(l => l.id === id ? updated : l) }))
    } catch (err) {
      console.error('[leads] setStage:', err)
      toast.error('Erro ao atualizar etapa do lead. Verifique sua conexão e tente novamente.')
      throw err
    }

    // Sugere agendar a tarefa de visita via modal (não cria silenciosamente)
    if (suggestVisita) set({ visitaSuggestLeadId: id })

    // Registra mudança de etapa no histórico de interações
    await useLeadInteractionsStore.getState().add({
      leadId: id,
      type: 'stage_change',
      description: `Movido de ${STAGE_LABEL[lead.funnelStage] ?? lead.funnelStage} → ${STAGE_LABEL[stage] ?? stage}`,
      interactedAt: now,
    }).catch(err => console.error('[leads] setStage history:', err)) // etapa já salva — histórico não bloqueia
  },

  advanceFollowup: async (id) => {
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
    }

    const updated = { ...lead, funnelStage: nextStage, followupStep: nextStep, updatedAt: now, kanbanOrder: Date.now() }
    try {
      await db.leads.upsert(updated)
      set(s => ({ leads: s.leads.map(l => l.id === id ? updated : l) }))
    } catch (err) {
      console.error('[leads] advanceFollowup:', err)
      toast.error('Erro ao salvar followup. Verifique sua conexão e tente novamente.')
      throw err
    }
  },

  discard: async (id, reason) => {
    const now = new Date().toISOString()
    const lead = get().leads.find(l => l.id === id)
    if (!lead) return
    const updated = { ...lead, discardReason: reason, discardedAt: now, updatedAt: now }
    try {
      await db.leads.upsert(updated)
      set(s => ({ leads: s.leads.map(l => l.id === id ? updated : l) }))
    } catch (err) {
      console.error('[leads] discard:', err)
      toast.error('Erro ao descartar lead. Verifique sua conexão e tente novamente.')
      throw err
    }
    // Registra descarte no histórico
    await useLeadInteractionsStore.getState().add({
      leadId: id,
      type: 'discard',
      description: `Descartado em ${STAGE_LABEL[lead.funnelStage] ?? lead.funnelStage} — ${reason}`,
      interactedAt: now,
    }).catch(err => console.error('[leads] discard history:', err)) // descarte já salvo — histórico não bloqueia
  },

  restore: async (id) => {
    const now = new Date().toISOString()
    const lead = get().leads.find(l => l.id === id)
    if (!lead) return
    const updated = { ...lead, discardReason: undefined, discardedAt: undefined, updatedAt: now }
    try {
      await db.leads.upsert(updated)
      set(s => ({ leads: s.leads.map(l => l.id === id ? updated : l) }))
    } catch (err) {
      console.error('[leads] restore:', err)
      toast.error('Erro ao restaurar lead. Verifique sua conexão e tente novamente.')
      throw err
    }
  },

  convertToContact: async (id, contactId) => {
    const now = new Date().toISOString()
    const lead = get().leads.find(l => l.id === id)
    if (!lead) return
    const updated = { ...lead, contactId, convertedAt: now, updatedAt: now, kanbanOrder: Date.now() }
    // Garante que o contato existe no banco antes de salvar o lead (evita FK violation)
    const contact = useContactsStore.getState().getById(contactId)
    if (contact) await db.contacts.upsert(contact)
    await db.leads.upsert(updated)
    set(s => ({ leads: s.leads.map(l => l.id === id ? updated : l) }))
  },

  // Banco primeiro: a RPC valida permissão (dono/admin) e grava a trilha completa.
  // Se eu deixei de ser o dono e não sou admin, o lead sai da minha lista (RLS).
  transfer: async (id, toBrokerId) => {
    await db.leads.transfer(id, toBrokerId)
    const me = getCurrentUserId()
    const { useAuthStore } = await import('./useAuthStore')
    const isAdmin = useAuthStore.getState().isAdmin
    set(s => ({
      leads: (!isAdmin && toBrokerId !== me)
        ? s.leads.filter(l => l.id !== id)
        : s.leads.map(l => l.id === id ? { ...l, brokerId: toBrokerId, updatedAt: new Date().toISOString() } : l),
    }))
  },

  toggleFlag: async (id) => {
    const lead = get().leads.find(l => l.id === id)
    if (!lead) return
    await get().update(id, { flagged: !lead.flagged })
  },

  reorder: async (id, kanbanOrder) => {
    const now = new Date().toISOString()
    const lead = get().leads.find(l => l.id === id)
    if (!lead) return
    const updated = { ...lead, kanbanOrder, updatedAt: now }
    await db.leads.upsert(updated)
    set(s => ({ leads: s.leads.map(l => l.id === id ? updated : l) }))
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
