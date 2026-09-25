import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { FiltrosLead, FILTROS_VAZIOS } from '../modules/leads/leadFiltros'
import type { KanbanSort } from './useKanbanPrefs'

/**
 * Filtros do funil — compartilhados entre Lista e Kanban.
 *
 * Trocar de visão não pode desfazer o recorte: quem filtrou "sem contato há
 * mais de 7 dias" na lista e passou para o Kanban quer ver os mesmos leads,
 * agora por coluna.
 *
 * Guardado em `sessionStorage`, não em `localStorage`: sobrevive a abrir outra
 * tela e voltar, e ao F5, mas não atravessa o dia. Filtro esquecido de ontem
 * escondendo lead hoje é o tipo de coisa que faz alguém achar que o sistema
 * perdeu dado. A busca fica de fora pelo mesmo motivo — é sempre do momento.
 *
 * Não é dado operacional: nada aqui vai para o banco nem muda o que existe.
 */

export type OrdemLista = Exclude<KanbanSort, 'manual'>

type Multipla = 'etapas' | 'origens' | 'temperaturas' | 'encaixes' | 'corretores' | 'produtos'

interface LeadFiltersState {
  filtros: FiltrosLead
  ordemLista: OrdemLista
  definir: (patch: Partial<FiltrosLead>) => void
  /** liga/desliga um valor numa faceta de múltipla escolha */
  alternar: <K extends Multipla>(faceta: K, valor: FiltrosLead[K][number]) => void
  limpar: () => void
  setOrdemLista: (o: OrdemLista) => void
}

export const useLeadFiltersStore = create<LeadFiltersState>()(
  persist(
    set => ({
      filtros: FILTROS_VAZIOS,
      ordemLista: 'criacao',
      definir: patch => set(s => ({ filtros: { ...s.filtros, ...patch } })),
      alternar: (faceta, valor) => set(s => {
        const atual = s.filtros[faceta] as string[]
        const prox = atual.includes(valor as string)
          ? atual.filter(v => v !== valor)
          : [...atual, valor as string]
        return { filtros: { ...s.filtros, [faceta]: prox } }
      }),
      // A busca sobrevive ao "Limpar filtros": ela tem o próprio X na caixa.
      limpar: () => set(s => ({ filtros: { ...FILTROS_VAZIOS, busca: s.filtros.busca } })),
      setOrdemLista: ordemLista => set({ ordemLista }),
    }),
    {
      name: 'icrm-lead-filtros',
      version: 1,
      storage: createJSONStorage(() => sessionStorage),
      partialize: s => ({ filtros: { ...s.filtros, busca: '' }, ordemLista: s.ordemLista }),
      // Campo novo em versão futura chega com o valor vazio, não `undefined`.
      merge: (persistido, atual) => {
        const p = (persistido ?? {}) as Partial<LeadFiltersState>
        return {
          ...atual,
          ...p,
          filtros: { ...FILTROS_VAZIOS, ...(p.filtros ?? {}), busca: '' },
        }
      },
    }
  )
)
