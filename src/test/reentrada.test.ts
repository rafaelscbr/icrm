import { describe, it, expect } from 'vitest'
import { avisoReentrada, reentradaPrimeiro } from '../modules/leads/reentrada'
import { Lead } from '../types'

/**
 * A regra de quando o funil destaca um lead que voltou.
 *
 * Vale teste porque o erro aqui é silencioso nos dois sentidos: destaque que
 * não acende faz o corretor perder o lead que se ofereceu sozinho, e destaque
 * que não apaga transforma o aviso em enfeite permanente — que é como um
 * sistema ensina a ignorar os próprios alertas.
 */

function lead(extra: Partial<Lead> = {}): Lead {
  return {
    id: 'l1',
    name: 'Fulano',
    phone: '+5547999999999',
    origin: 'meta_ads',
    funnelStage: 'followup',
    followupStep: 1,
    createdAt: '2026-06-01T12:00:00Z',
    updatedAt: '2026-08-04T12:00:00Z',
    ...extra,
  }
}

describe('avisoReentrada', () => {
  it('lead que nunca voltou não destaca', () => {
    expect(avisoReentrada(lead())).toBeNull()
  })

  it('reentrada nova destaca', () => {
    const a = avisoReentrada(lead({ reentryAt: '2026-08-04T14:20:00Z', reentryCount: 1 }))
    expect(a?.tipo).toBe('voltou')
    expect(a?.texto).toBe('Voltou · preencheu de novo')
  })

  it('reentrada já vista pelo dono não destaca mais', () => {
    expect(avisoReentrada(lead({
      reentryAt:     '2026-08-04T14:20:00Z',
      reentrySeenAt: '2026-08-04T15:00:00Z',
    }))).toBeNull()
  })

  it('voltar DE NOVO reacende, mesmo tendo sido visto antes', () => {
    // O banco zera reentry_seen_at a cada reentrada; aqui a garantia é da regra
    // de leitura: visto ANTES da última volta não conta como visto.
    const a = avisoReentrada(lead({
      reentryAt:     '2026-08-04T14:20:00Z',
      reentrySeenAt: '2026-07-10T09:00:00Z',
      reentryCount:  3,
    }))
    expect(a).not.toBeNull()
    expect(a?.texto).toBe('Voltou · 3º cadastro')
  })

  it('cliente que já comprou tem aviso próprio', () => {
    const a = avisoReentrada(lead({
      reentryAt: '2026-08-04T14:20:00Z',
      reentryCount: 1,
      returningFromLeadId: 'lead-ganho-antigo',
    }))
    expect(a?.tipo).toBe('cliente')
    expect(a?.texto).toBe('Já comprou · voltou a se cadastrar')
  })
})

describe('reentradaPrimeiro', () => {
  it('quem voltou vai para o topo da coluna', () => {
    const comum  = lead({ id: 'a' })
    const voltou = lead({ id: 'b', reentryAt: '2026-08-04T14:20:00Z' })
    expect([comum, voltou].sort(reentradaPrimeiro).map(l => l.id)).toEqual(['b', 'a'])
  })

  it('entre dois iguais não inventa ordem — o critério da tela decide', () => {
    const a = lead({ id: 'a' })
    const b = lead({ id: 'b' })
    expect(reentradaPrimeiro(a, b)).toBe(0)
  })
})
