/**
 * dailyCounter.ts
 *
 * Responsabilidade ÚNICA: controlar o limite anti-ban (30/dia) e o
 * cooldown entre envios. Usa localStorage APENAS como cache de sessão
 * para essa proteção — o histórico real vive no Supabase (useDisparosStore).
 */

import { useState } from 'react'
import { localDateStr } from '../../lib/formatters'

export const DAILY_WARN  = 25
export const DAILY_LIMIT = 30

const SESSION_KEY = 'wapp_session_sends'   // cache de sessão — só proteção anti-ban

// ─── Leitura (cache de sessão) ────────────────────────────────────────────────

export function getDailySends(): number {
  try {
    const data = JSON.parse(localStorage.getItem(SESSION_KEY) ?? '{}')
    return data[localDateStr()] ?? 0
  } catch { return 0 }
}

// ─── Escrita (cache de sessão) ────────────────────────────────────────────────

export function incrementSessionCount(): number {
  try {
    const today = localDateStr()
    const data  = JSON.parse(localStorage.getItem(SESSION_KEY) ?? '{}')
    // Limpa dias antigos — só guarda hoje
    data[today] = (data[today] ?? 0) + 1
    localStorage.setItem(SESSION_KEY, JSON.stringify({ [today]: data[today] }))
    return data[today]
  } catch { return 0 }
}

// ─── Hook (apenas para controle de limite anti-ban na UI) ────────────────────

export function useDailyCounter() {
  const [count, setCount] = useState(getDailySends)
  const increment = () => {
    const n = incrementSessionCount()
    setCount(n)
    return n
  }
  return { count, increment }
}
