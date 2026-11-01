import { create } from 'zustand'
import { Property, PropertyStatus } from '../types'
import { generateId } from '../lib/formatters'
import { makeThumbnail } from '../lib/image'
import { db } from '../lib/db'
import { mensagemDeErro } from '../lib/erros'

interface PropertiesStore {
  properties: Property[]
  loading: boolean
  /** mensagem da última falha de leitura; null quando deu certo */
  erro: string | null
  load: () => Promise<void>
  /**
   * Carrega as fotos completas de um imóvel sob demanda — a listagem baixa
   * apenas thumbnail (as fotos base64 somavam ~4,4 MB por abertura do app).
   * Resultado fica em cache no próprio imóvel (images: undefined = não
   * carregadas; [] = carregadas e vazio).
   */
  loadImages: (id: string) => Promise<string[]>
  /**
   * Migração one-shot: imóveis criados antes da coluna thumbnail ganham
   * miniatura gerada no navegador e salva no banco. Chamar apenas para admin
   * (a RLS de UPDATE bloqueia corretor em imóvel de outro). Após a primeira
   * execução não encontra mais candidatos.
   */
  backfillThumbnails: () => Promise<void>
  /** Banco primeiro: a tela só muda depois do upsert/delete. Lança se falhar. */
  add: (data: Omit<Property, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Property>
  update: (id: string, data: Partial<Property>) => Promise<void>
  remove: (id: string) => Promise<void>
  getById: (id: string) => Property | undefined
  search: (query: string) => Property[]
  filterByStatus: (status: PropertyStatus | null) => Property[]
}

// Garante uma única execução do backfill por sessão (o efeito que o dispara
// re-executa quando o store muda durante o próprio backfill)
let thumbBackfillStarted = false

export const usePropertiesStore = create<PropertiesStore>((set, get) => ({
  properties: [],
  loading: false,
  erro: null,

  load: async () => {
    set({ loading: true, erro: null })
    try {
      const properties = await db.properties.fetchAll()
      set({ properties })
    } catch (err) {
      console.error('[properties] load:', err)
      set({ erro: mensagemDeErro(err) })
    } finally {
      set({ loading: false })
    }
  },

  loadImages: async (id) => {
    const cached = get().properties.find(p => p.id === id)
    if (cached?.images !== undefined) return cached.images
    const images = await db.properties.fetchImages(id)
    set(s => ({
      properties: s.properties.map(p => p.id === id ? { ...p, images } : p),
    }))
    return images
  },

  backfillThumbnails: async () => {
    if (thumbBackfillStarted) return
    thumbBackfillStarted = true
    const candidates = get().properties.filter(p => !p.thumbnail)
    // Sequencial de propósito: evita rajada de downloads (as fotos completas
    // são base64 pesado) e de updates concorrentes
    for (const p of candidates) {
      try {
        const images = await get().loadImages(p.id)
        if (!images[0]) continue
        const thumbnail = await makeThumbnail(images[0])
        await db.properties.updateThumbnail(p.id, thumbnail)
        set(s => ({
          properties: s.properties.map(x => x.id === p.id ? { ...x, thumbnail } : x),
        }))
      } catch (err) {
        console.error('[properties] backfillThumbnails:', p.id, err)
      }
    }
  },

  // As três escritas eram otimistas e engoliam a falha no console: o imóvel
  // aparecia "cadastrado" e sumia no próximo carregamento (01/11/2026).
  add: async (data) => {
    const now = new Date().toISOString()
    const property: Property = { ...data, id: generateId(), createdAt: now, updatedAt: now }
    await db.properties.upsert(property)
    set(s => s.properties.some(p => p.id === property.id) ? s : { properties: [property, ...s.properties] })
    return property
  },

  update: async (id, data) => {
    const atual = get().properties.find(p => p.id === id)
    if (!atual) throw new Error('Imóvel não encontrado')
    const updated = { ...atual, ...data, updatedAt: new Date().toISOString() }
    await db.properties.upsert(updated)
    set(s => ({ properties: s.properties.map(p => p.id === id ? updated : p) }))
  },

  remove: async (id) => {
    await db.properties.delete(id)
    set(s => ({ properties: s.properties.filter(p => p.id !== id) }))
  },

  getById: (id) => get().properties.find(p => p.id === id),

  search: (query) => {
    const q = query.toLowerCase()
    return get().properties.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.neighborhood.toLowerCase().includes(q)
    )
  },

  filterByStatus: (status) => {
    if (!status) return get().properties
    return get().properties.filter(p => p.status === status)
  },
}))
