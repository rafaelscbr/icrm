import { create } from 'zustand'
import { Sale } from '../types'
import { generateId } from '../lib/formatters'
import { matchesPeriod, rangeFromPreset } from './usePeriodStore'
import { db } from '../lib/db'
import { mensagemDeErro } from '../lib/erros'
import { supabase } from '../lib/supabase'

const sortByDate = (sales: Sale[]) =>
  [...sales].sort((a, b) => b.date.localeCompare(a.date))

interface SalesStore {
  sales:   Sale[]
  loading: boolean
  /** mensagem da última falha de leitura; null quando deu certo */
  erro: string | null
  load:    () => Promise<void>
  subscribe: () => () => void
  /** Banco primeiro: só entra na lista depois de gravada. Falha lança (o erro já foi avisado). */
  add:     (data: Omit<Sale, 'id' | 'createdAt'>) => Promise<Sale>
  /** Grava no banco e só então entra no estado — para quem vai referenciar a venda em seguida */
  create:  (data: Omit<Sale, 'id' | 'createdAt'>) => Promise<Sale>
  /** Remove do banco e do estado, esperando a confirmação */
  discard: (id: string) => Promise<void>
  update:  (id: string, data: Partial<Sale>) => Promise<void>
  remove:  (id: string) => Promise<void>
  /** Desfazer exclusão: grava de novo com o mesmo id; só volta à tela depois do banco. */
  restaurar: (sale: Sale) => Promise<void>
  getByPeriod:      (start: string, end: string) => Sale[]
  getValueByPeriod: (start: string, end: string) => number
  getTotalValue:    () => number
  getThisMonth:     () => Sale[]
  getThisMonthValue: () => number
}

export const useSalesStore = create<SalesStore>((set, get) => ({
  sales:   [],
  loading: false,
  erro: null,

  load: async () => {
    set({ loading: true, erro: null })
    try {
      const sales = await db.sales.fetchAll()
      set({ sales: sortByDate(sales) })
    } catch (err) {
      // A tela PRECISA saber que falhou. Sem isto ela mostraria o estado vazio
      // e afirmaria que não existe dado — ver EstadoTela.
      console.error('[sales] load:', err)
      set({ erro: mensagemDeErro(err) })
    } finally {
      set({ loading: false })
    }
  },

  subscribe: () => {
    const channelName = 'sales-realtime'
    const existing = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`)
    if (existing) return () => {}

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sales' }, (payload) => {
        const r = payload.new as Record<string, unknown>
        const sale: Sale = {
          id: r.id as string,
          clientId: r.client_id as string,
          propertyId: (r.property_id as string | null) ?? undefined,
          propertyName: r.property_name as string,
          date: r.date as string,
          value: r.value as number,
          type: r.type as Sale['type'],
          notes: (r.notes as string | null) ?? undefined,
          commissionPct:   (r.commission_pct   as number | null) ?? undefined,
          commissionFixed: (r.commission_fixed as number | null) ?? undefined,
          brokerPct:       (r.broker_pct       as number | null) ?? undefined,
          brokerId:        (r.broker_id        as string | null) ?? undefined,
          createdAt: r.created_at as string,
        }
        set(s => s.sales.some(x => x.id === sale.id) ? s : { sales: sortByDate([sale, ...s.sales]) })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sales' }, (payload) => {
        const r = payload.new as Record<string, unknown>
        set(s => ({
          sales: sortByDate(s.sales.map(x => x.id !== r.id ? x : {
            ...x,
            clientId: r.client_id as string,
            propertyId: (r.property_id as string | null) ?? undefined,
            propertyName: r.property_name as string,
            date: r.date as string,
            value: r.value as number,
            type: r.type as Sale['type'],
            notes: (r.notes as string | null) ?? undefined,
            commissionPct:   (r.commission_pct   as number | null) ?? undefined,
            commissionFixed: (r.commission_fixed as number | null) ?? undefined,
            brokerPct:       (r.broker_pct       as number | null) ?? undefined,
            brokerId:        (r.broker_id        as string | null) ?? undefined,
          })),
        }))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'sales' }, (payload) => {
        const id = (payload.old as { id: string }).id
        set(s => ({ sales: s.sales.filter(x => x.id !== id) }))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  },

  // Antes: entrava na lista na hora e a falha ia só para o console — a tela
  // dizia "Venda registrada" e a venda não existia no banco.
  add: async (data) => {
    const sale: Sale = { ...data, id: generateId(), createdAt: new Date().toISOString() }
    await db.sales.upsert(sale)
    set(s => s.sales.some(x => x.id === sale.id) ? s : { sales: sortByDate([sale, ...s.sales]) })
    return sale
  },

  // O lead ganho grava sale_id apontando para esta venda (FK). Com o add()
  // otimista, o lead podia chegar ao banco antes da venda — e uma falha na
  // venda sumia no console, com o lead já encerrado.
  create: async (data) => {
    const sale: Sale = { ...data, id: generateId(), createdAt: new Date().toISOString() }
    await db.sales.upsert(sale)
    // O INSERT do realtime pode chegar antes desta linha
    set(s => s.sales.some(x => x.id === sale.id) ? s : { sales: sortByDate([sale, ...s.sales]) })
    return sale
  },

  discard: async (id) => {
    await db.sales.delete(id)
    set(s => ({ sales: s.sales.filter(s => s.id !== id) }))
  },

  update: async (id, data) => {
    const atual = get().sales.find(s => s.id === id)
    if (!atual) throw new Error('[sales] update: venda não está carregada')
    const updated: Sale = { ...atual, ...data }
    await db.sales.upsert(updated)
    set(s => ({ sales: sortByDate(s.sales.map(x => x.id === id ? updated : x)) }))
  },

  remove: async (id) => {
    await db.sales.delete(id)
    set(s => ({ sales: s.sales.filter(x => x.id !== id) }))
  },

  restaurar: async (sale) => {
    await db.sales.upsert(sale)
    set(s => s.sales.some(x => x.id === sale.id) ? s : { sales: sortByDate([sale, ...s.sales]) })
  },

  getByPeriod: (start, end) =>
    get().sales.filter(s => matchesPeriod(s.date, start, end)),

  getValueByPeriod: (start, end) =>
    get().sales
      .filter(s => matchesPeriod(s.date, start, end))
      .reduce((acc, s) => acc + s.value, 0),

  getTotalValue: () => get().sales.reduce((acc, s) => acc + s.value, 0),

  getThisMonth: () => {
    const { startDate, endDate } = rangeFromPreset('this_month')
    return get().getByPeriod(startDate, endDate)
  },

  getThisMonthValue: () => {
    const { startDate, endDate } = rangeFromPreset('this_month')
    return get().getValueByPeriod(startDate, endDate)
  },
}))
