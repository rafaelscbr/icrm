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
 * `version: 1` existe por um motivo específico: quando o Souza OS trocou o
 * padrão de escuro para claro, trocar o valor inicial não bastou. Quem já usava
 * o sistema tinha `{"theme":"dark"}` gravado, e estado persistido sempre vence
 * o default — na prática o time inteiro continuou vendo a interface antiga e
 * escura, enquanto só quem abria pela primeira vez via o tema novo.
 *
 * A migração roda UMA vez por navegador e leva quem estava no escuro para o
 * claro. Depois disso o botão de tema volta a mandar: quem preferir escuro
 * troca e a escolha é respeitada para sempre.
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
      version: 1,
      migrate: (persisted, version) => {
        const state = persisted as Partial<ThemeStore> | undefined
        // v0 → v1: adoção do tema claro como padrão do Souza OS.
        if (version < 1) return { ...state, theme: 'light' as Theme }
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
