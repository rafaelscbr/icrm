/**
 * Sync incremental de leads (migração 075).
 *
 * A tabela desce uma vez; depois, só o delta. O que pode dar errado aqui é
 * silencioso: um lead que some da tela de quem ainda é dono, ou que fica na
 * tela de quem já o perdeu. Os casos abaixo são exatamente os do ping-pong do
 * SLA e da transferência manual.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Lead } from '../types'

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), dismiss: vi.fn() }),
}))
vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn(), getChannels: vi.fn(() => []) } }))

const usuario = { id: 'broker-a' }
vi.mock('../lib/auth', () => ({
  getCurrentUserId: vi.fn(() => usuario.id),
  requireBrokerId:  vi.fn(() => usuario.id),
}))

const db = {
  fetchAll:          vi.fn<() => Promise<Lead[]>>(),
  fetchSince:        vi.fn<(since: string) => Promise<Lead[]>>(),
  fetchDeletedSince: vi.fn<(since: string) => Promise<{ id: string; deletedAt: string }[]>>(),
}
vi.mock('../lib/db', () => ({ db: { leads: db } }))

function lead(id: string, updatedAt: string, extra: Partial<Lead> = {}): Lead {
  return {
    id, name: id, phone: '47999999999', origin: 'meta_ads', funnelStage: 'lead',
    followupStep: 0, createdAt: updatedAt, updatedAt, brokerId: 'broker-a', ...extra,
  } as Lead
}

async function novoStore() {
  vi.resetModules()
  return (await import('../store/useLeadsStore')).useLeadsStore
}

beforeEach(() => {
  usuario.id = 'broker-a'
  db.fetchAll.mockReset()
  db.fetchSince.mockReset().mockResolvedValue([])
  db.fetchDeletedSince.mockReset().mockResolvedValue([])
})

describe('sync incremental de leads', () => {
  it('baixa a tabela uma vez e depois só o delta', async () => {
    const store = await novoStore()
    db.fetchAll.mockResolvedValue([lead('l1', '2026-09-29T10:00:00.000Z')])

    await store.getState().load()
    await store.getState().load()
    await store.getState().reload()

    expect(db.fetchAll).toHaveBeenCalledTimes(1)
    expect(db.fetchSince).toHaveBeenCalledTimes(2)
    // A marca d'água recua a folga de 60s para cobrir relógio de navegador
    expect(db.fetchSince).toHaveBeenLastCalledWith('2026-09-29T09:59:00.000Z')
  })

  it('reload antes de qualquer load não baixa nada', async () => {
    const store = await novoStore()
    await store.getState().reload()
    expect(db.fetchAll).not.toHaveBeenCalled()
    expect(db.fetchSince).not.toHaveBeenCalled()
  })

  it('aplica alterações, novos no topo, e tira o que saiu do alcance', async () => {
    const store = await novoStore()
    db.fetchAll.mockResolvedValue([
      lead('l2', '2026-09-29T10:00:00.000Z'),
      lead('l1', '2026-09-29T09:00:00.000Z'),
    ])
    await store.getState().load()

    db.fetchSince.mockResolvedValue([
      lead('l1', '2026-09-29T11:00:00.000Z', { funnelStage: 'atendimento' }),
      lead('l3', '2026-09-29T11:05:00.000Z'),
    ])
    // l2 foi transferido para outro corretor às 11:10
    db.fetchDeletedSince.mockResolvedValue([{ id: 'l2', deletedAt: '2026-09-29T11:10:00.000Z' }])
    await store.getState().reload()

    const leads = store.getState().leads
    expect(leads.map(l => l.id)).toEqual(['l3', 'l1'])
    expect(leads.find(l => l.id === 'l1')?.funnelStage).toBe('atendimento')
  })

  it('quem ganha o lead numa troca de dono o mantém (mesmo instante do registro)', async () => {
    const store = await novoStore()
    db.fetchAll.mockResolvedValue([lead('l1', '2026-09-29T09:00:00.000Z')])
    await store.getState().load()

    // Mesma transação: updated_at do lead == deleted_at do registro de troca.
    // Formatos diferentes de propósito — PostgREST devolve +00:00 e microssegundos.
    db.fetchSince.mockResolvedValue([lead('l9', '2026-09-29T12:00:00.123456+00:00')])
    db.fetchDeletedSince.mockResolvedValue([{ id: 'l9', deletedAt: '2026-09-29T12:00:00.123456+00:00' }])
    await store.getState().reload()

    expect(store.getState().leads.map(l => l.id)).toContain('l9')
  })

  it('registro de troca reprocessado pela folga não derruba o lead que voltou', async () => {
    const store = await novoStore()
    db.fetchAll.mockResolvedValue([lead('l1', '2026-09-29T09:00:00.000Z')])
    await store.getState().load()

    // Rodada 1: l1 volta para mim às 12:00 (registro de troca no mesmo instante)
    db.fetchSince.mockResolvedValueOnce([lead('l1', '2026-09-29T12:00:00.000Z')])
    db.fetchDeletedSince.mockResolvedValueOnce([{ id: 'l1', deletedAt: '2026-09-29T12:00:00.000Z' }])
    await store.getState().reload()

    // Rodada 2: outro lead avançou a marca de alterações; o registro de troca de
    // l1 ainda cai na folga das exclusões, mas a linha de l1 já não vem.
    db.fetchSince.mockResolvedValueOnce([lead('l2', '2026-09-29T12:05:00.000Z')])
    db.fetchDeletedSince.mockResolvedValueOnce([{ id: 'l1', deletedAt: '2026-09-29T12:00:00.000Z' }])
    await store.getState().reload()

    expect(store.getState().leads.map(l => l.id).sort()).toEqual(['l1', 'l2'])
  })

  it('outro usuário na mesma aba recomeça do zero, sem ver o cache anterior', async () => {
    const store = await novoStore()
    db.fetchAll.mockResolvedValueOnce([lead('do-a', '2026-09-29T09:00:00.000Z')])
    await store.getState().load()

    usuario.id = 'broker-b'
    let visto: string[] = []
    db.fetchAll.mockImplementationOnce(async () => {
      visto = store.getState().leads.map(l => l.id)
      return [lead('do-b', '2026-09-29T09:00:00.000Z', { brokerId: 'broker-b' })]
    })
    await store.getState().load()

    expect(visto).toEqual([])
    expect(store.getState().leads.map(l => l.id)).toEqual(['do-b'])
    expect(db.fetchAll).toHaveBeenCalledTimes(2)
  })

  it('falha no delta avisa a tela e mantém o que estava', async () => {
    const store = await novoStore()
    db.fetchAll.mockResolvedValue([lead('l1', '2026-09-29T09:00:00.000Z')])
    await store.getState().load()

    db.fetchSince.mockRejectedValue(new Error('402 Payment Required'))
    await store.getState().load()

    expect(store.getState().erro).toBeTruthy()
    expect(store.getState().leads.map(l => l.id)).toEqual(['l1'])
  })
})
