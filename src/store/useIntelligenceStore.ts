import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { LeadIntel } from '../lib/intelligence'

/**
 * Inteligência de todos os leads visíveis, numa chamada.
 *
 * O Kanban pinta ~113 cards. Pedir a nota lead a lead seriam 113 viagens ao
 * banco a cada abertura da tela — o padrão que já custou um incidente de egress
 * aqui. A RPC devolve o mapa inteiro de uma vez.
 *
 * Nada disso é persistido em `leads`: temperatura decai com o tempo, e coluna
 * materializada precisaria de um job para não mentir. Calcular na leitura custa
 * uma consulta e nunca fica velho.
 */

interface IntelligenceStore {
  intel: Record<string, LeadIntel>
  loading: boolean
  loadedAt: number | null
  load: (force?: boolean) => Promise<void>
  get: (leadId: string) => LeadIntel | undefined
}

/** Janela em que o mapa é reaproveitado sem ir ao banco de novo. */
const FRESCOR_MS = 60_000

export const useIntelligenceStore = create<IntelligenceStore>((set, get) => ({
  intel: {},
  loading: false,
  loadedAt: null,

  load: async (force = false) => {
    const { loading, loadedAt } = get()
    if (loading) return
    if (!force && loadedAt && Date.now() - loadedAt < FRESCOR_MS) return

    set({ loading: true })
    try {
      const { data, error } = await supabase.rpc('leads_intelligence')
      if (error) throw error
      set({ intel: (data as Record<string, LeadIntel>) ?? {}, loadedAt: Date.now() })
    } catch (err) {
      // Sem toast: a inteligência é camada de apoio. Se falhar, o funil continua
      // funcionando sem os selos — derrubar a tela por causa disso seria pior.
      console.error('[intelligence] load:', err)
    } finally {
      set({ loading: false })
    }
  },

  get: (leadId) => get().intel[leadId],
}))
