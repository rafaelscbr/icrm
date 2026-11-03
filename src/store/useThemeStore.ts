import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'dark' | 'light'

interface ThemeStore {
  theme: Theme
  toggle: () => void
  setTheme: (t: Theme) => void
}

/**
 * Tema persistido em localStorage.
 *
 * O padrão da casa é o CLARO (v3, 02/11/2026) — a identidade visual Souza
 * passou a nascer do tema claro; o escuro continua completo no botão.
 *
 * O `version` existe porque trocar o valor inicial NÃO basta: estado persistido
 * sempre vence o default. Quando o Souza OS mudou o padrão, quem já usava o
 * sistema continuou vendo o tema antigo, e só quem abria pela primeira vez via
 * o novo — o que na prática significa que a mudança não chegava em ninguém.
 *
 * Histórico das migrações:
 *   v1 — levou todo mundo para o tema claro
 *   v2 — traz de volta para o escuro, que era o padrão definido pelo Rafael
 *   v3 — leva todo mundo para o claro: a identidade passa a girar em torno dele
 *
 * Cada migração roda UMA vez por navegador. Depois dela o botão de tema volta
 * a mandar: quem preferir claro troca, e a escolha é respeitada para sempre.
 *
 * Ao mudar o padrão de novo, SUBIR A VERSÃO — senão a mudança fica invisível
 * para quem já usa.
 *
 * O mesmo raciocínio está no script anti-flash do index.html — os dois leem a
 * mesma chave e precisam concordar, senão a tela pisca no tema errado.
 */
export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      theme: 'light',
      toggle: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark'
        set({ theme: next })
        applyTheme(next)
      },
      setTheme: (t) => {
        set({ theme: t })
        applyTheme(t)
      },
    }),
    {
      name: 'icrm-theme',
      version: 3,
      migrate: (persisted, version) => {
        const state = persisted as Partial<ThemeStore> | undefined
        // v1: Souza OS levou todo mundo para o claro.
        // v2: Rafael definiu o Marinho escuro como padrão da casa — a migração
        //     traz de volta quem a v1 tinha movido. Depois disso o botão de
        //     tema manda e a escolha de cada um é respeitada.
        // v3: o Rafael definiu o claro como padrão e base da identidade.
        if (version < 3) return { ...state, theme: 'light' as Theme }
        return state as ThemeStore
      },
    }
  )
)

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'light') {
    root.classList.add('light')
  } else {
    root.classList.remove('light')
  }
}
