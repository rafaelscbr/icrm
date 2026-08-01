import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
 */
export type KanbanSort = 'manual' | 'prioridade' | 'valor' | 'etapa' | 'criacao'

export const SORT_LABEL: Record<KanbanSort, string> = {
  manual:     'Ordem manual',
  prioridade: 'Prioridade',
  valor:      'Maior valor',
  etapa:      'Mais tempo na etapa',
  criacao:    'Mais recentes',
}

interface KanbanPrefs {
  /** Densidade compacta: esconde o contexto comercial e aperta o espaçamento. */
  dense: boolean
  /** Modo financeiro: mostra comissão em todas as etapas, não só nas finais. */
  financeMode: boolean
  sort: KanbanSort
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
      setDense: dense => set({ dense }),
      setFinanceMode: financeMode => set({ financeMode }),
      setSort: sort => set({ sort }),
    }),
    { name: 'icrm-kanban-prefs' }
  )
)
