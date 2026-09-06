import { useEffect, useRef, useState } from 'react'

function reduzMovimento(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Número que conta até o valor — o efeito de "dado chegando".
 *
 * Um indicador que aparece pronto não diz que acabou de ser lido; um que sobe
 * de 0 até 107 em 700 ms diz. É movimento a serviço do dado, não do enfeite:
 * dura menos de um segundo, roda uma vez por valor e respeita
 * `prefers-reduced-motion` (aí o número aparece pronto).
 *
 * Inteiros contam em inteiros; decimais interpolam. Se o valor mudar no meio
 * do caminho, a contagem continua de onde estava.
 */
export function useContagem(alvo: number, duracao = 700): number {
  const [valor, setValor] = useState(() => (reduzMovimento() ? alvo : 0))
  const atual = useRef(reduzMovimento() ? alvo : 0)

  useEffect(() => {
    if (!Number.isFinite(alvo) || reduzMovimento()) {
      atual.current = alvo
      setValor(alvo)
      return
    }
    const de = atual.current
    if (de === alvo) return
    const inteiro = Number.isInteger(de) && Number.isInteger(alvo)
    const inicio = performance.now()
    let raf = 0
    const passo = (t: number) => {
      const p = Math.min(1, (t - inicio) / duracao)
      const suave = 1 - Math.pow(1 - p, 3)
      const v = de + (alvo - de) * suave
      atual.current = v
      setValor(inteiro ? Math.round(v) : v)
      if (p < 1) raf = requestAnimationFrame(passo)
      else atual.current = alvo
    }
    raf = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(raf)
  }, [alvo, duracao])

  return valor
}
