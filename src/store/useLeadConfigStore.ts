import { create } from 'zustand'
import { LeadConfigEntry, LeadConfigType } from '../types'
import { generateId } from '../lib/formatters'
import { db } from '../lib/db'

// Configuração estática — usada como fallback se a tabela lead_config não existir
export const STATIC_DISCARD_REASONS: LeadConfigEntry[] = [
  { id: 'sr-1', type: 'discard_reason', slug: 'sem_condicao',       label: 'Sem condição financeira',  emoji: '💸', displayOrder: 1, active: true, createdAt: '', updatedAt: '' },
  { id: 'sr-2', type: 'discard_reason', slug: 'fora_de_nicho',      label: 'Fora do nicho de atuação', emoji: '🎯', displayOrder: 2, active: true, createdAt: '', updatedAt: '' },
  { id: 'sr-3', type: 'discard_reason', slug: 'parou_de_responder', label: 'Parou de responder',       emoji: '🔇', displayOrder: 3, active: true, createdAt: '', updatedAt: '' },
  { id: 'sr-4', type: 'discard_reason', slug: 'nunca_respondeu',    label: 'Nunca respondeu',          emoji: '📵', displayOrder: 4, active: true, createdAt: '', updatedAt: '' },
  { id: 'sr-5', type: 'discard_reason', slug: 'telefone_invalido',  label: 'Telefone inválido',        emoji: '❌', displayOrder: 5, active: true, createdAt: '', updatedAt: '' },
]

export const STATIC_ORIGINS: LeadConfigEntry[] = [
  { id: 'or-1', type: 'origin', slug: 'felicita',  label: 'Felicità',  emoji: '✨', color: 'text-rose-400',   displayOrder: 1, active: true, createdAt: '', updatedAt: '' },
  { id: 'or-2', type: 'origin', slug: 'meta_ads',  label: 'Meta ADS',  emoji: '📱', color: 'text-blue-400',   displayOrder: 2, active: true, createdAt: '', updatedAt: '' },
  { id: 'or-3', type: 'origin', slug: 'portal',    label: 'Portal',    emoji: '🌐', color: 'text-cyan-400',   displayOrder: 3, active: true, createdAt: '', updatedAt: '' },
  { id: 'or-4', type: 'origin', slug: 'offline',   label: 'Offline',   emoji: '🤝', color: 'text-amber-400',  displayOrder: 4, active: true, createdAt: '', updatedAt: '' },
  { id: 'or-5', type: 'origin', slug: 'campanha',  label: 'Campanha',  emoji: '📣', color: 'text-violet-400', displayOrder: 5, active: true, createdAt: '', updatedAt: '' },
]

const STATIC_ALL = [...STATIC_DISCARD_REASONS, ...STATIC_ORIGINS]

interface LeadConfigStore {
  items:       LeadConfigEntry[]
  loaded:      boolean
  dbAvailable: boolean
  load:        () => Promise<void>
  getByType:   (type: LeadConfigType) => LeadConfigEntry[]
  getBySlug:   (slug: string) => LeadConfigEntry | undefined
  add:         (type: LeadConfigType, data: Pick<LeadConfigEntry, 'slug' | 'label' | 'emoji' | 'color'>) => Promise<void>
  update:      (id: string, data: Partial<Pick<LeadConfigEntry, 'label' | 'emoji' | 'color' | 'active' | 'displayOrder'>>) => Promise<void>
  remove:      (id: string) => Promise<void>
}

export const useLeadConfigStore = create<LeadConfigStore>((set, get) => ({
  items:       STATIC_ALL,
  loaded:      false,
  dbAvailable: false,

  load: async () => {
    if (get().loaded && get().dbAvailable) return
    try {
      const items = await db.leadConfig.fetchAll()
      set({ items, loaded: true, dbAvailable: true })
    } catch {
      // Tabela não existe ainda — usa config estática
      set({ items: STATIC_ALL, loaded: true, dbAvailable: false })
    }
  },

  getByType: (type) => get().items.filter(i => i.type === type && i.active).sort((a, b) => a.displayOrder - b.displayOrder),

  getBySlug: (slug) => get().items.find(i => i.slug === slug),

  add: async (type, data) => {
    const now = new Date().toISOString()
    const existing = get().items.filter(i => i.type === type)
    const entry: LeadConfigEntry = {
      id: generateId(),
      type,
      slug: data.slug,
      label: data.label,
      emoji: data.emoji,
      color: data.color,
      displayOrder: existing.length + 1,
      active: true,
      createdAt: now,
      updatedAt: now,
    }
    set(s => ({ items: [...s.items, entry] }))
    if (get().dbAvailable) {
      await db.leadConfig.upsert(entry).catch(err => console.error('[leadConfig] add:', err))
    }
  },

  update: async (id, data) => {
    set(s => ({
      items: s.items.map(i =>
        i.id === id ? { ...i, ...data, updatedAt: new Date().toISOString() } : i
      ),
    }))
    const item = get().items.find(i => i.id === id)
    if (item && get().dbAvailable) {
      await db.leadConfig.upsert(item).catch(err => console.error('[leadConfig] update:', err))
    }
  },

  remove: async (id) => {
    set(s => ({ items: s.items.filter(i => i.id !== id) }))
    if (get().dbAvailable) {
      await db.leadConfig.delete(id).catch(err => console.error('[leadConfig] remove:', err))
    }
  },
}))
