import { describe, it, expect } from 'vitest'
import { calcClimate, type ClimateInput } from '../modules/pulse/climate'
import { agruparFeed, isEventoRuido, tempoRelativo } from '../modules/pulse/pulseEvents'
import type { PulseEvent } from '../modules/pulse/types'

function entrada(over: Partial<ClimateInput> = {}): ClimateInput {
  return {
    atividade30min:     0,
    interacoesHoje:     0,
    leadsNovosHoje:     0,
    corretoresOnline:   0,
    visitasHoje:        0,
    vendasHoje:         0,
    semAtendimentoHoje: 0,
    ...over,
  }
}

describe('calcClimate', () => {
  it('mede 24h — um dia bom continua quente depois do expediente', () => {
    // O ritmo dos últimos 30 min zera à noite, mas o dia acumulado permanece:
    // o painel tem que responder "como foi o dia", não só "o que houve agora".
    const durante = calcClimate(entrada({ interacoesHoje: 18, visitasHoje: 3, vendasHoje: 1, atividade30min: 6 }))
    const noite   = calcClimate(entrada({ interacoesHoje: 18, visitasHoje: 3, vendasHoje: 1, atividade30min: 0 }))
    expect(durante.level).toBe('aquecido')
    expect(noite.level).toBe('aquecido')
    expect(noite.score).toBeGreaterThan(50)
  })

  it('dia realmente parado é frio', () => {
    expect(calcClimate(entrada()).level).toBe('frio')
  })

  it('o volume do dia pesa mais que o ritmo do momento', () => {
    const soRitmo  = calcClimate(entrada({ atividade30min: 20 }))
    const soVolume = calcClimate(entrada({ interacoesHoje: 20 }))
    expect(soVolume.score).toBeGreaterThan(soRitmo.score)
  })

  it('dia intenso chega em pegando fogo', () => {
    const r = calcClimate(entrada({
      atividade30min: 10, interacoesHoje: 25, leadsNovosHoje: 12,
      corretoresOnline: 5, visitasHoje: 4, vendasHoje: 2,
    }))
    expect(r.level).toBe('pegando_fogo')
    expect(r.score).toBeGreaterThanOrEqual(75)
  })

  it('cada componente tem teto — mil eventos não saturam a leitura sozinhos', () => {
    const so_ritmo = calcClimate(entrada({ atividade30min: 1000 }))
    expect(so_ritmo.score).toBe(18)
    expect(so_ritmo.level).toBe('frio')
  })

  it('fila parada penaliza o clima', () => {
    const sem = calcClimate(entrada({ interacoesHoje: 12, corretoresOnline: 4 }))
    const com = calcClimate(entrada({ interacoesHoje: 12, corretoresOnline: 4, semAtendimentoHoje: 15 }))
    expect(com.score).toBe(sem.score - 10)
  })

  it('score nunca sai de 0–100', () => {
    const r = calcClimate(entrada({ semAtendimentoHoje: 99 }))
    expect(r.score).toBeGreaterThanOrEqual(0)
    expect(r.score).toBeLessThanOrEqual(100)
  })
})

describe('agruparFeed', () => {
  function disparo(id: string, minuto: number, broker = 'b1'): PulseEvent {
    return {
      id, kind: 'campanha', subTipo: 'dispatch', brokerId: broker,
      at: `2026-07-29T14:${String(minuto).padStart(2, '0')}:00.000Z`,
    }
  }

  it('agrupa disparos seguidos do mesmo corretor', () => {
    const out = agruparFeed([disparo('1', 5), disparo('2', 4), disparo('3', 3)])
    expect(out).toHaveLength(1)
    expect(out[0].agrupados).toBe(3)
  })

  it('não agrupa disparos de corretores diferentes', () => {
    const out = agruparFeed([disparo('1', 5, 'b1'), disparo('2', 4, 'b2')])
    expect(out).toHaveLength(2)
  })

  it('não agrupa fora da janela de 10 minutos', () => {
    const out = agruparFeed([disparo('1', 30), disparo('2', 5)])
    expect(out).toHaveLength(2)
  })

  it('preserva eventos que não são disparo', () => {
    const lead: PulseEvent = { id: 'x', kind: 'lead_novo', at: '2026-07-29T14:05:00.000Z' }
    const out = agruparFeed([disparo('1', 6), lead, disparo('2', 4)])
    expect(out).toHaveLength(3)
  })
})

describe('isEventoRuido', () => {
  it('descarta a nota de venda concluída — a venda já vem de sales', () => {
    expect(isEventoRuido({
      id: '1', kind: 'interacao', subTipo: 'nota', at: '2026-07-29T14:00:00.000Z',
      detalhe: 'Venda concluída — R$ 850.000',
    })).toBe(true)
  })

  it('mantém notas comuns', () => {
    expect(isEventoRuido({
      id: '1', kind: 'interacao', subTipo: 'nota', at: '2026-07-29T14:00:00.000Z',
      detalhe: 'Cliente pediu para retornar amanhã',
    })).toBe(false)
  })
})

describe('tempoRelativo', () => {
  const base = new Date('2026-07-29T14:00:00.000Z').getTime()

  it('formata os três intervalos', () => {
    expect(tempoRelativo('2026-07-29T13:59:40.000Z', base)).toBe('agora')
    expect(tempoRelativo('2026-07-29T13:57:00.000Z', base)).toBe('há 3 min')
    expect(tempoRelativo('2026-07-29T12:00:00.000Z', base)).toBe('há 2 h')
  })
})
