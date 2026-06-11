import { describe, it, expect } from 'vitest'
import {
  calcularAssociativo, AssociativoInput, mesIndex, mesAnoLabel,
} from '../modules/simulador/associativo/calc'

// Cenário da planilha de simulação do Garden Park (Libra):
// apto de R$ 480.000 — entrada 12,3%, parcelas 7,7% em 36x, balões 5% em 3x
// anuais, saldo de 75% financiado. INCC projetado de 5% a.a.
const GARDEN_PARK: AssociativoInput = {
  valorTotal: 480000,
  entradaQtd: 1,   entradaValor: 59040,
  parcelasQtd: 36, parcelaValor: 480000 * 0.077 / 36, // 1.026,67
  balaoQtd: 3,     balaoValor: 8000,
  indice: 'incc',  taxaIndiceAnual: 5, aplicarCorrecao: true,
  inicioParcelas: '2026-01', financiamento: '2027-12', entrega: '2030-12',
  jurosObraMensal: 0.83, taxaAdm: 25, seguro: 79, pctObraAssinatura: 0,
  taxaBancoAnual: 10, prazoMeses: 420, sistema: 'price',
}

describe('calcularAssociativo — composição', () => {
  const r = calcularAssociativo(GARDEN_PARK)

  it('fecha a composição da planilha: 25% na obra, 75% financiado', () => {
    expect(r.valido).toBe(true)
    expect(r.entradaTotal).toBeCloseTo(59040, 2)
    expect(r.parcelasTotal).toBeCloseTo(36960, 2)
    expect(r.balaoTotal).toBeCloseTo(24000, 2)
    expect(r.pagoNaObra).toBeCloseTo(120000, 2)
    expect(r.saldoFinanciar).toBeCloseTo(360000, 2)
    expect(r.pagoNaObraPct).toBeCloseTo(25, 5)
    expect(r.saldoFinanciarPct).toBeCloseTo(75, 5)
  })
})

describe('calcularAssociativo — correção pelo índice', () => {
  const r = calcularAssociativo(GARDEN_PARK)

  it('taxa mensal equivalente ao INCC de 5% a.a. bate com a planilha (C12)', () => {
    expect(r.taxaMensalIndice).toBeCloseTo(0.0040741237836483535, 10)
  })

  it('1ª parcela corrigida bate com a planilha (D12 = 1.030,85)', () => {
    expect(r.primeiraParcelaCorrigida).toBeCloseTo(1030.8494337512125, 4)
  })

  it('última parcela (36ª) corrigida = base × 1,05³', () => {
    expect(r.ultimaParcelaCorrigida).toBeCloseTo((480000 * 0.077 / 36) * Math.pow(1.05, 3), 4)
  })

  it('balão do 12º mês corrigido = 8.000 × 1,05', () => {
    const dez26 = r.fluxo.find(m => m.idx === mesIndex('2026-12'))
    expect(dez26?.balao).toBeCloseTo(8400, 4)
  })

  it('sem correção, parcelas e balões ficam no valor base', () => {
    const semCorr = calcularAssociativo({ ...GARDEN_PARK, aplicarCorrecao: false })
    expect(semCorr.primeiraParcelaCorrigida).toBeCloseTo(GARDEN_PARK.parcelaValor, 6)
    expect(semCorr.ultimaParcelaCorrigida).toBeCloseTo(GARDEN_PARK.parcelaValor, 6)
    const dez26 = semCorr.fluxo.find(m => m.idx === mesIndex('2026-12'))
    expect(dez26?.balao).toBeCloseTo(8000, 6)
  })
})

describe('calcularAssociativo — taxa de obra', () => {
  const r = calcularAssociativo(GARDEN_PARK)

  it('dura da assinatura+1 até a entrega: 36 meses', () => {
    expect(r.mesesTaxaObra).toBe(36)
    const antes = r.fluxo.find(m => m.idx === mesIndex('2027-12'))
    const primeira = r.fluxo.find(m => m.idx === mesIndex('2028-01'))
    const ultima = r.fluxo.find(m => m.idx === mesIndex('2030-12'))
    expect(antes?.taxaObra).toBeNull()
    expect(primeira?.taxaObra).not.toBeNull()
    expect(ultima?.taxaObra).not.toBeNull()
  })

  it('pico na entrega = saldo × juros + adm + seguro', () => {
    expect(r.taxaObraUltima).toBeCloseTo(360000 * 0.0083 + 25 + 79, 4) // 3.092
  })

  it('1º mês = 1/36 do saldo liberado', () => {
    expect(r.taxaObraPrimeira).toBeCloseTo(360000 * (1 / 36) * 0.0083 + 25 + 79, 4) // 187
  })

  it('obra já iniciada na assinatura desloca o ponto de partida', () => {
    const meio = calcularAssociativo({ ...GARDEN_PARK, pctObraAssinatura: 50 })
    expect(meio.taxaObraPrimeira).toBeCloseTo(360000 * (0.5 + 0.5 / 36) * 0.0083 + 25 + 79, 4)
    expect(meio.taxaObraUltima).toBeCloseTo(360000 * 0.0083 + 25 + 79, 4)
  })
})

describe('calcularAssociativo — fluxo e marcos', () => {
  const r = calcularAssociativo(GARDEN_PARK)

  it('fluxo cobre da 1ª parcela até a entrega (60 meses)', () => {
    expect(r.fluxo).toHaveLength(60)
    expect(r.fluxo[0].label).toBe('jan/26')
    expect(r.fluxo[59].label).toBe('dez/30')
  })

  it('parcela some após a 36ª; marcos nos meses certos', () => {
    const p37 = r.fluxo[36]
    expect(p37.parcela).toBeNull()
    expect(r.fluxo.find(m => m.idx === mesIndex('2027-12'))?.marco).toBe('financiamento')
    expect(r.fluxo.find(m => m.idx === mesIndex('2030-12'))?.marco).toBe('entrega')
  })

  it('avisa quando as parcelas passam da entrega', () => {
    const longo = calcularAssociativo({ ...GARDEN_PARK, parcelasQtd: 70, parcelaValor: 100 })
    expect(longo.avisos).toContain('As parcelas continuam após a entrega da obra.')
  })
})

describe('calcularAssociativo — financiamento estimado', () => {
  it('PRICE sobre o saldo nominal', () => {
    const r = calcularAssociativo(GARDEN_PARK)
    const im = Math.pow(1.1, 1 / 12) - 1
    expect(r.parcelaFinanciamento).toBeCloseTo(360000 * im / (1 - Math.pow(1 + im, -420)), 4)
  })

  it('SAC: 1ª parcela = amortização + juros do saldo', () => {
    const r = calcularAssociativo({ ...GARDEN_PARK, sistema: 'sac' })
    const im = Math.pow(1.1, 1 / 12) - 1
    expect(r.parcelaFinanciamento).toBeCloseTo(360000 / 420 + 360000 * im, 4)
  })
})

describe('calcularAssociativo — validações', () => {
  it('financiamento depois da entrega é inválido', () => {
    const r = calcularAssociativo({ ...GARDEN_PARK, financiamento: '2031-01' })
    expect(r.valido).toBe(false)
    expect(r.erro).toMatch(/antes da entrega/)
  })

  it('composição acima do valor do imóvel é inválida', () => {
    const r = calcularAssociativo({ ...GARDEN_PARK, entradaValor: 500000 })
    expect(r.valido).toBe(false)
    expect(r.erro).toMatch(/superam/)
  })

  it('parcelas zeradas são inválidas', () => {
    const r = calcularAssociativo({ ...GARDEN_PARK, parcelasQtd: 0 })
    expect(r.valido).toBe(false)
  })
})

describe('helpers de mês', () => {
  it('mesIndex e mesAnoLabel', () => {
    expect(mesIndex('2027-01') - mesIndex('2026-12')).toBe(1)
    expect(mesAnoLabel('2027-12')).toBe('dez/2027')
  })
})
