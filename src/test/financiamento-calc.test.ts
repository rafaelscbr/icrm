import { describe, it, expect } from 'vitest'
import {
  simular, taxaMensal, prazoMaximoPermitido, idadeHoje,
  compararBancos, coefMip, totais, parcelaSac, parcelaPrice, ParametrosBanco, EntradaSimulacao,
} from '../modules/simulador/financiamento/calc'

// Os casos combinados com o Rafael em 24/11/2026 — os números precisam bater.
const CAIXA: ParametrosBanco = {
  id: 'caixa', nome: 'Caixa', sigla: 'CEF', logoUrl: null, ativo: true,
  taxaSfh: 11.49, taxaSfi: null, indexador: 'TR',
  cotaSac: 80, cotaPrice: 70, prazoMaximo: 420, idadeMaximaMeses: 966,
  comprometimento: 30, mip: [{ idadeAte: 80, coef: 0.025 }], dfi: 0.01, tarifa: 25,
  atualizadoEm: null, atualizadoPor: null,
}

const BASE: EntradaSimulacao = {
  valorImovel: 720_000, entrada: 200_000,
  sistema: 'sac', prazo: 420,
}

describe('caso base — Caixa, SAC, 420 meses, 11,49% a.a.', () => {
  const r = simular(BASE, CAIXA)

  it('taxa mensal ≈ 0,9105%', () => {
    expect(taxaMensal(11.49) * 100).toBeCloseTo(0.9105, 4)
    expect(r.i * 100).toBeCloseTo(0.9105, 4)
  })
  it('amortização ≈ R$ 1.238,10', () => expect(r.amortizacao).toBeCloseTo(1238.10, 2))
  it('juros do 1º mês ≈ R$ 4.734,56', () => expect(r.juros1).toBeCloseTo(4734.56, 1))
  it('1ª parcela sem encargos entre R$ 5.970 e 5.975', () => {
    expect(r.parcela1).toBeGreaterThanOrEqual(5970)
    expect(r.parcela1).toBeLessThanOrEqual(5975)
  })
  it('encargos: MIP 0,025% do saldo, DFI 0,01% do imóvel, tarifa R$ 25', () => {
    expect(r.mip).toBeCloseTo(130, 2)
    expect(r.dfi).toBeCloseTo(72, 2)
    expect(r.tarifa).toBe(25)
  })
  it('parcela total ≈ R$ 6.200', () => expect(Math.abs(r.parcelaTotal - 6200)).toBeLessThan(5))
  it('renda necessária entre R$ 20.650 e 20.700', () => {
    expect(r.rendaNecessaria).toBeGreaterThanOrEqual(20650)
    expect(r.rendaNecessaria).toBeLessThanOrEqual(20700)
  })
  it('dentro da cota do SAC (72% < 80%) e sem aviso', () => {
    expect(r.valido).toBe(true)
    expect(r.cotaEstourada).toBe(false)
    expect(r.avisos).toEqual([])
  })
})

describe('imóvel pronto: valor − entrada − FGTS, sem correção da obra', () => {
  const r = simular(BASE, CAIXA)

  it('financiado = valor − entrada', () => {
    expect(r.saldo).toBe(520_000)
    expect(r.financiado).toBe(520_000)
    expect(simular({ ...BASE, fgts: 20_000 }, CAIXA).financiado).toBe(500_000)
  })

  it('renda de R$ 19.000: fora da regra, com o que falta', () => {
    const inv = simular({ ...BASE, rendaCliente: 19_000 }, CAIXA).inverso!
    expect(inv.passa).toBe(false)
    expect(inv.comprometimentoAtual).toBeGreaterThan(0.3)
    expect(inv.diferenca).toBeLessThan(0)
    const renda = inv.sugestoes.find(s => s.tipo === 'renda')!
    expect(renda.valor).toBeCloseTo(r.rendaNecessaria - 19_000, 2)
    // FGTS que zera o excesso: com ele, a renda passa
    const fgts = inv.sugestoes.find(s => s.tipo === 'fgts')!.valor
    const comFgts = simular({ ...BASE, rendaCliente: 19_000, fgts: fgts + 1 }, CAIXA)
    expect(comFgts.inverso!.passa).toBe(true)
    // Entrada a mais também resolve
    const entrada = inv.sugestoes.find(s => s.tipo === 'entrada')!.valor
    expect(entrada).toBeCloseTo(fgts, 6)
    const comEntrada = simular({ ...BASE, entrada: 200_000 + entrada + 1, rendaCliente: 19_000 }, CAIXA)
    expect(comEntrada.inverso!.passa).toBe(true)
  })

  it('o saldo máximo da renda exigida é o próprio financiado', () => {
    const inv = simular({ ...BASE, rendaCliente: r.rendaNecessaria }, CAIXA).inverso!
    expect(inv.saldoMaximo).toBeCloseTo(r.financiado, 0)
    expect(inv.passa).toBe(true)
    expect(inv.comprometimentoAtual).toBeCloseTo(0.3, 6)
  })
})

describe('limites do banco', () => {
  it('Price com 72% financiado estoura a cota de 70%', () => {
    const r = simular({ ...BASE, entrada: 720_000 * 0.28, sistema: 'price' }, CAIXA)
    expect(r.cotaEstourada).toBe(true)
    expect(r.faltaEntradaCota).toBeCloseTo(720_000 * 0.02, 2)
    expect(r.avisos.join(' ')).toMatch(/cota/)
  })

  it('idade de 60 anos: prazo máximo de 246 meses', () => {
    expect(prazoMaximoPermitido(CAIXA, 60 * 12)).toBe(246)
    const r = simular({ ...BASE, idade: 60, prazo: 420 }, CAIXA)
    expect(r.prazoMaximo).toBe(246)
    expect(r.prazo).toBe(246)
  })

  it('sem idade, o prazo é o máximo do banco', () => {
    expect(prazoMaximoPermitido(CAIXA, null)).toBe(420)
    expect(simular({ ...BASE, prazo: null }, CAIXA).prazo).toBe(420)
  })

  it('acima do teto do SFH vira SFI; sem taxa SFI cadastrada, não simula', () => {
    const r = simular({ ...BASE, valorImovel: 3_000_000, entrada: 1_000_000 }, CAIXA)
    expect(r.sfi).toBe(true)
    expect(r.valido).toBe(false)
    const comSfi = simular({ ...BASE, valorImovel: 3_000_000, entrada: 1_000_000 }, { ...CAIXA, taxaSfi: 12 })
    expect(comSfi.valido).toBe(true)
    expect(comSfi.taxaAnual).toBe(12)
  })

  it('banco sem taxa cadastrada não simula (não se inventa taxa)', () => {
    const r = simular(BASE, { ...CAIXA, taxaSfh: null })
    expect(r.valido).toBe(false)
    expect(r.erro).toMatch(/taxa/)
  })

  it('taxa editada pelo corretor vence a do banco', () => {
    expect(simular({ ...BASE, taxaAnual: 10.99 }, CAIXA).taxaAnual).toBe(10.99)
  })
})

describe('peças', () => {
  it('SAC cai e Price fica reta; totais de juros', () => {
    const i = taxaMensal(11.49)
    expect(parcelaSac(520_000, i, 420, 420)).toBeLessThan(parcelaSac(520_000, i, 420, 1))
    const t = totais('sac', 520_000, i, 420)
    expect(t.totalJuros).toBeCloseTo(i * 520_000 * 421 / 2, 2)
    const p = totais('price', 520_000, i, 420)
    expect(p.totalPago).toBeCloseTo(parcelaPrice(520_000, i, 420) * 420, 2)
    expect(p.totalJuros).toBeGreaterThan(t.totalJuros)
  })

  it('MIP por faixa; sem idade usa a maior', () => {
    const f = [{ idadeAte: 30, coef: 0.01 }, { idadeAte: 50, coef: 0.02 }, { idadeAte: 80, coef: 0.05 }]
    expect(coefMip(f, 25)).toBe(0.01)
    expect(coefMip(f, 45)).toBe(0.02)
    expect(coefMip(f, null)).toBe(0.05)
    expect(coefMip([], 40)).toBe(0)
  })

  it('a idade envelhece sozinha a partir da data informada', () => {
    expect(idadeHoje(40, '2024-06-10', new Date(2026, 10, 24))).toBe(42)
    expect(idadeHoje(40, '2024-12-10', new Date(2026, 10, 24))).toBe(41)
    expect(idadeHoje(null, '2024-06-10')).toBeNull()
  })

  it('comparativo: só bancos ativos com taxa, da menor renda para a maior', () => {
    const lista = compararBancos(BASE, [
      CAIXA,
      { ...CAIXA, id: 'b', nome: 'B', taxaSfh: 10.5 },
      { ...CAIXA, id: 'c', nome: 'C', taxaSfh: null },
      { ...CAIXA, id: 'd', nome: 'D', taxaSfh: 9, ativo: false },
    ])
    expect(lista.map(x => x.banco.id)).toEqual(['b', 'caixa'])
  })
})

import { calcularRepasse, pctFinanciado } from '../modules/simulador/financiamento/repasse'

describe('renda do repasse na ficha do lead (automática, pior cenário)', () => {
  const hoje = new Date(2026, 10, 24)
  const plano = [{ name: 'Fluxo da tabela', financingPct: 72 }]

  it('sai da tipologia: preço × % financiado, em valores de hoje', () => {
    const rep = calcularRepasse({ preco: 720_000, planos: plano, rendaPiso: 19_000, idade: null, hoje }, CAIXA)!
    expect(rep.entrada).toBeCloseTo(201_600, 2)
    expect(rep.r.financiado).toBeCloseTo(518_400, 2)
    expect(rep.r.prazo).toBe(420)
    expect(rep.r.inverso!.rendaCliente).toBe(19_000)
    expect(rep.r.inverso!.passa).toBe(false)
  })

  it('a idade informada envelhece e encurta o prazo', () => {
    const rep = calcularRepasse({ preco: 720_000, planos: plano, rendaPiso: null, idade: 58, idadeInformadaEm: '2024-11-01', hoje }, CAIXA)!
    expect(rep.idade).toBe(60)
    expect(rep.r.prazo).toBe(246)
    expect(rep.r.inverso).toBeNull()
  })

  it('sem preço ou sem % financiado na tabela, não inventa', () => {
    expect(calcularRepasse({ preco: 0, planos: plano, rendaPiso: null, idade: null }, CAIXA)).toBeNull()
    expect(calcularRepasse({ preco: 500_000, planos: [{ name: 'x' }], rendaPiso: null, idade: null }, CAIXA)).toBeNull()
    expect(pctFinanciado([{ name: 'a' }, { name: 'b', financingPct: 70 }])).toBe(70)
  })
})
