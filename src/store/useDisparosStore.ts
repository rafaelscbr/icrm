/**
 * Store de disparos para lista fria.
 *
 * Cada clique de WhatsApp em campanha grava um registro em `disparo_logs`
 * no Supabase — dados persistem entre dispositivos e limpezas de cache.
 *
 * Lógica de contagem:
 *   diário  → registros com fired_at >= início do dia local
 *   semanal → últimos 7 dias
 *   mensal  → últimos 30 dias
 *   histórico → array [{date, count}] dos últimos N dias para gráficos
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

export interface DisparosState {
  // Contadores derivados do banco
  countDay:   number
  countWeek:  number
  countMonth: number
  // Histórico para gráfico (últimos 30 dias)
  history: { date: string; label: string; count: number }[]
  // Estado de loading
  loading: boolean
  // Ações
  load:      () => Promise<void>
  increment: () => Promise<number>   // grava no banco e retorna total do dia
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useDisparosStore = create<DisparosState>()((set, get) => ({
  countDay:  0,
  countWeek: 0,
  countMonth:0,
  history:   [],
  loading:   false,

  /** Lê contadores do Supabase e popula o estado. */
  load: async () => {
    set({ loading: true })
    try {
      const startOfDay   = `${todayIso()}T00:00:00`
      const startOfWeek  = daysAgoIso(7)
      const startOfMonth = daysAgoIso(30)

      // Três queries paralelas
      const [dayRes, weekRes, monthRes, histRes] = await Promise.all([
        supabase
          .from('disparo_logs')
          .select('id', { count: 'exact', head: true })
          .gte('fired_at', startOfDay),

        supabase
          .from('disparo_logs')
          .select('id', { count: 'exact', head: true })
          .gte('fired_at', startOfWeek),

        supabase
          .from('disparo_logs')
          .select('id', { count: 'exact', head: true })
          .gte('fired_at', startOfMonth),

        // Histórico detalhado (últimos 30 dias) para o gráfico
        supabase
          .from('disparo_logs')
          .select('fired_at')
          .gte('fired_at', startOfMonth)
          .order('fired_at', { ascending: true }),
      ])

      // Agrega histórico por dia
      const byDay: Record<string, number> = {}
      for (const row of (histRes.data ?? [])) {
        const d = (row.fired_at as string).slice(0, 10)
        byDay[d] = (byDay[d] ?? 0) + 1
      }

      const history = Array.from({ length: 30 }, (_, i) => {
        const dt = new Date()
        dt.setDate(dt.getDate() - (29 - i))
        const date = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
        return {
          date,
          label: `${dt.getDate()}/${dt.getMonth() + 1}`,
          count: byDay[date] ?? 0,
        }
      })

      set({
        countDay:   dayRes.count   ?? 0,
        countWeek:  weekRes.count  ?? 0,
        countMonth: monthRes.count ?? 0,
        history,
        loading: false,
      })
    } catch (err) {
      console.error('[DisparosStore] Erro ao carregar:', err)
      set({ loading: false })
    }
  },

  /** Grava um disparo no banco e atualiza os contadores localmente. */
  increment: async () => {
    // Atualiza local imediatamente (otimista) para a UI não travar
    set(s => ({
      countDay:   s.countDay   + 1,
      countWeek:  s.countWeek  + 1,
      countMonth: s.countMonth + 1,
      history: s.history.map((h, i) =>
        i === s.history.length - 1 ? { ...h, count: h.count + 1 } : h
      ),
    }))

    // Persiste no Supabase
    const { error } = await supabase
      .from('disparo_logs')
      .insert({ fired_at: new Date().toISOString() })

    if (error) {
      console.error('[DisparosStore] Erro ao gravar disparo:', error)
      // Reverte o otimismo se falhou
      set(s => ({
        countDay:   Math.max(0, s.countDay   - 1),
        countWeek:  Math.max(0, s.countWeek  - 1),
        countMonth: Math.max(0, s.countMonth - 1),
      }))
    }

    return get().countDay
  },
}))
