import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LeadFunnelStage } from '../types'

/**
 * Preferências de visualização do Kanban.
 *
 * Persistidas porque são ajuste de posto de trabalho, não estado de sessão:
 * quem trabalha o dia todo no funil escolhe a densidade uma vez e espera que
 * ela continue lá depois do F5.
 *
 * IMPORTANTE: `sort` não altera nada no banco. Arrastar um card continua
 * gravando `kanbanOrder`; os outros critérios são só formas de olhar a mesma
 * coluna. Por isso "manual" é o padrão — é a única ordenação que reflete o
 * que o corretor organizou à mão.
 *
 * `colunasAbertas` (11/11/2026): coluna vazia nasce recolhida (trilho); a que
 * o corretor abre à mão continua aberta depois do F5. Guardada por usuário
 * (chave = id do login), para quem divide o computador não herdar o quadro
 * do outro. Fica no aparelho, não no banco: é ajuste de tela, o clique
 * responde na hora e não gera escrita nem tráfego — mesma escolha da
 * densidade e da ordenação.
 */
export type KanbanSort =
  | 'manual' | 'sem_contato' | 'prioridade' | 'valor' | 'etapa' | 'criacao' | 'antigos'

export const SORT_LABEL: Record<KanbanSort, string> = {
  manual:      'Ordem manual',
  sem_contato: 'Mais tempo sem contato',
  prioridade:  'Prioridade primeiro',
  valor:       'Maior valor',
  etapa:       'Mais tempo na etapa',
  criacao:     'Entrada mais recente',
  antigos:     'Entrada mais antiga',
}

interface KanbanPrefs {
  /** Densidade compacta: esconde o contexto comercial e aperta o espaçamento. */
  dense: boolean
  /** Modo financeiro: mostra comissão em todas as etapas, não só nas finais. */
  financeMode: boolean
  sort: KanbanSort
  /** Colunas vazias abertas à mão, por usuário: { [userId]: etapas } */
  colunasAbertas: Record<string, LeadFunnelStage[]>
  alternarColuna: (userId: string, stage: LeadFunnelStage) => void
  setDense: (v: boolean) => void
  setFinanceMode: (v: boolean) => void
  setSort: (v: KanbanSort) => void
}

export const useKanbanPrefs = create<KanbanPrefs>()(
  persist(
    set => ({
      dense: false,
      financeMode: false,
      sort: 'manual',
      colunasAbertas: {},
      alternarColuna: (userId, stage) => set(s => {
        const atuais = s.colunasAbertas[userId] ?? []
        const proximas = atuais.includes(stage) ? atuais.filter(e => e !== stage) : [...atuais, stage]
        return { colunasAbertas: { ...s.colunasAbertas, [userId]: proximas } }
      }),
      setDense: dense => set({ dense }),
      setFinanceMode: financeMode => set({ financeMode }),
      setSort: sort => set({ sort }),
    }),
    { name: 'icrm-kanban-prefs' }
  )
)
