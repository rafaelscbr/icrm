import { create } from 'zustand'
import { db }       from '../lib/db'
import { supabase } from '../lib/supabase'
import { LeadList, LeadListMember } from '../types'
import { mensagemDeErro } from '../lib/erros'

interface LeadListsState {
  lists:   LeadList[]
  loading: boolean
  /** mensagem da última falha de leitura; null quando deu certo */
  erro:    string | null
  load:    () => Promise<void>
  save:    (list: LeadList) => Promise<void>
  remove:  (id: string, contactIdsToDelete?: string[]) => Promise<void>
  archive: (id: string)    => Promise<void>
  updateCount: (id: string, count: number) => Promise<void>
  membersCache: Record<string, LeadListMember[]>
  loadMembers: (listId: string) => Promise<LeadListMember[]>
}

export const useLeadListsStore = create<LeadListsState>((set, get) => ({
  lists:        [],
  loading:      false,
  erro:         null,
  membersCache: {},

  load: async () => {
    // Antes não havia try/catch: uma falha rejeitava a promise sem tratamento
    // e `loading` ficava true para sempre — a tela girava indefinidamente sem
    // dizer o que houve.
    set({ loading: true, erro: null })
    try {
      const lists = await db.leadLists.fetchAll()
      set({ lists })
    } catch (err) {
      console.error('[leadLists] load:', err)
      set({ erro: mensagemDeErro(err) })
    } finally {
      set({ loading: false })
    }
  },

  save: async (list) => {
    await db.leadLists.upsert(list)
    await get().load()
  },

  remove: async (id, contactIdsToDelete = []) => {
    // Deletar contatos em chunks antes de excluir a lista
    const CHUNK = 500
    for (let i = 0; i < contactIdsToDelete.length; i += CHUNK) {
      const chunk = contactIdsToDelete.slice(i, i + CHUNK)
      await supabase.from('contacts').delete().in('id', chunk)
    }
    // Excluir a lista (CASCADE remove lead_list_members automaticamente)
    await db.leadLists.delete(id)
    set(s => ({ lists: s.lists.filter(l => l.id !== id) }))
  },

  archive: async (id) => {
    const list = get().lists.find(l => l.id === id)
    if (!list) return
    await db.leadLists.upsert({ ...list, status: 'archived', updatedAt: new Date().toISOString() })
    set(s => ({ lists: s.lists.map(l => l.id === id ? { ...l, status: 'archived' } : l) }))
  },

  updateCount: async (id, count) => {
    await db.leadLists.updateCount(id, count)
    set(s => ({ lists: s.lists.map(l => l.id === id ? { ...l, totalCount: count } : l) }))
  },

  loadMembers: async (listId) => {
    const cached = get().membersCache[listId]
    if (cached) return cached
    const members = await db.leadListMembers.fetchForList(listId)
    set(s => ({ membersCache: { ...s.membersCache, [listId]: members } }))
    return members
  },
}))
