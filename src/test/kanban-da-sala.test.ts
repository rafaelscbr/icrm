import { describe, it, expect } from 'vitest'
import { cartaoDaLinha, colunasDaSala, entrar, mover, tirar, trocarDono } from '../modules/pulse/kanbanDaSala'
import type { CartaoSala } from '../modules/pulse/kanbanDaSala'

const linha = (p: Record<string, unknown>) => ({
  id: 'a', name: 'Ana', funnel_stage: 'atendimento', broker_id: 'dio', average_ticket: 600_000,
  property_name: 'Porto Velas', development_id: 'dev-pv', stage_changed_at: '2026-11-20T12:00:00Z',
  created_at: '2026-11-01T12:00:00Z', ...p,
})

describe('Kanban da sala', () => {
  it('lê a linha do banco e ignora etapa desconhecida', () => {
    const c = cartaoDaLinha(linha({}))!
    expect(c).toMatchObject({ id: 'a', etapa: 'atendimento', brokerId: 'dio', vgv: 600_000, devId: 'dev-pv', desde: '2026-11-20T12:00:00Z' })
    expect(cartaoDaLinha(linha({ funnel_stage: 'xpto' }))).toBeNull()
    expect(cartaoDaLinha(linha({ stage_changed_at: null }))!.desde).toBe('2026-11-01T12:00:00Z')
  })

  it('os eventos do canal mexem nos cartões sem duplicar', () => {
    const base = [cartaoDaLinha(linha({}))!]
    const novo = cartaoDaLinha(linha({ id: 'b', name: 'Bia', funnel_stage: 'lead' }))!
    let k: CartaoSala[] = entrar(base, novo, 1000)
    expect(k).toHaveLength(2)
    expect(entrar(k, novo)).toBe(k)                                 // já está: nada muda

    k = mover(k, 'a', 'visita', '2026-11-23T15:00:00Z', 2000)
    expect(k.find(c => c.id === 'a')).toMatchObject({ etapa: 'visita', desde: '2026-11-23T15:00:00Z', vivoAt: 2000 })
    expect(mover(k, 'zzz', 'visita', '')).toBe(k)                   // lead fora do quadro
    expect(mover(k, 'a', undefined, '')).toBe(k)

    k = trocarDono(k, 'b', 'ryan', 3000)
    expect(k.find(c => c.id === 'b')!.brokerId).toBe('ryan')

    k = tirar(k, 'b')
    expect(k.map(c => c.id)).toEqual(['a'])
  })

  it('na TV, o followup atrasado vem primeiro (contato mais antigo em cima); o que mexeu agora fica no topo', () => {
    const agora = new Date('2026-11-24T15:00:00Z').getTime()
    const h = (n: number) => new Date(agora - n * 3_600_000).toISOString()
    const k = [
      cartaoDaLinha(linha({ id: 'emdia', last_contact_at: h(2), stage_changed_at: h(1) }))!,
      cartaoDaLinha(linha({ id: '24h', last_contact_at: h(30) }))!,
      cartaoDaLinha(linha({ id: '24h-velho', last_contact_at: h(60) }))!,
      cartaoDaLinha(linha({ id: 'parado', last_contact_at: h(24 * 10) }))!,
      cartaoDaLinha(linha({ id: 'nunca', last_contact_at: null, created_at: h(48) }))!,
      { ...cartaoDaLinha(linha({ id: 'vivo', last_contact_at: h(0) }))!, vivoAt: agora - 30_000 },
    ]
    const at = colunasDaSala(k, () => null, () => 5, agora)[2]
    expect(at.cartoes.map(c => c.id)).toEqual(['vivo', 'parado', '24h-velho', 'nunca', '24h', 'emdia'])
  })

  it('colunas: mais recente em cima e o dinheiro pela conta da casa', () => {
    const k = [
      cartaoDaLinha(linha({ id: '1', stage_changed_at: '2026-11-10T00:00:00Z' }))!,
      cartaoDaLinha(linha({ id: '2', stage_changed_at: '2026-11-22T00:00:00Z', broker_id: 'rafa' }))!,
    ]
    // uma hora depois da chegada: ninguém atrasado, vale o mais recente em cima
    const cols = colunasDaSala(k, id => (id === 'dio' ? 50 : null), () => 5, new Date('2026-11-01T13:00:00Z').getTime())
    expect(cols.map(c => c.etapa)).toEqual(['lead', 'followup', 'atendimento', 'visita', 'proposta', 'venda'])
    const at = cols[2]
    expect(at.cartoes.map(c => c.id)).toEqual(['2', '1'])
    expect(at.dinheiro.vgv).toBe(1_200_000)
    expect(at.dinheiro.bruta).toBe(60_000)
    // líquida de 600 mil = 30.000 × 0,97 × 0,94 = 27.354; Dionata 50%
    expect(at.dinheiro.corretor).toBeCloseTo(13_677, 6)
    expect(at.dinheiro.souza).toBeCloseTo(27_354 * 2 - 13_677, 6)
  })
})
