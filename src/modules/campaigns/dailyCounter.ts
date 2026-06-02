/**
 * dailyCounter.ts
 *
 * Controla o limite anti-ban (50/dia) e o cooldown entre envios.
 * Fonte de verdade: banco de dados (disparo_logs via useDisparosStore).
 * localStorage usado APENAS como cache de sessão para incremento instantâneo
 * sem round-trip ao banco — sincronizado com o banco ao montar o componente.
 */

import { useState, useEffect } from 'react'
import { localDateStr } from '../../lib/formatters'
import { useDisparosStore } from '../../store/useDisparosStore'

export const DAILY_WARN  = 40   // aviso amarelo
export const DAILY_LIMIT = 50   // bloqueio

const SESSION_KEY = 'wapp_session_sends'

// ─── Helpers localStorage (cache de sessão) ───────────────────────────────────

export function getDailySends(): number {
  try {
    const data = JSON.parse(localStorage.getItem(SESSION_KEY) ?? '{}')
    return data[localDateStr()] ?? 0
  } catch { return 0 }
}

function setDailySends(n: number) {
  try {
    const today = localDateStr()
    localStorage.setItem(SESSION_KEY, JSON.stringify({ [today]: n }))
  } catch { /* ignore */ }
}

export function incrementSessionCount(): number {
  try {
    const today = localDateStr()
    const data  = JSON.parse(localStorage.getItem(SESSION_KEY) ?? '{}')
    data[today] = (data[today] ?? 0) + 1
    localStorage.setItem(SESSION_KEY, JSON.stringify({ [today]: data[today] }))
    return data[today]
  } catch { return 0 }
}

// ─── Hook principal ───────────────────────────────────────────────────────────

export function useDailyCounter() {
  // Inicia do localStorage para resposta imediata
  const [count, setCount] = useState(getDailySends)

  // Fonte de verdade: banco de dados via useDisparosStore
  const dbCountDay = useDisparosStore(s => s.countDay)

  // Sincroniza com o banco sempre que o store carregar ou atualizar
  useEffect(() => {
    if (dbCountDay > count) {
      setCount(dbCountDay)
      setDailySends(dbCountDay)
    }
  }, [dbCountDay])

  const increment = () => {
    const n = incrementSessionCount()
    setCount(n)
    return n
  }

  return { count, increment }
}
