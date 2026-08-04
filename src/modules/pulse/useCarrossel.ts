import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Carrossel das páginas do Pulse — rotação automática com respeito ao toque.
 *
 * O iPad é um quiosque: ninguém fica com a mão nele, então a tela precisa
 * passear sozinha pelas páginas. Mas quando alguém DECIDE olhar uma página,
 * trocar embaixo do nariz é pior do que não rodar.
 *
 * Daí as duas regras:
 *
 *   • ROTAÇÃO — troca de página a cada ROTACAO_MS.
 *   • PAUSA AO TOQUE — qualquer deslize ou clique congela o ciclo por
 *     PAUSA_MS. Depois disso ele retoma de onde estiver, sem pular de volta
 *     para o começo (voltar sozinho seria outro jeito de tirar a tela da mão
 *     de quem está lendo).
 *
 * O gesto só conta como horizontal quando X domina Y — sem isso, rolar o feed
 * com o dedo trocaria de página sem querer.
 */

const DISTANCIA_MINIMA_PX = 60
/** X precisa dominar Y nesta proporção para o gesto virar troca de página. */
const DOMINANCIA_HORIZONTAL = 1.5

export const ROTACAO_MS = 30_000
const PAUSA_MS = 60_000

export function useCarrossel(totalPaginas: number) {
  const [pagina, setPagina]   = useState(0)
  const [pausado, setPausado] = useState(false)

  const inicio      = useRef<{ x: number; y: number } | null>(null)
  const timerPausa  = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Marca interação humana: congela o ciclo e agenda a retomada. */
  const pausar = useCallback(() => {
    setPausado(true)
    if (timerPausa.current) clearTimeout(timerPausa.current)
    timerPausa.current = setTimeout(() => setPausado(false), PAUSA_MS)
  }, [])

  const irPara = useCallback((n: number) => {
    setPagina(Math.max(0, Math.min(totalPaginas - 1, n)))
    pausar()
  }, [totalPaginas, pausar])

  // Rotação automática. Não roda enquanto pausado, e o timer é recriado a cada
  // troca de página — assim a página nova sempre ganha os 30s inteiros.
  useEffect(() => {
    if (pausado || totalPaginas < 2) return
    const t = setTimeout(() => setPagina(p => (p + 1) % totalPaginas), ROTACAO_MS)
    return () => clearTimeout(t)
  }, [pagina, pausado, totalPaginas])

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0]
    inicio.current = { x: t.clientX, y: t.clientY }
  }, [])

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!inicio.current) return
    const t  = e.changedTouches[0]
    const dx = t.clientX - inicio.current.x
    const dy = t.clientY - inicio.current.y
    inicio.current = null

    if (Math.abs(dx) < DISTANCIA_MINIMA_PX) return
    if (Math.abs(dx) < Math.abs(dy) * DOMINANCIA_HORIZONTAL) return   // era rolagem

    setPagina(p => Math.max(0, Math.min(totalPaginas - 1, dx < 0 ? p + 1 : p - 1)))
    pausar()
  }, [totalPaginas, pausar])

  // Setas do teclado — acessibilidade e teste sem touch.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') irPara(pagina + 1)
      if (e.key === 'ArrowLeft')  irPara(pagina - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pagina, irPara])

  useEffect(() => () => { if (timerPausa.current) clearTimeout(timerPausa.current) }, [])

  return { pagina, pausado, irPara, onTouchStart, onTouchEnd }
}
