import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Navegação por deslize entre as páginas do Pulse.
 *
 * O iPad é um quiosque: ninguém fica com a mão nele. Duas decisões vêm daí:
 *
 *   • RETORNO AUTOMÁTICO — se alguém desliza para o resumo de ontem e se
 *     distrai, a tela ficaria parada no passado o dia inteiro, que é o oposto
 *     do que o painel serve. Depois de VOLTA_AUTOMATICA_MS sem toque ela
 *     retorna sozinha para o ao vivo.
 *
 *   • O gesto só conta como horizontal quando o deslocamento em X domina o
 *     em Y. Sem isso, rolar o feed com o dedo mudaria de página sem querer.
 */

const DISTANCIA_MINIMA_PX = 60
/** X precisa dominar Y nesta proporção para o gesto virar troca de página. */
const DOMINANCIA_HORIZONTAL = 1.5
const VOLTA_AUTOMATICA_MS = 45_000

export function useCarrossel(totalPaginas: number) {
  const [pagina, setPagina] = useState(0)
  const inicio = useRef<{ x: number; y: number } | null>(null)
  const timerVolta = useRef<ReturnType<typeof setTimeout> | null>(null)

  const agendarVolta = useCallback(() => {
    if (timerVolta.current) clearTimeout(timerVolta.current)
    timerVolta.current = setTimeout(() => setPagina(0), VOLTA_AUTOMATICA_MS)
  }, [])

  const irPara = useCallback((n: number) => {
    const alvo = Math.max(0, Math.min(totalPaginas - 1, n))
    setPagina(alvo)
    if (alvo === 0) {
      if (timerVolta.current) clearTimeout(timerVolta.current)
    } else {
      agendarVolta()
    }
  }, [totalPaginas, agendarVolta])

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

    setPagina(p => {
      const alvo = Math.max(0, Math.min(totalPaginas - 1, dx < 0 ? p + 1 : p - 1))
      if (alvo !== 0) agendarVolta()
      else if (timerVolta.current) clearTimeout(timerVolta.current)
      return alvo
    })
  }, [totalPaginas, agendarVolta])

  // Setas do teclado — acessibilidade e teste sem touch.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') irPara(pagina + 1)
      if (e.key === 'ArrowLeft')  irPara(pagina - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pagina, irPara])

  useEffect(() => () => { if (timerVolta.current) clearTimeout(timerVolta.current) }, [])

  return { pagina, irPara, onTouchStart, onTouchEnd }
}
