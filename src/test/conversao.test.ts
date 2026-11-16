import { describe, it, expect } from 'vitest'
import {
  montarRecorte, somarDias, diasEntre, taxa, fmtTaxa, passos, gerarLeituras, variacao,
  rotuloBalde, etapa, slugLegivel, preencherSerie, inicioDoBalde,
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
const nomes = { origem: (s: string) => s, motivo: (s: string) => s }

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

describe('conversão · leituras', () => {
  const recorte = montarRecorte('2026-11-01', '2026-11-15', false, '2026-11-15')

  it('aponta a maior perda com os números que a sustentam', () => {
    const l = gerarLeituras(rel({ received: 100, etapas: { atendimento: 20, visita: 2, proposta: 1, venda: 1 } }), null, recorte, nomes)
    expect(l[0].texto).toContain('Atendimento e Visita')
    expect(l[0].texto).toContain('de 20, 2 avançaram (10%)')
  })

  it('não tira conclusão de base menor que 5', () => {
    const l = gerarLeituras(rel({ received: 3, etapas: { atendimento: 1 } }), null, recorte, nomes)
    expect(l.find(x => x.texto.includes('maior perda'))).toBeUndefined()
  })

  it('compara com o período anterior e dá o tom', () => {
    const atual = rel({ received: 50, etapas: { visita: 4 } })
    const antes = rel({ received: 60, etapas: { visita: 2 } })
    const l = gerarLeituras(atual, antes, recorte, nomes)
    expect(l.find(x => x.texto.startsWith('Visitas'))).toMatchObject({ tom: 'sucesso' })
    expect(l.find(x => x.texto.startsWith('Leads recebidos'))).toMatchObject({ tom: 'atencao' })
    expect(l.find(x => x.texto.startsWith('Visitas'))!.texto).toContain('nos 15 dias anteriores')
  })

  it('avisa quando há mais gente na etapa seguinte (só no modo atividade)', () => {
    const r = rel({ received: 2, etapas: { atendimento: 6, visita: 3 } })
    expect(gerarLeituras(r, null, recorte, nomes).some(x => x.texto.includes('Por safra'))).toBe(true)
    expect(gerarLeituras({ ...r, mode: 'safra' }, null, recorte, nomes).some(x => x.texto.includes('Por safra'))).toBe(false)
  })

  it('melhor origem só aparece na safra, com base mínima', () => {
    const origens = [
      { origin: 'meta_ads', received: 100, discarded: 80, stages: { visita: 2 } },
      { origin: 'indicacao', received: 12, discarded: 2, stages: { visita: 3 } },
      { origin: 'site', received: 4, discarded: 0, stages: { visita: 4 } },   // base pequena: fora
    ]
    const safra = gerarLeituras(rel({ mode: 'safra', received: 116, byOrigin: origens }), null, recorte, nomes)
    expect(safra.find(x => x.texto.includes('origem que mais leva a visita'))!.texto).toContain('indicacao')
    const ativ = gerarLeituras(rel({ received: 116, byOrigin: origens }), null, recorte, nomes)
    expect(ativ.some(x => x.texto.includes('origem que mais leva'))).toBe(false)
  })

  it('descartes trazem o motivo mais comum', () => {
    const l = gerarLeituras(rel({ mode: 'safra', received: 100, discarded: 88, discardReasons: [{ reason: 'sem_condicao', count: 60 }] }), null, recorte, nomes)
    const d = l.find(x => x.texto.includes('descartados'))!
    expect(d.texto).toContain('(88%)')
    expect(d.texto).toContain('sem_condicao (60)')
  })

  it('avisa do limite do histórico quando o período começa antes dele', () => {
    const antigo = montarRecorte('2026-04-01', '2026-04-30', false, '2026-11-15')
    expect(gerarLeituras(rel({ received: 1 }), null, antigo, nomes).some(x => x.texto.includes('11/05/2026'))).toBe(true)
    expect(gerarLeituras(rel({ received: 1 }), null, recorte, nomes).some(x => x.texto.includes('11/05/2026'))).toBe(false)
  })
})

describe('conversão · apoio', () => {
  it('variação contra o período anterior', () => {
    expect(variacao(5, 3)).toBe('+2 vs. anterior')
    expect(variacao(3, 5)).toBe('−2 vs. anterior')
    expect(variacao(3, 3)).toBe('igual ao anterior')
    expect(variacao(3, null)).toBeNull()
  })
  it('rótulo do eixo e slug', () => {
    expect(rotuloBalde('2026-11-08', 'week')).toBe('08/11')
    expect(rotuloBalde('2026-11-01', 'month')).toBe('nov/26')
    expect(slugLegivel('sem_condicao')).toBe('Sem condicao')
  })
})

describe('conversão · série contínua', () => {
  const p = (bucket: string, received = 1) => ({ bucket, received, atendimento: 0, visita: 0, proposta: 0, venda: 0 })

  it('dia sem movimento entra com zero', () => {
    const s = preencherSerie([p('2026-11-06', 4), p('2026-11-09', 2)], '2026-11-05', '2026-11-10', 'day')
    expect(s.map(x => x.bucket)).toEqual(['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10'])
    expect(s.map(x => x.received)).toEqual([0, 4, 0, 0, 2, 0])
  })
  it('semana começa no domingo', () => {
    expect(inicioDoBalde('2026-11-11', 'week')).toBe('2026-11-08')   // quarta → domingo
    expect(inicioDoBalde('2026-11-08', 'week')).toBe('2026-11-08')
    const s = preencherSerie([p('2026-11-08')], '2026-10-28', '2026-11-15', 'week')
    expect(s.map(x => x.bucket)).toEqual(['2026-10-25', '2026-11-01', '2026-11-08', '2026-11-15'])
  })
  it('mês a mês, atravessando o ano', () => {
    const s = preencherSerie([p('2026-11-01')], '2026-11-20', '2027-01-05', 'month')
    expect(s.map(x => x.bucket)).toEqual(['2026-11-01', '2026-12-01', '2027-01-01'])
  })
  it('acumulado vai do primeiro ao último balde que existe', () => {
    const s = preencherSerie([p('2026-05-01'), p('2026-08-01')], null, null, 'month')
    expect(s.map(x => x.bucket)).toEqual(['2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01'])
    expect(preencherSerie([], null, null, 'month')).toEqual([])
  })
})
