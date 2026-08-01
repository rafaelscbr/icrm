import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Estado recolhido da navegação lateral.
 *
 * Persistido porque é preferência de espaço de trabalho, não estado de sessão:
 * quem trabalha o dia inteiro no Kanban quer a barra estreita sempre, e ter que
 * recolher de novo a cada F5 seria ruído.
 */
interface SidebarStore {
  collapsed: boolean
  toggle: () => void
}

export const useSidebarStore = create<SidebarStore>()(
  persist(
    set => ({
      collapsed: false,
      toggle: () => set(s => ({ collapsed: !s.collapsed })),
    }),
    { name: 'icrm-sidebar' }
  )
)
