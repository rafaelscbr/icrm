import { useState } from 'react'
import { localDateStr } from '../../lib/formatters'

export const DAILY_WARN  = 15
export const DAILY_LIMIT = 20

const DAILY_KEY = 'wapp_daily_sends'

export function getDailySends(): number {
  try {
    const data = JSON.parse(localStorage.getItem(DAILY_KEY) ?? '{}')
    return data[localDateStr()] ?? 0
  } catch { return 0 }
}

export function incrementDailySends(): number {
  try {
    const today = localDateStr()
    const data  = JSON.parse(localStorage.getItem(DAILY_KEY) ?? '{}')
    data[today] = (data[today] ?? 0) + 1
    const sorted = Object.keys(data).sort().reverse().slice(0, 7)
    const clean: Record<string, number> = {}
    sorted.forEach(k => { clean[k] = data[k] })
    localStorage.setItem(DAILY_KEY, JSON.stringify(clean))
    return data[today]
  } catch { return 0 }
}

export function useDailyCounter() {
  const [count, setCount] = useState(getDailySends)
  const increment = () => { const n = incrementDailySends(); setCount(n); return n }
  return { count, increment }
}
