import { create } from 'zustand'
import { Contact, ContactTag } from '../types'
import { generateId, isBirthdayThisMonth } from '../lib/formatters'
import { db } from '../lib/db'

interface ContactsStore {
  contacts: Contact[]
  loading: boolean
  load: () => Promise<void>
  add: (data: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>) => Contact
  update: (id: string, data: Partial<Contact>) => void
  remove: (id: string) => void
  getById: (id: string) => Contact | undefined
  search: (query: string) => Contact[]
  filterByTag: (tag: ContactTag | null) => Contact[]
  getBirthdaysThisMonth: () => Contact[]
}

export const useContactsStore = create<ContactsStore>((set, get) => ({
  contacts: [],
  loading: false,

  load: async () => {
    set({ loading: true })
    try {
      const contacts = await db.contacts.fetchAll()
      set({ contacts })
    } catch (err) {
      console.error('[contacts] load:', err)
    } finally {
      set({ loading: false })
    }
  },

  add: (data) => {
    const now = new Date().toISOString()
    const contact: Contact = { ...data, id: generateId(), createdAt: now, updatedAt: now }
    set(s => ({ contacts: [contact, ...s.contacts] }))
    db.contacts.upsert(contact).catch(err => console.error('[contacts] add:', err))
    return contact
  },

  update: (id, data) => {
    const now = new Date().toISOString()
    const contacts = get().contacts.map(c =>
      c.id === id ? { ...c, ...data, updatedAt: now } : c
    )
    set({ contacts })
    const updated = contacts.find(c => c.id === id)
    if (updated) db.contacts.upsert(updated).catch(err => console.error('[contacts] update:', err))
  },

  remove: (id) => {
    set(s => ({ contacts: s.contacts.filter(c => c.id !== id) }))
    db.contacts.delete(id).catch(err => console.error('[contacts] remove:', err))
  },

  getById: (id) => get().contacts.find(c => c.id === id),

  search: (query) => {
    const q = query.toLowerCase()
    return get().contacts.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      (c.company ?? '').toLowerCase().includes(q)
    )
  },

  filterByTag: (tag) => {
    if (!tag) return get().contacts
    return get().contacts.filter(c => c.tags.includes(tag))
  },

  getBirthdaysThisMonth: () =>
    get().contacts.filter(c => c.birthdate && isBirthdayThisMonth(c.birthdate)),
}))
