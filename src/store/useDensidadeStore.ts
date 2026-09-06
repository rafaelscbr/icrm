import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Densidade das listas — preferência de posto de trabalho, como o tema.
 *
 * "Compacta" aperta o espaçamento vertical das linhas (Leads, Contatos,
 * Tarefas, Notificações, Prioridades) sem esconder informação: é a mesma
 * linha, com menos ar. Quem passa o dia varrendo listas ganha mais linhas por
 * tela; quem lê de relance fica no confortável.
 *
 * Aplicada como classe no <html> (`html.compacta`) e resolvida no CSS — as
 * linhas só carregam a classe `lista-linha`.
 */
interface DensidadeStore {
  compacta: boolean
  setCompacta: (compacta: boolean) => void
}

export const useDensidadeStore = create<DensidadeStore>()(
  persist(
    set => ({
      compacta: false,
      setCompacta: compacta => {
        set({ compacta })
        aplicarDensidade(compacta)
      },
    }),
    { name: 'icrm-densidade' },
  ),
)

export function aplicarDensidade(compacta: boolean) {
  document.documentElement.classList.toggle('compacta', compacta)
}
