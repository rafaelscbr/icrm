import { describe, it, expect } from 'vitest'
import { tomDoContato, fraseContato } from '../modules/leads/contato'
import type { Lead } from '../types'

const H = 3_600_000
const agora = new Date('2026-11-24T15:00:00Z').getTime()
const ha = (horas: number) => new Date(agora - horas * H).toISOString()

describe('followup atrasado no cartão', () => {
  it('mais de 24 h sem contato; sem contato nenhum conta desde a chegada', () => {
    expect(tomDoContato({ funnelStage: 'followup', lastContactAt: ha(23), createdAt: ha(100) }, agora)).toBeNull()
    expect(tomDoContato({ funnelStage: 'followup', lastContactAt: ha(25), createdAt: ha(100) }, agora)).toBe('atrasado')
    expect(tomDoContato({ funnelStage: 'atendimento', lastContactAt: ha(24 * 30), createdAt: ha(24 * 40) }, agora)).toBe('atrasado')
    expect(tomDoContato({ funnelStage: 'lead', lastContactAt: null, createdAt: ha(2) }, agora)).toBeNull()
    expect(tomDoContato({ funnelStage: 'lead', lastContactAt: null, createdAt: ha(30) }, agora)).toBe('atrasado')
  })
  it('venda, descartado e fechado não ganham cor', () => {
    expect(tomDoContato({ funnelStage: 'venda', lastContactAt: null, createdAt: ha(100) }, agora)).toBeNull()
    expect(tomDoContato({ funnelStage: 'proposta', lastContactAt: null, createdAt: ha(100), discardReason: 'x' }, agora)).toBeNull()
    expect(tomDoContato({ funnelStage: 'proposta', lastContactAt: null, createdAt: ha(100), closedAt: ha(1) }, agora)).toBeNull()
  })
  it('entre 24 e 48 h a frase diz as horas', () => {
    const lead = { lastContactAt: ha(26), createdAt: ha(100) } as Lead
    expect(fraseContato(lead, agora)).toBe('Último contato há 26 h')
  })
})
