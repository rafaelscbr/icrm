import { create } from 'zustand'
import { db } from '../lib/db'
import { LeadSlaConfig, SlaDia } from '../types'

/**
 * Rodízio por SLA — uma linha no banco (lead_sla_config). Carrega uma vez
 * por sessão: é lida pelos textos do card ("X min", "vai para o próximo") e
 * editada pelo admin em Configurações de Leads. O banco é a fonte de verdade:
 * a tela só mostra o que voltou do banco depois de salvar.
 */
interface SlaConfigStore {
  config:  LeadSlaConfig | null
  loading: boolean
  error:   boolean
  load:    (force?: boolean) => Promise<void>
  save:    (enabled: boolean, minutes: number, schedule: SlaDia[]) => Promise<LeadSlaConfig>
}

let emVoo: Promise<void> | null = null

export const useSlaConfigStore = create<SlaConfigStore>((set, get) => ({
  config:  null,
  loading: false,
  error:   false,

  load: async (force = false) => {
    // Sem `force`, um erro não é repetido por cada card que monta (evita
    // uma pilha de toasts) — a tela de Configurações tem o "Tentar de novo".
    if (!force && (get().config || get().error)) return
    if (emVoo) return emVoo
    set({ loading: true, error: false })
    emVoo = db.leadSlaConfig.fetch()
      .then(config => set({ config, loading: false }))
      .catch(() => set({ loading: false, error: true }))   // toast já disparado pela camada db
      .finally(() => { emVoo = null })
    return emVoo
  },

  save: async (enabled, minutes, schedule) => {
    const config = await db.leadSlaConfig.save(enabled, minutes, schedule)
    set({ config, error: false })
    return config
  },
}))

/** Rodízio ligado? `null` enquanto não carregou — o texto não promete nada. */
export function rodizioLigado(): boolean | null {
  const c = useSlaConfigStore.getState().config
  return c ? c.enabled : null
}
