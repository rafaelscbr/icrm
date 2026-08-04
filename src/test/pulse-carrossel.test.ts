import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCarrossel, ROTACAO_MS } from '../modules/pulse/useCarrossel'

/**
 * O carrossel é o único ponto do Pulse onde a tela muda sem ninguém pedir.
 * Se a rotação ignorar o toque, quem parou para ler uma página perde a página
 * embaixo do nariz — pior do que não rodar. Estes testes travam esse contrato.
 */

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const avancar = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

describe('useCarrossel', () => {
  it('roda sozinho pelas páginas, em ciclo', () => {
    const { result } = renderHook(() => useCarrossel(3))
    expect(result.current.pagina).toBe(0)

    avancar(ROTACAO_MS)
    expect(result.current.pagina).toBe(1)

    avancar(ROTACAO_MS)
    expect(result.current.pagina).toBe(2)

    // volta ao começo em vez de parar na última
    avancar(ROTACAO_MS)
    expect(result.current.pagina).toBe(0)
  })

  it('toque pausa o ciclo — a página escolhida não é trocada embaixo do nariz', () => {
    const { result } = renderHook(() => useCarrossel(3))

    act(() => { result.current.irPara(2) })
    expect(result.current.pagina).toBe(2)
    expect(result.current.pausado).toBe(true)

    // dois ciclos inteiros se passam e a página continua onde foi deixada
    avancar(ROTACAO_MS * 2)
    expect(result.current.pagina).toBe(2)
  })

  it('retoma a rotação depois da pausa, de onde estiver', () => {
    const { result } = renderHook(() => useCarrossel(3))

    act(() => { result.current.irPara(1) })
    avancar(60_000)                      // fim da janela de pausa
    expect(result.current.pausado).toBe(false)

    avancar(ROTACAO_MS)
    // segue de 1 para 2 — não pula de volta para o início
    expect(result.current.pagina).toBe(2)
  })

  it('cada página ganha o ciclo inteiro após uma troca manual', () => {
    const { result } = renderHook(() => useCarrossel(3))

    avancar(ROTACAO_MS - 2000)           // quase virando
    act(() => { result.current.irPara(0) })
    avancar(60_000)                      // sai da pausa

    avancar(ROTACAO_MS - 1000)
    expect(result.current.pagina).toBe(0)  // ainda não virou
    avancar(1000)
    expect(result.current.pagina).toBe(1)
  })

  it('não rotaciona quando só existe uma página', () => {
    const { result } = renderHook(() => useCarrossel(1))
    avancar(ROTACAO_MS * 3)
    expect(result.current.pagina).toBe(0)
  })

  it('irPara respeita os limites', () => {
    const { result } = renderHook(() => useCarrossel(3))
    act(() => { result.current.irPara(9) })
    expect(result.current.pagina).toBe(2)
    act(() => { result.current.irPara(-3) })
    expect(result.current.pagina).toBe(0)
  })
})
