import { create } from 'zustand'

export type PeriodPreset =
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'last_3'
  | 'last_6'
  | 'all'
  | 'custom'

interface PeriodStore {
  preset:    PeriodPreset
  startDate: string   // YYYY-MM-DD
  endDate:   string   // YYYY-MM-DD
  setPreset:      (preset: PeriodPreset) => void
  setCustomRange: (start: string, end: string) => void
  getLabel: () => string
  isAll:    () => boolean
}

function _pad(n: number) { return String(n).padStart(2, '0') }
function _lastDay(y: number, m: number): string {
  const d = new Date(y, m + 1, 0)
  return `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())}`
}
function _today(): string {
  const n = new Date()
  return `${n.getFullYear()}-${_pad(n.getMonth() + 1)}-${_pad(n.getDate())}`
}

export function rangeFromPreset(preset: Exclude<PeriodPreset, 'custom'>): { startDate: string; endDate: string } {
  const n = new Date()
  const y = n.getFullYear()
  const m = n.getMonth()

  switch (preset) {
    case 'this_month':
      return { startDate: `${y}-${_pad(m + 1)}-01`, endDate: _lastDay(y, m) }
    case 'last_month': {
      const d = new Date(y, m - 1, 1)
      return { startDate: `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-01`, endDate: _lastDay(d.getFullYear(), d.getMonth()) }
    }
    case 'this_year':
      return { startDate: `${y}-01-01`, endDate: `${y}-12-31` }
    case 'last_3': {
      const d = new Date(y, m - 2, 1)
      return { startDate: `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-01`, endDate: _today() }
    }
    case 'last_6': {
      const d = new Date(y, m - 5, 1)
      return { startDate: `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-01`, endDate: _today() }
    }
    case 'all':
      return { startDate: '0000-01-01', endDate: '9999-12-31' }
  }
}

const _initial = rangeFromPreset('this_month')

export const usePeriodStore = create<PeriodStore>((set, get) => ({
  preset:    'this_month',
  startDate: _initial.startDate,
  endDate:   _initial.endDate,

  setPreset: (preset) => {
    if (preset === 'custom') {
      set({ preset })
    } else {
      set({ preset, ...rangeFromPreset(preset) })
    }
  },

  setCustomRange: (start, end) => {
    set({ preset: 'custom', startDate: start, endDate: end })
  },

  getLabel: () => {
    const { preset, startDate, endDate } = get()
    const n = new Date()
    switch (preset) {
      case 'this_month':  return `${MONTHS_PT[n.getMonth()]} ${n.getFullYear()}`
      case 'last_month': {
        const d = new Date(n.getFullYear(), n.getMonth() - 1, 1)
        return `${MONTHS_PT[d.getMonth()]} ${d.getFullYear()}`
      }
      case 'this_year':  return String(n.getFullYear())
      case 'last_3':     return 'Últimos 3 meses'
      case 'last_6':     return 'Últimos 6 meses'
      case 'all':        return 'Acumulado'
      case 'custom': {
        const fmt = (d: string) => {
          const [y, mo, da] = d.split('-')
          return `${da}/${mo}/${y.slice(2)}`
        }
        return `${fmt(startDate)} – ${fmt(endDate)}`
      }
    }
  },

  isAll: () => get().preset === 'all',
}))

export function matchesPeriod(dateStr: string, startDate: string, endDate: string): boolean {
  if (!dateStr) return false
  return dateStr >= startDate && dateStr <= endDate
}

export const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

// Retrocompatibilidade
export type PeriodMode = 'month' | 'year' | 'all'
export function isInPeriod(dateStr: string, year: number, month: number): boolean {
  const pad = (n: number) => String(n).padStart(2, '0')
  return matchesPeriod(dateStr, `${year}-${pad(month + 1)}-01`, `${year}-${pad(month + 1)}-${new Date(year, month + 1, 0).getDate()}`)
}
