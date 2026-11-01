/**
 * Banco primeiro — contatos, vendas, metas, campanhas e imóveis (01/11/2026).
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
  goals:    { upsert: vi.fn(), delete: vi.fn() },
  tasks:    { upsert: vi.fn(), delete: vi.fn(), setParticipants: vi.fn() },
  campaigns: { delete: vi.fn() },
  properties: { upsert: vi.fn(), delete: vi.fn() },
}
vi.mock('../lib/db', () => ({ db }))

async function stores() {
  vi.resetModules()
  const { useContactsStore } = await import('../store/useContactsStore')
  const { useSalesStore } = await import('../store/useSalesStore')
  const { useGoalsStore } = await import('../store/useGoalsStore')
  const { useCampaignsStore } = await import('../store/useCampaignsStore')
  const { usePropertiesStore } = await import('../store/usePropertiesStore')
  const { useTasksStore } = await import('../store/useTasksStore')
  return { useContactsStore, useSalesStore, useGoalsStore, useCampaignsStore, usePropertiesStore, useTasksStore }
}

const contatoBase = { name: 'Ana Lima', phone: '47999990000', tags: [], hasChildren: false, isMarried: false, permutaItems: [] }
const vendaBase = { clientId: 'c1', propertyName: 'Residencial Atlântico', date: '2026-11-01', value: 2450000, type: 'ready' as const }

beforeEach(() => {
  for (const t of [db.contacts, db.sales, db.goals, db.properties, db.tasks]) { t.upsert.mockReset(); t.delete.mockReset() }
  db.campaigns.delete.mockReset()
  db.tasks.setParticipants.mockReset()
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

const metaBase = { name: 'Atendimentos', category: 'visita' as const, target: 2, period: 'weekly' as const, active: true }

describe('metas: banco primeiro', () => {
  it('meta que falha ao criar não aparece', async () => {
    const { useGoalsStore } = await stores()
    db.goals.upsert.mockRejectedValue(new Error('rede'))

    await expect(useGoalsStore.getState().add(metaBase)).rejects.toThrow('rede')
    expect(useGoalsStore.getState().goals).toHaveLength(0)
  })

  it('pausar que falha mantém a meta ativa', async () => {
    const { useGoalsStore } = await stores()
    db.goals.upsert.mockResolvedValueOnce(undefined)
    const g = await useGoalsStore.getState().add(metaBase)
    db.goals.upsert.mockRejectedValueOnce(new Error('rede'))

    await expect(useGoalsStore.getState().update(g.id, { active: false })).rejects.toThrow()
    expect(useGoalsStore.getState().goals[0].active).toBe(true)
  })

  it('exclusão que falha mantém a meta', async () => {
    const { useGoalsStore } = await stores()
    db.goals.upsert.mockResolvedValueOnce(undefined)
    await useGoalsStore.getState().add(metaBase)
    db.goals.delete.mockRejectedValue(new Error('rls'))

    await expect(useGoalsStore.getState().remove(useGoalsStore.getState().goals[0].id)).rejects.toThrow()
    expect(useGoalsStore.getState().goals).toHaveLength(1)
  })
})

describe('campanhas: banco primeiro', () => {
  it('exclusão que falha mantém a campanha', async () => {
    const { useCampaignsStore } = await stores()
    useCampaignsStore.setState({ campaigns: [{ id: 'c1', name: 'Lista fria' } as never] })
    db.campaigns.delete.mockRejectedValue(new Error('rls'))

    await expect(useCampaignsStore.getState().remove('c1')).rejects.toThrow()
    expect(useCampaignsStore.getState().campaigns).toHaveLength(1)
  })
})

const imovelBase = {
  kind: 'ready' as const, name: 'Apto 203', type: 'apartment' as const, neighborhood: 'Centro',
  value: 850000, status: 'opportunity' as const,
}

describe('imóveis: banco primeiro', () => {
  it('cadastro que falha não aparece', async () => {
    const { usePropertiesStore } = await stores()
    db.properties.upsert.mockRejectedValue(new Error('rede'))

    await expect(usePropertiesStore.getState().add(imovelBase as never)).rejects.toThrow('rede')
    expect(usePropertiesStore.getState().properties).toHaveLength(0)
  })

  it('exclusão que falha mantém o imóvel', async () => {
    const { usePropertiesStore } = await stores()
    db.properties.upsert.mockResolvedValueOnce(undefined)
    const p = await usePropertiesStore.getState().add(imovelBase as never)
    db.properties.delete.mockRejectedValue(new Error('rls'))

    await expect(usePropertiesStore.getState().remove(p.id)).rejects.toThrow()
    expect(usePropertiesStore.getState().properties).toHaveLength(1)
  })
})

describe('desfazer exclusão: restaura pelo banco', () => {
  const tarefa = { id: 't1', title: 'Ligar para Ana', type: 'ligacao', status: 'pending', participants: ['u2'] } as never

  it('exclusão de tarefa que falha mantém a tarefa', async () => {
    const { useTasksStore } = await stores()
    useTasksStore.setState({ tasks: [tarefa] })
    db.tasks.delete.mockRejectedValue(new Error('rls'))

    await expect(useTasksStore.getState().remove('t1')).rejects.toThrow()
    expect(useTasksStore.getState().tasks).toHaveLength(1)
  })

  it('restaurar tarefa grava ela e os participantes antes de voltar à tela', async () => {
    const { useTasksStore } = await stores()
    let liberar!: () => void
    db.tasks.upsert.mockReturnValue(new Promise<void>(r => { liberar = r }))
    db.tasks.setParticipants.mockResolvedValue(undefined)

    const pendente = useTasksStore.getState().restaurar(tarefa)
    expect(useTasksStore.getState().tasks).toHaveLength(0)
    liberar()
    await pendente
    expect(db.tasks.setParticipants).toHaveBeenCalledWith('t1', ['u2'])
    expect(useTasksStore.getState().tasks).toHaveLength(1)
  })

  it('restaurar meta que falha não mostra a meta', async () => {
    const { useGoalsStore } = await stores()
    db.goals.upsert.mockRejectedValue(new Error('rede'))

    await expect(useGoalsStore.getState().restaurar({ ...metaBase, id: 'g1', createdAt: '', updatedAt: '' })).rejects.toThrow()
    expect(useGoalsStore.getState().goals).toHaveLength(0)
  })
})
