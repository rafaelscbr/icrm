import { describe, it, expect } from 'vitest'
import {
  FAIXAS, faixaDe, ativosParaFollowup, resumoFollowup, matrizFollowup, followupPorCorretor,
  filtrarFollowup, leiturasFollowup, textoDias,
} from '../modules/leads/followup'
import { nivelContato } from '../modules/leads/contato'
import type { Lead } from '../types'

const AGORA = new Date(2026, 10, 15, 15, 0, 0).getTime()
const DIA = 86_400_000
const ha = (dias: number) => new Date(AGORA - dias * DIA - 3_600_000).toISOString()   // "dias" e 1 h atrás

let seq = 0
function lead(p: Partial<Lead> & { semContatoHa?: number; nunca?: boolean }): Lead {
  const { semContatoHa = 0, nunca = false, ...resto } = p
  return {
    id: `l${++seq}`, name: `Lead ${seq}`, phone: '', origin: 'meta_ads', funnelStage: 'followup', followupStep: 1,
    createdAt: nunca ? ha(semContatoHa) : ha(60), updatedAt: ha(0),
    lastContactAt: nunca ? undefined : ha(semContatoHa),
    brokerId: 'a', averageTicket: 600_000,
    ...resto,
  } as Lead
}

describe('followup · faixas', () => {
  it('cada dia cai em uma faixa só, sem buraco', () => {
    expect([0, 1, 2, 3, 4, 6, 7, 14, 15, 30, 31, 400].map(faixaDe))
      .toEqual(['hoje', '1', '2-3', '2-3', '4-6', '4-6', '7-14', '7-14', '15-30', '15-30', '30+', '30+'])
  })
  it('o nível da faixa bate com o nível do funil', () => {
    for (const d of [0, 1, 2, 3, 6, 7, 14, 31]) {
      const f = FAIXAS.find(x => x.id === faixaDe(d))!
      expect(nivelContato(lead({ semContatoHa: d }), AGORA), `dia ${d}`).toBe(f.nivel)
    }
  })
})

describe('followup · carteira', () => {
  it('descartado, encerrado e venda não esperam followup', () => {
    const ls = ativosParaFollowup([
      lead({}), lead({ discardReason: 'sem_condicao' }), lead({ closedAt: ha(1) }), lead({ funnelStage: 'venda' }),
    ])
    expect(ls).toHaveLength(1)
  })

  it('resumo: níveis, nunca contatados, valor parado só de etapa quente', () => {
    const r = resumoFollowup([
      lead({ semContatoHa: 0 }),
      lead({ semContatoHa: 1 }),
      lead({ semContatoHa: 4 }),
      lead({ semContatoHa: 10 }),                                            // parado em followup: sem valor
      lead({ semContatoHa: 20, funnelStage: 'proposta', averageTicket: 800_000 }),
      lead({ semContatoHa: 9, nunca: true, funnelStage: 'atendimento', averageTicket: 500_000 }),
    ], AGORA)
    // 24/11/2026: em dia é só quem teve contato nas últimas 24h — 1 dia já atrasou.
    expect(r).toMatchObject({ total: 6, emDia: 1, esfriando: 2, parado: 3, nunca: 1, valorParado: 1_300_000, maiorSilencio: 20 })
    expect(Math.round(r.pctEmDia!)).toBe(17)
    expect(r.medianaDias).toBe(6.5)
  })

  it('carteira vazia não vira 0%', () => {
    expect(resumoFollowup([], AGORA)).toMatchObject({ total: 0, pctEmDia: null, medianaDias: null })
  })

  it('mapa etapa × faixa', () => {
    const m = matrizFollowup([
      lead({ semContatoHa: 0, funnelStage: 'lead' }),
      lead({ semContatoHa: 8, funnelStage: 'atendimento' }),
      lead({ semContatoHa: 9, funnelStage: 'atendimento' }),
      lead({ semContatoHa: 40, funnelStage: 'visita' }),
    ], AGORA)
    expect(m.lead.hoje).toBe(1)
    expect(m.atendimento['7-14']).toBe(2)
    expect(m.visita['30+']).toBe(1)
    expect(m.proposta['7-14']).toBe(0)
  })

  it('por corretor: quem tem mais parado vem primeiro', () => {
    const c = followupPorCorretor([
      lead({ brokerId: 'a', semContatoHa: 0 }),
      lead({ brokerId: 'b', semContatoHa: 10 }),
      lead({ brokerId: 'b', semContatoHa: 30 }),
      lead({ brokerId: null, semContatoHa: 3 }),
    ], AGORA)
    expect(c.map(x => x.brokerId)).toEqual(['b', null, 'a'])
    expect(c[0]).toMatchObject({ total: 2, parado: 2, pctEmDia: 0 })
    expect(c[2]).toMatchObject({ total: 1, emDia: 1, pctEmDia: 100 })
  })

  it('filtro: etapa, faixa, nível e nunca; silêncio mais longo primeiro', () => {
    const ls = [
      lead({ name: 'curto', semContatoHa: 8, funnelStage: 'atendimento' }),
      lead({ name: 'longo', semContatoHa: 12, funnelStage: 'atendimento' }),
      lead({ name: 'outra-etapa', semContatoHa: 9, funnelStage: 'visita' }),
      lead({ name: 'nunca', semContatoHa: 2, nunca: true }),
    ]
    expect(filtrarFollowup(ls, { etapa: 'atendimento', faixa: '7-14' }, AGORA).map(l => l.name)).toEqual(['longo', 'curto'])
    expect(filtrarFollowup(ls, { nivel: 'parado' }, AGORA).map(l => l.name)).toEqual(['longo', 'outra-etapa', 'curto'])
    expect(filtrarFollowup(ls, { nunca: true }, AGORA).map(l => l.name)).toEqual(['nunca'])
    expect(filtrarFollowup(ls, {}, AGORA)).toHaveLength(4)
  })
})

describe('followup · leituras', () => {
  const moeda = (v: number) => `R$ ${v}`
  const nomes = (id: string | null) => (id === 'a' ? 'Ana' : id === 'b' ? 'Bruno' : undefined)

  it('negociação parada vem primeiro, com o valor', () => {
    const ls = [
      lead({ semContatoHa: 20, funnelStage: 'proposta', averageTicket: 800_000 }),
      lead({ semContatoHa: 0 }),
    ]
    const l = leiturasFollowup(ls, resumoFollowup(ls, AGORA), followupPorCorretor(ls, AGORA), nomes, moeda, AGORA)
    expect(l[0].tom).toBe('risco')
    expect(l[0].texto).toContain('1 lead em atendimento, visita ou proposta está há 7 dias ou mais sem contato')
    expect(l[0].texto).toContain('R$ 800000')
  })

  it('aponta o corretor que concentra os parados só com base suficiente', () => {
    const ls = [
      ...Array.from({ length: 5 }, () => lead({ brokerId: 'b', semContatoHa: 15 })),
      lead({ brokerId: 'a', semContatoHa: 10 }),
      lead({ brokerId: 'a', semContatoHa: 0 }),
    ]
    const l = leiturasFollowup(ls, resumoFollowup(ls, AGORA), followupPorCorretor(ls, AGORA), nomes, moeda, AGORA)
    expect(l.some(x => x.texto === 'Bruno concentra 5 dos 6 leads parados (83%).')).toBe(true)

    const poucos = [lead({ brokerId: 'b', semContatoHa: 15 }), lead({ brokerId: 'a', semContatoHa: 0 })]
    const l2 = leiturasFollowup(poucos, resumoFollowup(poucos, AGORA), followupPorCorretor(poucos, AGORA), nomes, moeda, AGORA)
    expect(l2.some(x => x.texto.includes('concentra'))).toBe(false)
  })

  it('carteira vazia não gera leitura', () => {
    expect(leiturasFollowup([], resumoFollowup([], AGORA), [], nomes, moeda, AGORA)).toEqual([])
  })

  it('texto de dias', () => {
    expect(textoDias(0)).toBe('hoje')
    expect(textoDias(1)).toBe('1 dia')
    expect(textoDias(46)).toBe('46 dias')
  })
})
