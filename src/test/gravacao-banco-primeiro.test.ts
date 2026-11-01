/**
 * Banco primeiro — contatos e vendas (01/11/2026).
 *
 * Os dois stores colocavam o registro na tela antes de o banco responder, e a
 * venda ainda engolia a falha no console: o corretor via "Venda registrada" e
 * a venda não existia. A regra do sistema é a contrária — a tela só muda
 * depois que o banco confirma, e a falha chega a quem chamou.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), dismiss: vi.fn() }),
}))
vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn(), getChannels: vi.fn(() => []) } }))
vi.mock('../lib/auth', () => ({
  getCurrentUserId: vi.fn(() => 'broker-a'),
  requireBrokerId:  vi.fn(() => 'broker-a'),
}))

const db = {
  contacts: { upsert: vi.fn(), delete: vi.fn() },
  sales:    { upsert: vi.fn(), delete: vi.fn() },
}
vi.mock('../lib/db', () => ({ db }))

async function stores() {
  vi.resetModules()
  const { useContactsStore } = await import('../store/useContactsStore')
  const { useSalesStore } = await import('../store/useSalesStore')
  return { useContactsStore, useSalesStore }
}

const contatoBase = { name: 'Ana Lima', phone: '47999990000', tags: [], hasChildren: false, isMarried: false, permutaItems: [] }
const vendaBase = { clientId: 'c1', propertyName: 'Residencial Atlântico', date: '2026-11-01', value: 2450000, type: 'ready' as const }

beforeEach(() => {
  for (const t of [db.contacts, db.sales]) { t.upsert.mockReset(); t.delete.mockReset() }
})

describe('contatos: banco primeiro', () => {
  it('só aparece na lista depois que o banco grava', async () => {
    const { useContactsStore } = await stores()
    let liberar!: () => void
    db.contacts.upsert.mockReturnValue(new Promise<void>(r => { liberar = r }))

    const pendente = useContactsStore.getState().add(contatoBase)
    expect(useContactsStore.getState().contacts).toHaveLength(0)

    liberar()
    const criado = await pendente
    expect(useContactsStore.getState().contacts.map(c => c.id)).toEqual([criado.id])
  })

  it('falha do banco chega a quem chamou e não deixa rastro na tela', async () => {
    const { useContactsStore } = await stores()
    db.contacts.upsert.mockRejectedValue(new Error('rede'))

    await expect(useContactsStore.getState().add(contatoBase)).rejects.toThrow('rede')
    expect(useContactsStore.getState().contacts).toHaveLength(0)
  })

  it('exclusão que falha mantém o contato', async () => {
    const { useContactsStore } = await stores()
    db.contacts.upsert.mockResolvedValue(undefined)
    const c = await useContactsStore.getState().add(contatoBase)
    db.contacts.delete.mockRejectedValue(new Error('rls'))

    await expect(useContactsStore.getState().remove(c.id)).rejects.toThrow()
    expect(useContactsStore.getState().contacts).toHaveLength(1)
  })
})

describe('vendas: banco primeiro', () => {
  it('falha ao registrar não mostra a venda', async () => {
    const { useSalesStore } = await stores()
    db.sales.upsert.mockRejectedValue(new Error('rede'))

    await expect(useSalesStore.getState().add(vendaBase)).rejects.toThrow('rede')
    expect(useSalesStore.getState().sales).toHaveLength(0)
  })

  it('edição que falha mantém o valor antigo', async () => {
    const { useSalesStore } = await stores()
    db.sales.upsert.mockResolvedValueOnce(undefined)
    const v = await useSalesStore.getState().add(vendaBase)
    db.sales.upsert.mockRejectedValueOnce(new Error('rede'))

    await expect(useSalesStore.getState().update(v.id, { value: 1 })).rejects.toThrow()
    expect(useSalesStore.getState().sales[0].value).toBe(2450000)
  })
})
