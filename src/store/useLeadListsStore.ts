import { create } from 'zustand'
import { db } from '../lib/db'
import { LeadList, LeadListMember } from '../types'

interface LeadListsState {
  lists:   LeadList[]
  loading: boolean
  load:    () => Promise<void>
  save:    (list: LeadList) => Promise<void>
  remove:  (id: string)    => Promise<void>
  archive: (id: string)    => Promise<void>
  updateCount: (id: string, count: number) => Promise<void>
  membersCache: Record<string, LeadListMember[]>
  loadMembers: (listId: string) => Promise<LeadListMember[]>
}

export const useLeadListsStore = create<LeadListsState>((set, get) => ({
  lists:        [],
  loading:      false,
  membersCache: {},

  load: async () => {
    set({ loading: true })
    const lists = await db.leadLists.fetchAll()
    set({ lists, loading: false })
  },

  save: async (list) => {
    await db.leadLists.upsert(list)
    await get().load()
  },

  remove: async (id) => {
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
