import { describe, it, expect } from 'vitest'
import { tomDoContato, fraseContato } from '../modules/leads/contato'
import type { Lead } from '../types'

const H = 3_600_000
const agora = new Date('2026-11-24T15:00:00Z').getTime()
const ha = (horas: number) => new Date(agora - horas * H).toISOString()

describe('destaque de contato no cartão', () => {
  it('nunca contatado, +24h e +7 dias; em dia fica sem cor', () => {
    expect(tomDoContato({ funnelStage: 'lead', lastContactAt: null }, agora)).toBe('nunca')
    expect(tomDoContato({ funnelStage: 'followup', lastContactAt: ha(23) }, agora)).toBeNull()
    expect(tomDoContato({ funnelStage: 'followup', lastContactAt: ha(25) }, agora)).toBe('atrasado')
    expect(tomDoContato({ funnelStage: 'atendimento', lastContactAt: ha(24 * 6) }, agora)).toBe('atrasado')
    expect(tomDoContato({ funnelStage: 'atendimento', lastContactAt: ha(24 * 8) }, agora)).toBe('parado')
  })
  it('venda, descartado e fechado não ganham cor', () => {
    expect(tomDoContato({ funnelStage: 'venda', lastContactAt: null }, agora)).toBeNull()
    expect(tomDoContato({ funnelStage: 'proposta', lastContactAt: null, discardReason: 'x' }, agora)).toBeNull()
    expect(tomDoContato({ funnelStage: 'proposta', lastContactAt: null, closedAt: ha(1) }, agora)).toBeNull()
  })
  it('entre 24 e 48 h a frase diz as horas', () => {
    const lead = { lastContactAt: ha(26), createdAt: ha(100) } as Lead
    expect(fraseContato(lead, agora)).toBe('Último contato há 26 h')
  })
})
