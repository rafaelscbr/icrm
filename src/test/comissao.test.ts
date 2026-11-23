import { describe, it, expect } from 'vitest'
import { comissaoBruta, comissaoLiquida, divisao, parteDoCorretor, totaisComissao } from '../modules/leads/comissao'

describe('comissão do Kanban', () => {
  it('5% do VGV, menos 3% de ISS e depois 6% do Simples', () => {
    expect(comissaoBruta(600_000)).toBe(30_000)
    // 30.000 − 3% = 29.100; − 6% = 27.354
    expect(comissaoLiquida(600_000)).toBeCloseTo(27_354, 6)
  })

  it('a parte do corretor sai da líquida', () => {
    expect(parteDoCorretor(600_000, 40)).toBeCloseTo(10_941.6, 6)   // Ryan
    expect(parteDoCorretor(600_000, 50)).toBeCloseTo(13_677, 6)     // Dionata
    expect(parteDoCorretor(600_000, null)).toBe(0)
  })

  it('divisão: o que é do corretor e o que fica com a Souza', () => {
    const d = divisao(600_000, 40)
    expect(d.corretor).toBeCloseTo(10_941.6, 6)
    expect(d.souza).toBeCloseTo(16_412.4, 6)
    expect(divisao(600_000, null)).toMatchObject({ corretor: 0, souza: 27_354 })
  })

  it('totais da coluna: VGV, líquida, corretores e o que fica com a Souza', () => {
    const share = (id: string | null | undefined) => (id === 'ryan' ? 40 : id === 'dio' ? 50 : null)
    const t = totaisComissao([
      { averageTicket: 600_000, brokerId: 'ryan' },
      { averageTicket: 600_000, brokerId: 'dio' },
      { averageTicket: 600_000, brokerId: 'rafael' },
      { brokerId: 'ryan' },                                  // sem valor: não entra
    ], share)
    expect(t.vgv).toBe(1_800_000)
    expect(t.liquida).toBeCloseTo(82_062, 6)
    expect(t.corretores).toBeCloseTo(10_941.6 + 13_677, 6)
    expect(t.souza).toBeCloseTo(82_062 - 24_618.6, 6)
  })
})
