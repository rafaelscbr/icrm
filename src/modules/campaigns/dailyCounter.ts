import { useState } from 'react'
import { localDateStr } from '../../lib/formatters'

export const DAILY_WARN  = 25
export const DAILY_LIMIT = 30

const DAILY_KEY = 'wapp_daily_sends'

// ─── Leitura ──────────────────────────────────────────────────────────────────

export function getDailySends(): number {
  try {
    const data = JSON.parse(localStorage.getItem(DAILY_KEY) ?? '{}')
    return data[localDateStr()] ?? 0
  } catch { return 0 }
}

/** Retorna a soma dos últimos N dias (padrão 7 = semana). */
export function getSendsByDays(days: number): number {
  try {
    const data = JSON.parse(localStorage.getItem(DAILY_KEY) ?? '{}')
    let total = 0
    for (let i = 0; i < days; i++) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      total += data[d.toISOString().slice(0, 10)] ?? 0
    }
    return total
  } catch { return 0 }
}

export function getWeeklySends  (): number { return getSendsByDays(7)  }
export function getMonthlySends (): number { return getSendsByDays(30) }

/** Array {date, count} para os últimos N dias — para gráficos. */
export function getDisparosHistory(days = 30): { date: string; label: string; count: number }[] {
  try {
    const data = JSON.parse(localStorage.getItem(DAILY_KEY) ?? '{}')
    return Array.from({ length: days }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (days - 1 - i))
      const date = d.toISOString().slice(0, 10)
      return {
        date,
        label: `${d.getDate()}/${d.getMonth() + 1}`,
        count: data[date] ?? 0,
      }
    })
  } catch { return [] }
}

// ─── Escrita ──────────────────────────────────────────────────────────────────

export function incrementDailySends(): number {
  try {
    const today = localDateStr()
    const data  = JSON.parse(localStorage.getItem(DAILY_KEY) ?? '{}')
    data[today] = (data[today] ?? 0) + 1
    // mantém 31 dias de histórico
    const sorted = Object.keys(data).sort().reverse().slice(0, 31)
    const clean: Record<string, number> = {}
    sorted.forEach(k => { clean[k] = data[k] })
    localStorage.setItem(DAILY_KEY, JSON.stringify(clean))
    return data[today]
  } catch { return 0 }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDailyCounter() {
  const [count, setCount] = useState(getDailySends)
  const increment = () => { const n = incrementDailySends(); setCount(n); return n }
  return { count, increment }
}
