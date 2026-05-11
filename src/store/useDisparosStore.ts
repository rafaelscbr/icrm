import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface DisparosState {
  date:      string   // YYYY-MM-DD — reseta automático todo dia
  count:     number
  increment: () => void
  decrement: () => void
}

export const useDisparosStore = create<DisparosState>()(
  persist(
    (set, get) => ({
      date:  new Date().toISOString().slice(0, 10),
      count: 0,

      increment: () => {
        const today = new Date().toISOString().slice(0, 10)
        const { date, count } = get()
        // novo dia → zera e marca 1
        if (date !== today) set({ date: today, count: 1 })
        else                set({ count: count + 1 })
      },

      decrement: () => {
        const today = new Date().toISOString().slice(0, 10)
        const { date, count } = get()
        if (date !== today) set({ date: today, count: 0 })
        else if (count > 0) set({ count: count - 1 })
      },
    }),
    { name: 'icrm-disparos-diarios' }
  )
)
