/**
 * Store de disparos para lista fria.
 *
 * Cada clique de disparo grava um registro em `disparo_logs` com broker_id,
 * lead_list_id, campaign_id e lead_id — permitindo analytics por corretor.
 */

import { create } from 'zustand'
import { supabase } from '../lib/supabase'

// ─── Helpers de data ──────────────────────────────────────────────────────────

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysAgoIso(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface DisparoLog {
  id:           string
  fired_at:     string
  broker_id?:   string
  lead_list_id?: string
  campaign_id?: string
  lead_id?:     string
  lead_name?:   string
}

/** Resumo de disparos por corretor para a tela de analytics */
export interface BrokerDisparoSummary {
  brokerId:    string
  total:       number
  today:       number
  thisWeek:    number
  thisMonth:   number
  history:     { date: string; label: string; count: number }[]
}

export interface DisparosState {
  countDay:    number
  countWeek:   number
  countMonth:  number
  history:     { date: string; label: string; count: number }[]
  loading:     boolean
  load:        () => Promise<void>
  /** Grava disparo com contexto completo */
  increment: (ctx?: {
    brokerId?:    string
    leadListId?:  string
    campaignId?:  string
    leadId?:      string
    leadName?:    string
  }) => Promise<number>
  /**
   * Devolve 1 crédito ao limite diário quando um lead é marcado como
   * telefone inválido pela PRIMEIRA vez. Remove o disparo_log mais recente
   * desse lead para que ele não consuma o limite anti-ban.
   * Só executa se existir ao menos 1 registro em disparo_logs para o lead.
   */
  refund: (leadId: string) => Promise<void>
  /** Carrega resumo por corretor (admin only) */
  loadBrokerSummaries: () => Promise<BrokerDisparoSummary[]>
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useDisparosStore = create<DisparosState>()((set, get) => ({
  countDay:   0,
  countWeek:  0,
  countMonth: 0,
  history:    [],
  loading:    false,

  load: async () => {
    set({ loading: true })
    try {
      const startOfDay   = `${todayIso()}T00:00:00`
      const startOfWeek  = daysAgoIso(7)
      const startOfMonth = daysAgoIso(30)

      const [dayRes, weekRes, monthRes, histRes] = await Promise.all([
        supabase.from('disparo_logs').select('id', { count: 'exact', head: true }).gte('fired_at', startOfDay),
        supabase.from('disparo_logs').select('id', { count: 'exact', head: true }).gte('fired_at', startOfWeek),
        supabase.from('disparo_logs').select('id', { count: 'exact', head: true }).gte('fired_at', startOfMonth),
        supabase.from('disparo_logs').select('fired_at').gte('fired_at', startOfMonth).order('fired_at', { ascending: true }),
      ])

      const byDay: Record<string, number> = {}
      for (const row of (histRes.data ?? [])) {
        const d = (row.fired_at as string).slice(0, 10)
        byDay[d] = (byDay[d] ?? 0) + 1
      }

      const history = Array.from({ length: 30 }, (_, i) => {
        const dt = new Date()
        dt.setDate(dt.getDate() - (29 - i))
        const date = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
        return { date, label: `${dt.getDate()}/${dt.getMonth() + 1}`, count: byDay[date] ?? 0 }
      })

      set({ countDay: dayRes.count ?? 0, countWeek: weekRes.count ?? 0, countMonth: monthRes.count ?? 0, history, loading: false })
    } catch (err) {
      console.error('[DisparosStore] Erro ao carregar:', err)
      set({ loading: false })
    }
  },

  increment: async (ctx = {}) => {
    set(s => ({
      countDay:   s.countDay   + 1,
      countWeek:  s.countWeek  + 1,
      countMonth: s.countMonth + 1,
      history: s.history.map((h, i) => i === s.history.length - 1 ? { ...h, count: h.count + 1 } : h),
    }))

    const { error } = await supabase.from('disparo_logs').insert({
      fired_at:     new Date().toISOString(),
      broker_id:    ctx.brokerId    ?? null,
      lead_list_id: ctx.leadListId  ?? null,
      campaign_id:  ctx.campaignId  ?? null,
      lead_id:      ctx.leadId      ?? null,
      lead_name:    ctx.leadName    ?? null,
    })

    if (error) {
      console.error('[DisparosStore] Erro ao gravar disparo:', error)
      set(s => ({
        countDay:   Math.max(0, s.countDay   - 1),
        countWeek:  Math.max(0, s.countWeek  - 1),
        countMonth: Math.max(0, s.countMonth - 1),
      }))
    }

    return get().countDay
  },

  refund: async (leadId: string) => {
    // Busca o disparo mais recente para este lead
    const { data: rows } = await supabase
      .from('disparo_logs')
      .select('id, fired_at')
      .eq('lead_id', leadId)
      .order('fired_at', { ascending: false })
      .limit(1)

    if (!rows || rows.length === 0) return  // nenhum disparo registrado

    const row = rows[0] as { id: string; fired_at: string }

    // Só devolve crédito se o disparo foi hoje
    const today = todayIso()
    const dispatchedToday = (row.fired_at as string).startsWith(today)

    const { error } = await supabase
      .from('disparo_logs')
      .delete()
      .eq('id', row.id)

    if (error) {
      console.error('[DisparosStore] Erro ao devolver crédito:', error)
      return
    }

    // Atualiza contadores locais somente se o disparo era de hoje
    if (dispatchedToday) {
      set(s => ({
        countDay:   Math.max(0, s.countDay   - 1),
        countWeek:  Math.max(0, s.countWeek  - 1),
        countMonth: Math.max(0, s.countMonth - 1),
        history: s.history.map((h, i) =>
          i === s.history.length - 1 ? { ...h, count: Math.max(0, h.count - 1) } : h
        ),
      }))
    }
  },

  loadBrokerSummaries: async () => {
    const startOfDay   = `${todayIso()}T00:00:00`
    const startOfWeek  = daysAgoIso(7)
    const startOfMonth = daysAgoIso(30)

    const { data } = await supabase
      .from('disparo_logs')
      .select('broker_id, fired_at')
      .gte('fired_at', startOfMonth)
      .not('broker_id', 'is', null)

    const rows = data ?? []
    const byBroker: Record<string, { total: number; today: number; thisWeek: number; thisMonth: number; byDay: Record<string, number> }> = {}

    for (const row of rows) {
      const bid = row.broker_id as string
      if (!byBroker[bid]) byBroker[bid] = { total: 0, today: 0, thisWeek: 0, thisMonth: 0, byDay: {} }
      byBroker[bid].total++
      byBroker[bid].thisMonth++
      if (row.fired_at >= startOfWeek) byBroker[bid].thisWeek++
      if (row.fired_at >= startOfDay)  byBroker[bid].today++
      const day = (row.fired_at as string).slice(0, 10)
      byBroker[bid].byDay[day] = (byBroker[bid].byDay[day] ?? 0) + 1
    }

    return Object.entries(byBroker).map(([brokerId, d]) => ({
      brokerId,
      total:     d.total,
      today:     d.today,
      thisWeek:  d.thisWeek,
      thisMonth: d.thisMonth,
      history: Array.from({ length: 30 }, (_, i) => {
        const dt = new Date()
        dt.setDate(dt.getDate() - (29 - i))
        const date = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
        return { date, label: `${dt.getDate()}/${dt.getMonth() + 1}`, count: d.byDay[date] ?? 0 }
      }),
    }))
  },
}))
