/**
 * dailyCounter.ts
 *
 * Controla o limite anti-ban (50/dia) e o cooldown entre envios.
 * Fonte de verdade: banco de dados (disparo_logs via useDisparosStore).
 * O estado local React é apenas para resposta imediata de UI — sincroniza com
 * o banco a cada montagem do componente e a cada disparo confirmado.
 */

import { useState, useEffect } from 'react'
import { useDisparosStore } from '../../store/useDisparosStore'

export const DAILY_WARN  = 40   // aviso amarelo
export const DAILY_LIMIT = 50   // bloqueio

// ─── Hook principal ───────────────────────────────────────────────────────────

export function useDailyCounter() {
  // Estado local para resposta de UI imediata — sempre sincronizado com o banco
  const [count, setCount] = useState(0)

  // Fonte de verdade: banco de dados via useDisparosStore
  const dbCountDay = useDisparosStore(s => s.countDay)

  // Mantém estado local sempre sincronizado com o banco
  useEffect(() => {
    setCount(dbCountDay)
  }, [dbCountDay])

  const increment = (): number => {
    const next = count + 1
    setCount(next)
    return next
  }

  return { count, increment }
}
