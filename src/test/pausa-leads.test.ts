import { describe, it, expect } from 'vitest'
import {
  PRESETS_PAUSA, pausaEmVigor, pausaDe, horaDaVolta, tempoRestante, fraseDaVolta, msAteProximaVolta,
} from '../lib/pausaLeads'
import type { LeadPause } from '../types'

// 16/11/2026, 14:00 no horário local
const AGORA = new Date(2026, 10, 16, 14, 0, 0).getTime()
const em = (min: number) => new Date(AGORA + min * 60_000).toISOString()

const pausa = (brokerId: string, untilAt: string): LeadPause => ({
  id: `p-${brokerId}`, brokerId, preset: '1h', startedAt: em(-10), untilAt,
})

describe('pausa no recebimento de leads', () => {
  it('oferece os cinco intervalos pedidos, nesta ordem', () => {
    expect(PRESETS_PAUSA.map(p => p.rotulo)).toEqual(['30 min', '1 h', '2 h', '3 h', 'Dia todo'])
  })

  it('a pausa vale até a hora do fim, nem um instante depois', () => {
    expect(pausaEmVigor({ untilAt: em(1) }, AGORA)).toBe(true)
    expect(pausaEmVigor({ untilAt: em(0) }, AGORA)).toBe(false)
    expect(pausaEmVigor({ untilAt: em(-1) }, AGORA)).toBe(false)
  })

  it('acha a pausa do corretor e ignora a que já venceu', () => {
    const pausas = [pausa('a', em(30)), pausa('b', em(-5))]
    expect(pausaDe(pausas, 'a', AGORA)?.id).toBe('p-a')
    expect(pausaDe(pausas, 'b', AGORA)).toBeUndefined()   // venceu: voltou sozinho
    expect(pausaDe(pausas, 'c', AGORA)).toBeUndefined()
    expect(pausaDe(pausas, null, AGORA)).toBeUndefined()
  })

  it('diz a hora da volta no mesmo dia', () => {
    expect(horaDaVolta(em(30), AGORA)).toBe('às 14:30')
    expect(horaDaVolta(em(180), AGORA)).toBe('às 17:00')
  })

  it('"dia todo" termina à meia-noite e vira "amanhã"', () => {
    const meiaNoite = new Date(2026, 10, 17, 0, 0, 0).toISOString()
    expect(horaDaVolta(meiaNoite, AGORA)).toBe('amanhã')
    expect(fraseDaVolta(meiaNoite, AGORA)).toBe('volta amanhã')
  })

  it('pausa de 3 h feita às 22h cai no dia seguinte, com a hora', () => {
    const tarde = new Date(2026, 10, 16, 22, 0, 0).getTime()
    const fim = new Date(2026, 10, 17, 1, 0, 0).toISOString()
    expect(horaDaVolta(fim, tarde)).toBe('amanhã às 01:00')
  })

  it('conta o tempo que falta arredondando para cima', () => {
    expect(tempoRestante(em(30), AGORA)).toBe('30 min')
    expect(tempoRestante(em(60), AGORA)).toBe('1 h')
    expect(tempoRestante(em(80), AGORA)).toBe('1 h 20 min')
    expect(tempoRestante(new Date(AGORA + 20_000).toISOString(), AGORA)).toBe('1 min')
  })

  it('monta a frase que o menu mostra', () => {
    expect(fraseDaVolta(em(42), AGORA)).toBe('volta às 14:42 · faltam 42 min')
    expect(fraseDaVolta(new Date(AGORA + 30_000).toISOString(), AGORA)).toBe('volta às 14:00 · falta 1 min')
  })

  it('agenda a releitura para a primeira pausa que acabar', () => {
    expect(msAteProximaVolta([], AGORA)).toBeNull()
    expect(msAteProximaVolta([pausa('a', em(-1))], AGORA)).toBeNull()
    expect(msAteProximaVolta([pausa('a', em(90)), pausa('b', em(30))], AGORA)).toBe(30 * 60_000)
  })
})
