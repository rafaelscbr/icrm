import { create } from 'zustand'
import { db } from '../lib/db'
import { msAteProximaVolta } from '../lib/pausaLeads'
import type { LeadPause, LeadPausePreset } from '../types'

/**
 * Pausa no recebimento de leads (migração 089).
 *
 * Guarda as pausas EM VIGOR segundo o banco: a do próprio usuário e, para o
 * admin, a de todos. O banco é a fonte de verdade — pausar e retomar só mudam
 * o estado depois que o banco confirmou.
 *
 * Custo de rede: uma leitura pequena ao montar a barra, uma a cada vez que o
 * menu abre e uma no minuto em que a primeira pausa acaba. Nada de assinatura
 * em tempo real nem de releitura periódica.
 */
interface LeadPauseStore {
  pausas:     LeadPause[]
  carregado:  boolean
  carregando: boolean
  erro:       boolean
  carregar:   () => Promise<void>
  pausar:     (preset: LeadPausePreset) => Promise<LeadPause>
  /** O próprio usuário volta a receber — ou o admin devolve outro corretor à roleta. */
  retomar:    (brokerId: string) => Promise<void>
}

let emVoo: Promise<void> | null = null
let relogio: ReturnType<typeof setTimeout> | null = null

export const useLeadPauseStore = create<LeadPauseStore>((set, get) => {
  /** Quando a primeira pausa vencer, pergunta de novo ao banco. */
  function agendarVolta(pausas: LeadPause[]) {
    if (relogio) { clearTimeout(relogio); relogio = null }
    const ms = msAteProximaVolta(pausas)
    if (ms === null) return
    // +1,5 s: o relógio do navegador pode estar um pouco adiantado.
    relogio = setTimeout(() => { void get().carregar() }, ms + 1500)
  }

  function guardar(pausas: LeadPause[]) {
    set({ pausas, carregado: true, carregando: false, erro: false })
    agendarVolta(pausas)
  }

  return {
    pausas:     [],
    carregado:  false,
    carregando: false,
    erro:       false,

    carregar: async () => {
      if (emVoo) return emVoo
      set({ carregando: true })
      emVoo = db.leadPauses.ativas()
        .then(guardar)
        // Falhou: não se afirma nem "recebendo" nem "em pausa" — a tela mostra o erro.
        // `carregado` volta a false: o estado anterior pode estar velho.
        .catch(() => set({ carregado: false, carregando: false, erro: true }))
        .finally(() => { emVoo = null })
      return emVoo
    },

    pausar: async (preset) => {
      const nova = await db.leadPauses.pausar(preset)
      guardar([...get().pausas.filter(p => p.brokerId !== nova.brokerId), nova])
      return nova
    },

    retomar: async (brokerId) => {
      await db.leadPauses.retomar(brokerId)
      guardar(get().pausas.filter(p => p.brokerId !== brokerId))
    },
  }
})
