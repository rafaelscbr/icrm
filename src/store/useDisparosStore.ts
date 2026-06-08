/**
 * Store de disparos para lista fria.
 *
 * Cada clique de disparo grava um registro em `disparo_logs` com broker_id,
 * lead_list_id, campaign_id e lead_id — permitindo analytics por corretor.
 */

import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { getCurrentUserId } from '../lib/auth'

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

// Converte timestamp UTC do banco para YYYY-MM-DD no fuso local do dispositivo.
// Necessário porque fired_at é gravado em UTC e slice(0,10) retornaria a data UTC,
// que vira para o dia seguinte às 21h no Brasil (UTC-3).
function firedAtLocalDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
  brokerId:        string
  total:           number
  totalNew:        number
  totalFollowup:   number
  today:           number
  thisWeek:        number
  thisWeekNew:     number
  thisWeekFollowup: number
  thisMonth:       number
  thisMonthNew:    number
  thisMonthFollowup: number
  history:         { date: string; label: string; count: number }[]
}

export interface DisparosState {
  countDay:           number
  countWeek:          number
  countMonth:         number
  countDayNew:        number
  countWeekNew:       number
  countMonthNew:      number
  countDayFollowup:   number
  countWeekFollowup:  number
  countMonthFollowup: number
  history:      { date: string; label: string; count: number }[]
  /** Histórico dos últimos 30 dias apenas para dispatch_type='new' (gráficos de métricas) */
  historyNew:   { date: string; label: string; count: number }[]
  /** Timestamp UTC até quando o cooldown anti-ban do broker está ativo.
   *  Persistido no banco — sobrevive a navegação, F5 e troca de dispositivo. */
  cooldownUntil: string | null
  loading:       boolean
  load:          () => Promise<void>
  /** Assina disparo_logs via Realtime — retorna função de cancelamento */
  subscribe:   () => () => void
  /** Grava disparo com contexto completo */
  increment: (ctx?: {
    brokerId?:       string
    leadListId?:     string
    campaignId?:     string
    leadId?:         string
    leadName?:       string
    cooldownUntil?:  string
    dispatchType?:   'new' | 'followup'
  }) => Promise<void>
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
  countDay:           0,
  countWeek:          0,
  countMonth:         0,
  countDayNew:        0,
  countWeekNew:       0,
  countMonthNew:      0,
  countDayFollowup:   0,
  countWeekFollowup:  0,
  countMonthFollowup: 0,
  history:            [],
  historyNew:         [],
  cooldownUntil:      null,
  loading:            false,

  load: async () => {
    // Filtra sempre pelo broker atual — o contador é individual, nunca agregado.
    // Admin vê seus próprios disparos (não de todos os corretores).
    const brokerId = getCurrentUserId()
    if (!brokerId) return

    set({ loading: true })
    try {
      const startOfDay   = daysAgoIso(0)   // meia-noite local convertida para UTC
      const startOfWeek  = daysAgoIso(7)
      const startOfMonth = daysAgoIso(30)

      const [
        dayRes, weekRes, monthRes,
        dayNewRes, weekNewRes, monthNewRes,
        dayFollowupRes, weekFollowupRes, monthFollowupRes,
        histRes, histNewRes, cooldownRes,
      ] = await Promise.all([
        // Totais (inclui 'legacy')
        supabase.from('disparo_logs').select('id', { count: 'exact', head: true }).eq('broker_id', brokerId).gte('fired_at', startOfDay),
        supabase.from('disparo_logs').select('id', { count: 'exact', head: true }).eq('broker_id', brokerId).gte('fired_at', startOfWeek),
        supabase.from('disparo_logs').select('id', { count: 'exact', head: true }).eq('broker_id', brokerId).gte('fired_at', startOfMonth),
        // Novos disparos (tipo 'new')
        supabase.from('disparo_logs').select('id', { count: 'exact', head: true }).eq('broker_id', brokerId).eq('dispatch_type', 'new').gte('fired_at', startOfDay),
        supabase.from('disparo_logs').select('id', { count: 'exact', head: true }).eq('broker_id', brokerId).eq('dispatch_type', 'new').gte('fired_at', startOfWeek),
        supabase.from('disparo_logs').select('id', { count: 'exact', head: true }).eq('broker_id', brokerId).eq('dispatch_type', 'new').gte('fired_at', startOfMonth),
        // Follow-ups (tipo 'followup')
        supabase.from('disparo_logs').select('id', { count: 'exact', head: true }).eq('broker_id', brokerId).eq('dispatch_type', 'followup').gte('fired_at', startOfDay),
        supabase.from('disparo_logs').select('id', { count: 'exact', head: true }).eq('broker_id', brokerId).eq('dispatch_type', 'followup').gte('fired_at', startOfWeek),
        supabase.from('disparo_logs').select('id', { count: 'exact', head: true }).eq('broker_id', brokerId).eq('dispatch_type', 'followup').gte('fired_at', startOfMonth),
        // Histórico total (todos os tipos — para o gráfico de cooldown/anti-ban)
        supabase.from('disparo_logs').select('fired_at').eq('broker_id', brokerId).gte('fired_at', startOfMonth).order('fired_at', { ascending: true }),
        // Histórico apenas 'new' (para gráficos de métricas)
        supabase.from('disparo_logs').select('fired_at').eq('broker_id', brokerId).eq('dispatch_type', 'new').gte('fired_at', startOfMonth).order('fired_at', { ascending: true }),
        // Busca o cooldown_until mais recente para reconstruir o countdown após navegação/F5
        supabase.from('disparo_logs').select('cooldown_until').eq('broker_id', brokerId).not('cooldown_until', 'is', null).order('fired_at', { ascending: false }).limit(1),
      ])

      const byDay: Record<string, number> = {}
      for (const row of (histRes.data ?? [])) {
        const d = firedAtLocalDate(row.fired_at as string)
        byDay[d] = (byDay[d] ?? 0) + 1
      }

      const byDayNew: Record<string, number> = {}
      for (const row of (histNewRes.data ?? [])) {
        const d = firedAtLocalDate(row.fired_at as string)
        byDayNew[d] = (byDayNew[d] ?? 0) + 1
      }

      const buildHistory = (byDayMap: Record<string, number>) =>
        Array.from({ length: 30 }, (_, i) => {
          const dt = new Date()
          dt.setDate(dt.getDate() - (29 - i))
          const date = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
          return { date, label: `${dt.getDate()}/${dt.getMonth() + 1}`, count: byDayMap[date] ?? 0 }
        })

      const history    = buildHistory(byDay)
      const historyNew = buildHistory(byDayNew)

      const cooldownRow = (cooldownRes.data ?? [])[0] as { cooldown_until: string } | undefined
      const cooldownUntil = cooldownRow?.cooldown_until ?? null

      set({
        countDay:           dayRes.count           ?? 0,
        countWeek:          weekRes.count          ?? 0,
        countMonth:         monthRes.count         ?? 0,
        countDayNew:        dayNewRes.count        ?? 0,
        countWeekNew:       weekNewRes.count       ?? 0,
        countMonthNew:      monthNewRes.count      ?? 0,
        countDayFollowup:   dayFollowupRes.count   ?? 0,
        countWeekFollowup:  weekFollowupRes.count  ?? 0,
        countMonthFollowup: monthFollowupRes.count ?? 0,
        history,
        historyNew,
        cooldownUntil,
        loading: false,
      })
    } catch (err) {
      console.error('[DisparosStore] Erro ao carregar:', err)
      set({ loading: false })
    }
  },

  subscribe: () => {
    const brokerId = getCurrentUserId()
    const channelName = 'disparo-logs-counter'
    const existing = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`)
    if (existing) return () => {}

    // Filtra o canal pelo broker atual para receber apenas SEUS disparos.
    // Sem filtro, o canal dispararia load() para todos ao receber inserções de qualquer usuário,
    // fazendo o contador de cada corretor refletir os disparos de todos.
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'disparo_logs',
          ...(brokerId ? { filter: `broker_id=eq.${brokerId}` } : {}),
        },
        () => { get().load() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  },

  increment: async (ctx = {}) => {
    // Sem atualização otimista — o Realtime dispara load() ao confirmar o INSERT no banco,
    // garantindo que o contador sempre reflita o valor real persistido.
    const { error } = await supabase.from('disparo_logs').insert({
      fired_at:       new Date().toISOString(),
      broker_id:      ctx.brokerId      ?? null,
      lead_list_id:   ctx.leadListId    ?? null,
      campaign_id:    ctx.campaignId    ?? null,
      lead_id:        ctx.leadId        ?? null,
      lead_name:      ctx.leadName      ?? null,
      cooldown_until: ctx.cooldownUntil ?? null,
      dispatch_type:  ctx.dispatchType  ?? 'new',
    })

    if (error) {
      console.error('[DisparosStore] Erro ao gravar disparo:', error)
      throw error
    }

    // Atualiza cooldownUntil no store imediatamente para que useGlobalCooldown
    // reconstrua o countdown sem precisar aguardar o próximo load()
    if (ctx.cooldownUntil) {
      set({ cooldownUntil: ctx.cooldownUntil })
    }
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

    // Só devolve crédito se o disparo foi hoje (compara data local, não UTC)
    const dispatchedToday = firedAtLocalDate(row.fired_at as string) === todayIso()

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
    const startOfDay   = daysAgoIso(0)   // meia-noite local convertida para UTC
    const startOfWeek  = daysAgoIso(7)
    const startOfMonth = daysAgoIso(30)

    const { data } = await supabase
      .from('disparo_logs')
      .select('broker_id, fired_at, dispatch_type')
      .gte('fired_at', startOfMonth)
      .not('broker_id', 'is', null)

    const rows = data ?? []
    const byBroker: Record<string, {
      total: number; totalNew: number; totalFollowup: number
      today: number
      thisWeek: number; thisWeekNew: number; thisWeekFollowup: number
      thisMonth: number; thisMonthNew: number; thisMonthFollowup: number
      byDay: Record<string, number>
    }> = {}

    for (const row of rows) {
      const bid  = row.broker_id as string
      const type = (row.dispatch_type as string) ?? 'legacy'
      if (!byBroker[bid]) byBroker[bid] = {
        total: 0, totalNew: 0, totalFollowup: 0,
        today: 0,
        thisWeek: 0, thisWeekNew: 0, thisWeekFollowup: 0,
        thisMonth: 0, thisMonthNew: 0, thisMonthFollowup: 0,
        byDay: {},
      }
      byBroker[bid].total++
      byBroker[bid].thisMonth++
      if (type === 'new')      byBroker[bid].totalNew++
      if (type === 'followup') byBroker[bid].totalFollowup++
      if (row.fired_at >= startOfWeek) {
        byBroker[bid].thisWeek++
        if (type === 'new')      byBroker[bid].thisWeekNew++
        if (type === 'followup') byBroker[bid].thisWeekFollowup++
      }
      if (row.fired_at >= startOfMonth) {
        if (type === 'new')      byBroker[bid].thisMonthNew++
        if (type === 'followup') byBroker[bid].thisMonthFollowup++
      }
      if (row.fired_at >= startOfDay) byBroker[bid].today++
      const day = firedAtLocalDate(row.fired_at as string)
      byBroker[bid].byDay[day] = (byBroker[bid].byDay[day] ?? 0) + 1
    }

    return Object.entries(byBroker).map(([brokerId, d]) => ({
      brokerId,
      total:            d.total,
      totalNew:         d.totalNew,
      totalFollowup:    d.totalFollowup,
      today:            d.today,
      thisWeek:         d.thisWeek,
      thisWeekNew:      d.thisWeekNew,
      thisWeekFollowup: d.thisWeekFollowup,
      thisMonth:        d.thisMonth,
      thisMonthNew:     d.thisMonthNew,
      thisMonthFollowup: d.thisMonthFollowup,
      history: Array.from({ length: 30 }, (_, i) => {
        const dt = new Date()
        dt.setDate(dt.getDate() - (29 - i))
        const date = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
        return { date, label: `${dt.getDate()}/${dt.getMonth() + 1}`, count: d.byDay[date] ?? 0 }
      }),
    }))
  },
}))
