import { describe, it, expect } from 'vitest'
import { estaAtrasado, tomDoContato, fraseContato } from '../modules/leads/contato'
import type { Lead } from '../types'

const H = 3_600_000
// Hora local: a régua usa o dia do relógio de quem olha
const agora = new Date(2026, 10, 26, 15, 0).getTime()
const ha = (horas: number, base = agora) => new Date(base - horas * H).toISOString()
const fu = (lastContactAt: string | null, createdAt = ha(200)) => ({ funnelStage: 'followup', lastContactAt, createdAt })

describe('cores do contato no cartão', () => {
  it('azul falou hoje, amarelo falta passar hoje, laranja 24 h, vermelho 48 h', () => {
    expect(tomDoContato(fu(ha(2)), agora)).toBe('hoje')        // 13h de hoje
    expect(tomDoContato(fu(ha(16)), agora)).toBe('pendente')   // 23h de ontem
    expect(tomDoContato(fu(ha(25)), agora)).toBe('h24')
    expect(tomDoContato(fu(ha(49)), agora)).toBe('h48')
  })

  it('à meia-noite o azul de ontem vira amarelo', () => {
    const contato = new Date(2026, 10, 26, 23, 0).toISOString()
    expect(tomDoContato(fu(contato), new Date(2026, 10, 26, 23, 30).getTime())).toBe('hoje')
    expect(tomDoContato(fu(contato), new Date(2026, 10, 27, 0, 1).getTime())).toBe('pendente')
  })

  it('sem contato nenhum conta desde a entrada e nunca fica azul', () => {
    expect(tomDoContato(fu(null, ha(2)), agora)).toBe('pendente')
    expect(tomDoContato(fu(null, ha(30)), agora)).toBe('h24')
  })

  it('só Followup e Atendimento ganham cor', () => {
    expect(tomDoContato({ funnelStage: 'atendimento', lastContactAt: ha(24 * 30), createdAt: ha(24 * 40) }, agora)).toBe('h48')
    expect(tomDoContato({ funnelStage: 'lead', lastContactAt: null, createdAt: ha(30) }, agora)).toBeNull()
    expect(tomDoContato({ funnelStage: 'visita', lastContactAt: ha(100), createdAt: ha(200) }, agora)).toBeNull()
    expect(tomDoContato({ funnelStage: 'proposta', lastContactAt: ha(100), createdAt: ha(200) }, agora)).toBeNull()
    expect(tomDoContato({ funnelStage: 'venda', lastContactAt: null, createdAt: ha(100) }, agora)).toBeNull()
    expect(tomDoContato({ funnelStage: 'followup', lastContactAt: null, createdAt: ha(100), discardReason: 'x' }, agora)).toBeNull()
    expect(tomDoContato({ funnelStage: 'atendimento', lastContactAt: null, createdAt: ha(100), closedAt: ha(1) }, agora)).toBeNull()
  })

  it('followup atrasado = laranja ou vermelho', () => {
    expect(estaAtrasado('h24')).toBe(true)
    expect(estaAtrasado('h48')).toBe(true)
    expect(estaAtrasado('pendente')).toBe(false)
    expect(estaAtrasado('hoje')).toBe(false)
    expect(estaAtrasado(null)).toBe(false)
  })

  it('entre 24 e 48 h a frase diz as horas', () => {
    const lead = { lastContactAt: ha(26), createdAt: ha(100) } as Lead
    expect(fraseContato(lead, agora)).toBe('Último contato há 26 h')
  })
})
