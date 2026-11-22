import { describe, it, expect } from 'vitest'
import {
  montarRecorte, somarDias, diasEntre, taxa, fmtTaxa, passos,
  rotuloBalde, etapa, slugLegivel, inicioDoBalde,
} from '../modules/leads/conversao'
import type { RelatorioConversao } from '../modules/leads/conversao'

function rel(p: Partial<RelatorioConversao> & { etapas?: Record<string, number> }): RelatorioConversao {
  const e = p.etapas ?? {}
  return {
    mode: 'atividade', start: '2026-11-01', end: '2026-11-15', bucket: 'day',
    received: 0, discarded: 0,
    funnel: ['followup', 'atendimento', 'visita', 'proposta', 'venda'].map(stage => ({ stage, count: e[stage] ?? 0 })),
    series: [], byOrigin: [], byBroker: [], discardReasons: [],
    medianDaysToVisit: null, historySince: '2026-05-11',
    ...p,
  }
}

describe('conversão · recorte de período', () => {
  it('corta o fim em hoje e compara com o mesmo número de dias logo antes', () => {
    const r = montarRecorte('2026-11-01', '2026-11-30', false, '2026-11-15')
    expect(r).toMatchObject({ inicio: '2026-11-01', fim: '2026-11-15', dias: 15, balde: 'day' })
    expect(r.anterior).toEqual({ inicio: '2026-10-17', fim: '2026-10-31' })
  })

  it('período fechado no passado fica inteiro', () => {
    const r = montarRecorte('2026-10-01', '2026-10-31', false, '2026-11-15')
    expect(r).toMatchObject({ fim: '2026-10-31', dias: 31, balde: 'day' })
    expect(r.anterior).toEqual({ inicio: '2026-08-31', fim: '2026-09-30' })
  })

  it('escolhe o balde pelo tamanho: dia, semana, mês', () => {
    expect(montarRecorte('2026-09-01', '2026-11-15', false, '2026-11-15').balde).toBe('week')
    expect(montarRecorte('2026-01-01', '2026-11-15', false, '2026-11-15').balde).toBe('month')
  })

  it('acumulado não tem datas nem comparação', () => {
    expect(montarRecorte('0000-01-01', '9999-12-31', true, '2026-11-15'))
      .toEqual({ inicio: null, fim: null, anterior: null, dias: null, balde: 'month' })
  })

  it('período todo no futuro não inventa comparação', () => {
    expect(montarRecorte('2026-12-01', '2026-12-31', false, '2026-11-15').anterior).toBeNull()
  })

  it('soma de dias atravessa mês e ano', () => {
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28')
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01')
    expect(diasEntre('2026-11-01', '2026-11-01')).toBe(1)
  })
})

describe('conversão · taxas', () => {
  it('sem base não vira 0%: vira travessão', () => {
    expect(taxa(0, 0)).toBeNull()
    expect(fmtTaxa(null)).toBe('—')
  })
  it('uma casa abaixo de 10, inteiro acima', () => {
    expect(fmtTaxa(taxa(7, 331))).toBe('2,1%')
    expect(fmtTaxa(taxa(26, 331))).toBe('7,9%')
    expect(fmtTaxa(taxa(291, 331))).toBe('88%')
    expect(fmtTaxa(0)).toBe('0%')
  })
  it('passos do funil saem de recebidos até venda, sem followup', () => {
    const ps = passos(rel({ received: 100, etapas: { followup: 60, atendimento: 20, visita: 5, proposta: 2, venda: 1 } }))
    expect(ps.map(p => `${p.de}>${p.para}`)).toEqual([
      'Recebidos>Atendimento', 'Atendimento>Visita', 'Visita>Proposta', 'Proposta>Venda',
    ])
    expect(ps[0]).toMatchObject({ base: 100, avancaram: 20, taxa: 20 })
    expect(ps[1].taxa).toBe(25)
  })
  it('etapa ausente conta zero', () => {
    expect(etapa(rel({}), 'visita')).toBe(0)
    expect(etapa(null, 'visita')).toBe(0)
  })
})

describe('conversão · apoio', () => {
  it('rótulo do eixo e slug', () => {
    expect(rotuloBalde('2026-11-08', 'week')).toBe('08/11')
    expect(rotuloBalde('2026-11-01', 'month')).toBe('nov/26')
    expect(slugLegivel('sem_condicao')).toBe('Sem condicao')
  })
})

describe('conversão · baldes', () => {
  it('semana começa no domingo', () => {
    expect(inicioDoBalde('2026-11-11', 'week')).toBe('2026-11-08')   // quarta → domingo
    expect(inicioDoBalde('2026-11-08', 'week')).toBe('2026-11-08')
    expect(inicioDoBalde('2026-11-20', 'month')).toBe('2026-11-01')
  })
})
