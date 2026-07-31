import { describe, it, expect } from 'vitest'
import { calcClimate, isHorarioComercial, type ClimateInput } from '../modules/pulse/climate'
import { agruparFeed, isEventoRuido, tempoRelativo } from '../modules/pulse/pulseEvents'
import type { PulseEvent } from '../modules/pulse/types'

// Quarta-feira, 14h — dentro do expediente
const DIA_UTIL_14H = new Date('2026-07-29T14:00:00')

function entrada(over: Partial<ClimateInput> = {}): ClimateInput {
  return {
    atividade30min:    0,
    leadsNovosHoje:     0,
    corretoresOnline:   0,
    visitasHoje:        0,
    vendasHoje:         0,
    semAtendimentoHoje: 0,
    agora:              DIA_UTIL_14H,
    ...over,
  }
}

describe('isHorarioComercial', () => {
  it('domingo nunca é expediente', () => {
    expect(isHorarioComercial(new Date('2026-07-26T10:00:00'))).toBe(false)
  })

  it('sábado só até as 13h', () => {
    expect(isHorarioComercial(new Date('2026-08-01T10:00:00'))).toBe(true)
    expect(isHorarioComercial(new Date('2026-08-01T14:00:00'))).toBe(false)
  })

  it('dia útil das 9h às 18h', () => {
    expect(isHorarioComercial(new Date('2026-07-29T08:00:00'))).toBe(false)
    expect(isHorarioComercial(new Date('2026-07-29T09:00:00'))).toBe(true)
    expect(isHorarioComercial(new Date('2026-07-29T17:59:00'))).toBe(true)
    expect(isHorarioComercial(new Date('2026-07-29T18:00:00'))).toBe(false)
  })
})

describe('calcClimate', () => {
  it('fora do expediente não classifica como frio — não é diagnóstico, é ruído', () => {
    const r = calcClimate(entrada({ agora: new Date('2026-07-29T21:00:00'), vendasHoje: 3 }))
    expect(r.level).toBe('expediente_fechado')
    expect(r.score).toBe(0)
  })

  it('dia parado em horário comercial é frio', () => {
    expect(calcClimate(entrada()).level).toBe('frio')
  })

  it('dia intenso chega em pegando fogo', () => {
    const r = calcClimate(entrada({
      atividade30min: 10, leadsNovosHoje: 12, corretoresOnline: 5,
      visitasHoje: 4, vendasHoje: 2,
    }))
    expect(r.level).toBe('pegando_fogo')
    expect(r.score).toBeGreaterThanOrEqual(75)
  })

  it('cada componente tem teto — 100 interações não zeram o resto da leitura', () => {
    const so_interacoes = calcClimate(entrada({ atividade30min: 1000 }))
    expect(so_interacoes.score).toBe(30)
    expect(so_interacoes.level).toBe('normal')
  })

  it('fila parada penaliza o clima', () => {
    const sem = calcClimate(entrada({ atividade30min: 8, corretoresOnline: 4 }))
    const com = calcClimate(entrada({ atividade30min: 8, corretoresOnline: 4, semAtendimentoHoje: 15 }))
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
