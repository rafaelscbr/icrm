import { create } from 'zustand'
import toast from 'react-hot-toast'
import { Development } from '../types'
import { generateId } from '../lib/formatters'
import { db } from '../lib/db'
import { mensagemDeErro } from '../lib/erros'

/**
 * Lançamentos — o cadastro que dá o outro lado da qualificação de lead.
 *
 * Sem a régua comercial daqui, saber que um lead declarou "renda até R$ 5 mil"
 * não serve para nada: falta contra o quê comparar.
 *
 * Banco primeiro em toda escrita. Se o upsert falhar, a tela NÃO muda e o erro
 * aparece — condição comercial errada em memória vira lead classificado errado.
 */

/** Campos que formam a régua — mudança em qualquer um deles vira snapshot. */
const CAMPOS_DA_REGUA = [
  'regime', 'incomeMin', 'incomeIdeal', 'downPaymentMin', 'downPaymentIdeal',
  'fgtsComposes', 'acceptsResident', 'acceptsInvestor', 'unitTypes',
  'paymentPlans', 'valueMin', 'valueMax',
] as const

function reguaMudou(antes: Development, depois: Partial<Development>): boolean {
  return CAMPOS_DA_REGUA.some(campo => {
    if (!(campo in depois)) return false
    return JSON.stringify(antes[campo]) !== JSON.stringify(depois[campo])
  })
}

/** Só a régua — é o que precisa virar histórico, não o cadastro inteiro. */
function snapshotDaRegua(d: Development) {
  return {
    changedAt: new Date().toISOString(),
    validFrom: d.validFrom,
    before: Object.fromEntries(CAMPOS_DA_REGUA.map(c => [c, d[c]])),
  }
}

interface DevelopmentsStore {
  developments: Development[]
  loading: boolean
  /** mensagem da última falha de leitura; null quando deu certo */
  erro: string | null
  load: () => Promise<void>
  add: (data: Omit<Development, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Development>
  update: (id: string, data: Partial<Development>) => Promise<void>
  remove: (id: string) => Promise<void>
  getById: (id: string) => Development | undefined
  /** Produto de um formulário do Meta — fecha o elo formulário → régua. */
  getByMetaForm: (formId: string) => Development | undefined
}

export const useDevelopmentsStore = create<DevelopmentsStore>((set, get) => ({
  developments: [],
  loading: false,
  erro: null,

  load: async () => {
    set({ loading: true, erro: null })
    try {
      const developments = await db.developments.fetchAll()
      set({ developments })
    } catch (err) {
      console.error('[developments] load:', err)
      set({ erro: mensagemDeErro(err) })
    } finally {
      set({ loading: false })
    }
  },

  add: async (data) => {
    const now = new Date().toISOString()
    const development: Development = {
      ...data,
      id: `dev-${generateId()}`,
      createdAt: now,
      updatedAt: now,
    }
    try {
      await db.developments.upsert(development)
      set(s => ({ developments: [development, ...s.developments] }))
      return development
    } catch (err) {
      console.error('[developments] add:', err)
      toast.error('Erro ao salvar o lançamento. Verifique sua conexão e tente novamente.')
      throw err
    }
  },

  update: async (id, data) => {
    const atual = get().developments.find(d => d.id === id)
    if (!atual) return

    // Mudou a régua? O estado anterior vira histórico ANTES de ser substituído.
    // É o que permite qualificar um lead pela condição que valia no dia em que
    // ele entrou, em vez de reescrever o passado a cada mudança de tabela.
    const historico = reguaMudou(atual, data)
      ? [...(atual.conditionHistory ?? []), snapshotDaRegua(atual)]
      : atual.conditionHistory

    const atualizado: Development = {
      ...atual,
      ...data,
      conditionHistory: historico,
      updatedAt: new Date().toISOString(),
    }

    try {
      await db.developments.upsert(atualizado)
      set(s => ({ developments: s.developments.map(d => d.id === id ? atualizado : d) }))
    } catch (err) {
      console.error('[developments] update:', err)
      toast.error('Erro ao salvar as alterações. Verifique sua conexão e tente novamente.')
      throw err
    }
  },

  remove: async (id) => {
    try {
      await db.developments.delete(id)
      set(s => ({ developments: s.developments.filter(d => d.id !== id) }))
    } catch (err) {
      console.error('[developments] remove:', err)
      toast.error('Erro ao excluir o lançamento. Verifique sua conexão e tente novamente.')
      throw err
    }
  },

  getById: (id) => get().developments.find(d => d.id === id),

  getByMetaForm: (formId) =>
    get().developments.find(d => d.active && d.metaFormIds.includes(formId)),
}))
