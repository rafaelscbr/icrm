/**
 * dailyCounter.ts
 *
 * Controla o limite anti-ban (50/dia) e o cooldown entre envios.
 * Fonte de verdade exclusiva: banco de dados via useDisparosStore.
 * Sem estado local intermediário — o contador lê diretamente do store,
 * que é populado por load() na montagem e mantido atualizado pelo subscribe()
 * Realtime de disparo_logs.
 */

import { useDisparosStore } from '../../store/useDisparosStore'

export const DAILY_WARN  = 40   // aviso amarelo
export const DAILY_LIMIT = 50   // bloqueio

// ─── Hook principal ───────────────────────────────────────────────────────────

export function useDailyCounter() {
  // Lê diretamente do store — populado por load() + atualizado pelo Realtime subscribe()
  const count = useDisparosStore(s => s.countDay)

  // Retorna o próximo valor previsto (count+1) para os checks de toast de aviso.
  // Não modifica nenhum estado — a atualização real chega via Realtime após o INSERT.
  const increment = (): number => count + 1

  return { count, increment }
}
