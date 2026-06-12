import { create } from 'zustand'

/**
 * Estado global da busca (⌘K). Permite abrir a busca de qualquer ponto da UI
 * (atalho de teclado, pílula da sidebar, botão do mobile) sem prop drilling.
 */
interface SearchState {
  open: boolean
  setOpen: (open: boolean) => void
}

export const useSearchStore = create<SearchState>(set => ({
  open: false,
  setOpen: open => set({ open }),
}))
