import { create, type StoreApi } from 'zustand'
import { Lead, LeadFunnelStage, LeadDiscardReason, LeadOrigin } from '../types'
import { generateId } from '../lib/formatters'
import { db } from '../lib/db'
import { mensagemDeErro } from '../lib/erros'
import { supabase } from '../lib/supabase'
import { getCurrentUserId } from '../lib/auth'
import { useContactsStore } from './useContactsStore'
import { useLeadInteractionsStore } from './useLeadInteractionsStore'
import { useRealtimeStatusStore } from './useRealtimeStatusStore'
import { useSalesStore } from './useSalesStore'
import { usePropertiesStore } from './usePropertiesStore'
import toast from 'react-hot-toast'

interface LeadsStore {
  leads: Lead[]
  loading: boolean
  /** mensagem da última falha de leitura; null quando deu certo */
  erro: string | null
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
  // Encerra um lead ganho: cria a venda em sales e tira o lead do funil ativo
  concludeSale: (id: string, opts: { value: number; date: string }) => Promise<void>
  discard: (id: string, reason: LeadDiscardReason) => Promise<void>
  restore: (id: string) => Promise<void>
  convertToContact: (id: string, contactId: string) => Promise<void>
  transfer: (id: string, toBrokerId: string) => Promise<void>
  // Baixa o destaque de reentrada — chamado quando o dono abre o lead
  ackReentry: (id: string) => Promise<void>
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

// ── Sync incremental ──────────────────────────────────────────────────────────
// A tabela inteira (~2,2 MB) desce UMA vez por sessão. Depois disso load() e
// reload() buscam só o que mudou desde a marca d'água (updated_at) e o que saiu
// do alcance desde a última sync (deleted_rows: exclusão ou troca de dono —
// migração 075). Antes, cada volta para a aba e cada reconexão do realtime
// baixava tudo de novo: o corretor alterna com o WhatsApp o dia inteiro, e foi
// isso que estourou o egress em 29/09/2026.
//
// Carga completa de novo só quando o usuário muda (logout → login de outra
// pessoa na mesma aba): o cache é de quem estava logado, e a RLS é por dono.
let inflightSync: Promise<void> | null = null
let lastSyncAt: string | null = null
let lastDeleteSyncAt: string | null = null
let syncUserId: string | null = null
// Folga generosa: updated_at pode vir do relógio do navegador de quem gravou.
// Re-baixar os leads do último minuto custa poucas linhas.
const SYNC_OVERLAP_MS = 60_000

const ms = (iso: string) => new Date(iso).getTime()
const recuar = (iso: string) => new Date(ms(iso) - SYNC_OVERLAP_MS).toISOString()

function sincronizar(
  set: StoreApi<LeadsStore>['setState'],
  get: StoreApi<LeadsStore>['getState'],
  explicito: boolean,
): Promise<void> {
  if (inflightSync) return inflightSync
  const userId = getCurrentUserId()
  const completo = lastSyncAt === null || syncUserId !== userId

  // reload() é reconciliação: se ninguém nesta sessão abriu uma tela de
  // leads ainda, não é a volta para a aba que vai baixar a tabela inteira.
  if (completo && !explicito) return Promise.resolve()

  inflightSync = (async () => {
    if (explicito) {
      // Spinner só quando não há nada em tela — revisitas mostram o dado na
      // hora e sincronizam em segundo plano.
      if (completo && syncUserId !== userId) set({ leads: [] })
      if (completo || get().leads.length === 0) set({ loading: true })
      set({ erro: null })
    }

    try {
      if (completo) {
        const leads = await db.leads.fetchAll()
        let marca: string | null = null
        for (const l of leads) if (!marca || ms(l.updatedAt) > ms(marca)) marca = l.updatedAt
        lastSyncAt = marca ?? new Date(0).toISOString()
        lastDeleteSyncAt = lastSyncAt
        syncUserId = userId
        set({ leads })
        return
      }

      const [changed, removed] = await Promise.all([
        db.leads.fetchSince(recuar(lastSyncAt!)),
        db.leads.fetchDeletedSince(recuar(lastDeleteSyncAt ?? lastSyncAt!)),
      ])
      if (changed.length === 0 && removed.length === 0) return

      for (const l of changed) if (ms(l.updatedAt) > ms(lastSyncAt!)) lastSyncAt = l.updatedAt
      for (const d of removed) {
        if (!lastDeleteSyncAt || ms(d.deletedAt) > ms(lastDeleteSyncAt)) lastDeleteSyncAt = d.deletedAt
      }

      set(s => {
        // 1. O que mudou no banco entra (ou substitui). Se a versão em tela é
        //    mais nova — gravação desta aba que o delta em voo ainda não viu —,
        //    ela fica: o eco do realtime confirma em seguida.
        const porId = new Map(s.leads.map(l => [l.id, l]))
        for (const l of changed) {
          const atual = porId.get(l.id)
          if (!atual || ms(l.updatedAt) >= ms(atual.updatedAt)) porId.set(l.id, l)
        }
        // 2. O que saiu do alcance sai da tela — só se o registro de saída é
        //    MAIS NOVO que a versão local. Quem ganhou o lead numa troca de
        //    dono recebe a linha com o mesmo instante do registro e a mantém.
        for (const d of removed) {
          const atual = porId.get(d.id)
          if (atual && ms(d.deletedAt) > ms(atual.updatedAt)) porId.delete(d.id)
        }
        // Mantém a ordem atual; novos entram no topo (a lista é por created_at desc).
        const vistos = new Set<string>()
        const ordenados: Lead[] = []
        for (const l of s.leads) {
          const v = porId.get(l.id)
          if (v) { ordenados.push(v); vistos.add(l.id) }
        }
        const novos = [...porId.values()]
          .filter(l => !vistos.has(l.id))
          .sort((a, b) => ms(b.createdAt) - ms(a.createdAt))
        return { leads: [...novos, ...ordenados] }
      })
    } catch (err) {
      console.error(`[leads] ${explicito ? 'load' : 'reload'}:`, err)
      // A tela PRECISA saber que falhou. Sem isto ela mostraria o estado vazio
      // e afirmaria que não existe dado — ver EstadoTela.
      if (explicito) set({ erro: mensagemDeErro(err) })
    } finally {
      if (explicito) set({ loading: false })
      inflightSync = null
    }
  })()
  return inflightSync
}

export const useLeadsStore = create<LeadsStore>((set, get) => ({
  leads: [],
  loading: false,
  erro: null,
  visitaSuggestLeadId: null,
  clearVisitaSuggest: () => set({ visitaSuggestLeadId: null }),

  load: () => sincronizar(set, get, true),

  // Reconciliação silenciosa — delta sem ligar a flag `loading`, para a tela
  // não trocar pelo spinner nem perder o contexto do usuário.
  reload: () => sincronizar(set, get, false),

  subscribe: () => {
    const channelName = 'leads-realtime'
    if (supabase.getChannels().some(c => c.topic === `realtime:${channelName}`)) return () => {}

    let disposed = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let deltaTimer: ReturnType<typeof setTimeout> | null = null
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
            lastContactAt: (incoming.last_contact_at as string | null) ?? undefined,
            slaDueAt: (incoming.sla_due_at as string | null) ?? undefined,
            reentryAt: (incoming.reentry_at as string | null) ?? undefined,
            reentryCount: (incoming.reentry_count as number | null) ?? undefined,
            reentrySeenAt: (incoming.reentry_seen_at as string | null) ?? undefined,
            returningFromLeadId: (incoming.returning_from_lead_id as string | null) ?? undefined,
            closedAt: (incoming.closed_at as string | null) ?? undefined,
            wonValue: (incoming.won_value as number | null) ?? undefined,
            saleId: (incoming.sale_id as string | null) ?? undefined,
            brokerId: (incoming.broker_id as string | null) ?? undefined,
            createdAt: incoming.created_at as string,
            updatedAt: incoming.updated_at as string,
          }
          return { leads: [lead, ...s.leads] }
        })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leads' }, (payload) => {
        const r = payload.new as Record<string, unknown>
        // Lead que não está em tela e chegou por UPDATE: acabou de ser
        // transferido para mim (ping-pong do SLA, transferência manual). O
        // payload não traz tudo que o card precisa — o delta busca a linha.
        if (!get().leads.some(l => l.id === r.id)) {
          if (!deltaTimer) deltaTimer = setTimeout(() => { deltaTimer = null; get().reload() }, 500)
          return
        }
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
            // Chega por aqui: o trigger da migração 074 atualiza o lead quando
            // um contato é registrado.
            lastContactAt: (r.last_contact_at as string | null) ?? undefined,
            slaDueAt: (r.sla_due_at as string | null) ?? undefined,
            // Sem isto o card só acenderia no F5: a reentrada chega como UPDATE
            // no lead que já está em tela, não como INSERT.
            reentryAt: (r.reentry_at as string | null) ?? undefined,
            reentryCount: (r.reentry_count as number | null) ?? undefined,
            reentrySeenAt: (r.reentry_seen_at as string | null) ?? undefined,
            returningFromLeadId: (r.returning_from_lead_id as string | null) ?? undefined,
            closedAt: (r.closed_at as string | null) ?? undefined,
            wonValue: (r.won_value as number | null) ?? undefined,
            saleId: (r.sale_id as string | null) ?? undefined,
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
      if (deltaTimer) clearTimeout(deltaTimer)
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

    // Auto-link or create contact.
    // O dedupe pergunta ao BANCO, não ao array local: a tela que cria o lead
    // não precisa mais ter os 12.543 contatos carregados, e a checagem passa a
    // enxergar o contato que outro corretor acabou de cadastrar.
    const { add: addContact } = useContactsStore.getState()
    const existing = await db.contacts.findByPhone(lead.phone)

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

    // Registra mudança de etapa no histórico de interações (com from/to estruturado)
    await useLeadInteractionsStore.getState().add({
      leadId: id,
      type: 'stage_change',
      description: `Movido de ${STAGE_LABEL[lead.funnelStage] ?? lead.funnelStage} → ${STAGE_LABEL[stage] ?? stage}`,
      fromStage: lead.funnelStage,
      toStage: stage,
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

    const stageChanged = nextStage !== lead.funnelStage
    const updated = {
      ...lead, funnelStage: nextStage, followupStep: nextStep, updatedAt: now, kanbanOrder: Date.now(),
      ...(stageChanged ? { stageChangedAt: now } : {}),
    }
    try {
      await db.leads.upsert(updated)
      set(s => ({ leads: s.leads.map(l => l.id === id ? updated : l) }))
    } catch (err) {
      console.error('[leads] advanceFollowup:', err)
      toast.error('Erro ao salvar followup. Verifique sua conexão e tente novamente.')
      throw err
    }

    // Registra a transição de etapa (ex.: lead → followup) para as métricas de conversão
    if (stageChanged) {
      await useLeadInteractionsStore.getState().add({
        leadId: id,
        type: 'stage_change',
        description: `Movido de ${STAGE_LABEL[lead.funnelStage] ?? lead.funnelStage} → ${STAGE_LABEL[nextStage] ?? nextStage}`,
        fromStage: lead.funnelStage,
        toStage: nextStage,
        interactedAt: now,
      }).catch(err => console.error('[leads] advanceFollowup history:', err))
    }
  },

  // Banco primeiro: garante contato → cria a venda em sales → encerra o lead.
  // Lead ganho sai do funil ativo (closedAt) e vira faturamento real (saleId).
  concludeSale: async (id, { value, date }) => {
    const now = new Date().toISOString()
    const lead = get().leads.find(l => l.id === id)
    if (!lead) return

    // Garante um contato (clientId obrigatório na venda) — reaproveita o contato do lead
    let contactId = lead.contactId
    if (!contactId) {
      // Dedupe no banco — ver comentário em add()
      const { add: addContact } = useContactsStore.getState()
      const existing = await db.contacts.findByPhone(lead.phone)
      if (existing) {
        contactId = existing.id
      } else {
        const nc = addContact({
          name: lead.name, phone: lead.phone, tags: [],
          hasChildren: false, isMarried: false, permutaItems: [],
          brokerId: lead.brokerId ?? undefined,
        })
        await db.contacts.upsert(nc)
        contactId = nc.id
      }
    }

    // Nome do produto: imóvel cadastrado, nome livre ou o próprio lead
    const property = lead.propertyId
      ? usePropertiesStore.getState().properties.find(p => p.id === lead.propertyId)
      : undefined
    const propertyName = property?.name ?? lead.propertyName ?? lead.name

    // Cria o registro de venda (entra no VGL do mês da data). Espera o banco:
    // o lead abaixo referencia a venda por FK.
    const sales = useSalesStore.getState()
    let sale
    try {
      sale = await sales.create({
        clientId: contactId,
        propertyId: lead.propertyId,
        propertyName,
        date,
        value,
        type: 'off_plan',
        commissionPct: 5,
        brokerPct: 40,
        brokerId: lead.brokerId ?? undefined,
      })
    } catch (err) {
      console.error('[leads] concludeSale sale:', err)
      toast.error('Erro ao registrar a venda. Nada foi alterado — tente novamente.')
      throw err
    }

    // Encerra o lead — sai do funil ativo
    const updated = {
      ...lead,
      contactId,
      convertedAt: lead.convertedAt ?? now,
      closedAt: now,
      wonValue: value,
      saleId: sale.id,
      updatedAt: now,
    }
    try {
      await db.leads.upsert(updated)
      set(s => ({ leads: s.leads.map(l => l.id === id ? updated : l) }))
    } catch (err) {
      console.error('[leads] concludeSale:', err)
      // Desfaz a venda recém-criada: sem isso, tentar de novo duplicaria o VGL.
      try {
        await sales.discard(sale.id)
        toast.error('Erro ao concluir a venda. Nada foi alterado — tente novamente.')
      } catch (undoErr) {
        console.error('[leads] concludeSale undo:', undoErr)
        toast.error('Erro ao encerrar o lead, e a venda já foi registrada em Vendas. Confira lá antes de tentar de novo.')
      }
      throw err
    }

    await useLeadInteractionsStore.getState().add({
      leadId: id,
      type: 'nota',
      description: `Venda concluída — R$ ${value.toLocaleString('pt-BR')}`,
      interactedAt: now,
    }).catch(err => console.error('[leads] concludeSale history:', err))
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

  /**
   * O dono viu a reentrada — o banco baixa o destaque e a tela acompanha.
   *
   * Banco primeiro, como todo o resto: só depois do UPDATE confirmado o card
   * deixa de brilhar. Se falhar, o destaque continua aceso (que é o estado
   * verdadeiro no banco) e o erro vai para o console — derrubar a abertura do
   * lead por causa de um aviso visual seria trocar um problema pequeno por um
   * grande. A RPC ignora quem não é dono; nesse caso nada muda, de propósito.
   */
  ackReentry: async (id) => {
    const lead = get().leads.find(l => l.id === id)
    if (!lead?.reentryAt) return
    if (lead.reentrySeenAt && new Date(lead.reentrySeenAt) >= new Date(lead.reentryAt)) return
    if (lead.brokerId !== getCurrentUserId()) return

    try {
      await db.leads.ackReentry(id)
      const now = new Date().toISOString()
      set(s => ({ leads: s.leads.map(l => l.id === id ? { ...l, reentrySeenAt: now, updatedAt: now } : l) }))
    } catch (err) {
      console.error('[leads] ackReentry:', err)
    }
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

  getActive: () => get().leads.filter(l => !l.discardReason && !l.closedAt),
  getDiscarded: () => get().leads.filter(l => !!l.discardReason),
}))
