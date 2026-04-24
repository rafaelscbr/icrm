import { create } from 'zustand'

interface PeriodStore {
  year:  number
  month: number  // 0-indexed: Jan=0 … Dez=11
  prev:  () => void
  next:  () => void
  reset: () => void
  isCurrentMonth: () => boolean
}

const now = new Date()

export const usePeriodStore = create<PeriodStore>((set, get) => ({
  year:  now.getFullYear(),
  month: now.getMonth(),

  prev: () => {
    const { year, month } = get()
    if (month === 0) set({ year: year - 1, month: 11 })
    else             set({ year, month: month - 1 })
  },

  next: () => {
    const { year, month } = get()
    const n = new Date()
    // Não permite navegar além do mês atual
    if (year === n.getFullYear() && month === n.getMonth()) return
    if (month === 11) set({ year: year + 1, month: 0 })
    else              set({ year, month: month + 1 })
  },

  reset: () => {
    const n = new Date()
    set({ year: n.getFullYear(), month: n.getMonth() })
  },

  isCurrentMonth: () => {
    const { year, month } = get()
    const n = new Date()
    return year === n.getFullYear() && month === n.getMonth()
  },
}))

/** Retorna true se dateStr (YYYY-MM-DD) pertence ao year/month informados. */
export function isInPeriod(dateStr: string, year: number, month: number): boolean {
  if (!dateStr) return false
  const parts = dateStr.split('-')
  if (parts.length < 2) return false
  return Number(parts[0]) === year && Number(parts[1]) === month + 1
}

export const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
