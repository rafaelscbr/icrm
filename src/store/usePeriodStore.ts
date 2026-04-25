import { create } from 'zustand'

export type PeriodMode = 'month' | 'year' | 'all'

interface PeriodStore {
  mode:  PeriodMode
  year:  number
  month: number   // 0-indexed: Jan=0 … Dez=11 (usado só quando mode='month')
  setMode:  (mode: PeriodMode) => void
  prev:     () => void
  next:     () => void
  reset:    () => void
  isCurrentPeriod: () => boolean
  getLabel: () => string
}

const _now = new Date()

export const usePeriodStore = create<PeriodStore>((set, get) => ({
  mode:  'month',
  year:  _now.getFullYear(),
  month: _now.getMonth(),

  setMode: (mode) => {
    const n = new Date()
    // Ao trocar de modo, redefine para o período atual
    set({ mode, year: n.getFullYear(), month: n.getMonth() })
  },

  prev: () => {
    const { mode, year, month } = get()
    if (mode === 'all') return
    if (mode === 'year') {
      set({ year: year - 1 })
    } else {
      if (month === 0) set({ year: year - 1, month: 11 })
      else             set({ year, month: month - 1 })
    }
  },

  next: () => {
    const { mode, year, month } = get()
    if (mode === 'all') return
    const n = new Date()
    if (mode === 'year') {
      if (year >= n.getFullYear()) return
      set({ year: year + 1 })
    } else {
      if (year === n.getFullYear() && month >= n.getMonth()) return
      if (month === 11) set({ year: year + 1, month: 0 })
      else              set({ year, month: month + 1 })
    }
  },

  reset: () => {
    const n = new Date()
    set({ year: n.getFullYear(), month: n.getMonth() })
  },

  isCurrentPeriod: () => {
    const { mode, year, month } = get()
    const n = new Date()
    if (mode === 'all')   return true
    if (mode === 'year')  return year === n.getFullYear()
    return year === n.getFullYear() && month === n.getMonth()
  },

  getLabel: () => {
    const { mode, year, month } = get()
    if (mode === 'all')  return 'Todos os períodos'
    if (mode === 'year') return String(year)
    return `${MONTHS_PT[month]} ${year}`
  },
}))

/**
 * Retorna true se dateStr (YYYY-MM-DD) corresponde ao período selecionado.
 * mode='all'   → sempre true
 * mode='year'  → mesmo ano
 * mode='month' → mesmo ano e mês
 */
export function matchesPeriod(
  dateStr: string,
  mode: PeriodMode,
  year: number,
  month: number,
): boolean {
  if (mode === 'all') return true
  if (!dateStr) return false
  const parts = dateStr.split('-')
  if (parts.length < 2) return false
  if (mode === 'year')  return Number(parts[0]) === year
  return Number(parts[0]) === year && Number(parts[1]) === month + 1
}

/** isInPeriod mantido para retrocompatibilidade (mode=month implícito). */
export function isInPeriod(dateStr: string, year: number, month: number): boolean {
  return matchesPeriod(dateStr, 'month', year, month)
}

export const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
