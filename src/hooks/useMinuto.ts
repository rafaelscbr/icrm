import { useSyncExternalStore } from 'react'

/**
 * Um relógio que bate uma vez por minuto, o mesmo para todos que o leem.
 *
 * As cores de contato do Kanban (contato.ts) dependem da hora: à meia-noite o
 * azul vira amarelo, e o cartão vira laranja quando completa 24 h. Sem isto o
 * cartão só mudava quando algum dado mudava. Um intervalo só, ligado enquanto
 * houver alguém ouvindo, alinhado ao começo de cada minuto.
 */

let agora = Date.now()
const ouvintes = new Set<() => void>()
let timer: ReturnType<typeof setTimeout> | null = null

function bater() {
  agora = Date.now()
  ouvintes.forEach(f => f())
  timer = setTimeout(bater, 60_000 - (agora % 60_000))
}

function assinar(f: () => void) {
  ouvintes.add(f)
  if (!timer) {
    agora = Date.now()
    timer = setTimeout(bater, 60_000 - (agora % 60_000))
  }
  return () => {
    ouvintes.delete(f)
    if (ouvintes.size === 0 && timer) { clearTimeout(timer); timer = null }
  }
}

export function useMinuto(): number {
  return useSyncExternalStore(assinar, () => agora, () => agora)
}
