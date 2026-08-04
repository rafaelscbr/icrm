import { create } from 'zustand'
import { Contact, ContactTag } from '../types'
import { generateId, isBirthdayThisMonth } from '../lib/formatters'
import { db } from '../lib/db'
import { mensagemDeErro } from '../lib/erros'
import { supabase } from '../lib/supabase'
import { getCurrentUserId } from '../lib/auth'
import toast from 'react-hot-toast'

interface ContactsStore {
  contacts: Contact[]
  loading: boolean
  /** mensagem da última falha de leitura; null quando deu certo */
  erro: string | null
  load: () => Promise<void>
  /** Carrega só os contatos indicados (merge). Não avança a marca d'água do sync. */
  loadByIds: (ids: string[]) => Promise<void>
  /** Insere contatos já obtidos (busca no servidor) sem nova ida ao banco. */
  mergeLocal: (novos: Contact[]) => void
  /** Assina realtime de contacts — eventos disparam sync incremental */
  subscribe: () => () => void
  add: (data: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>) => Contact
  update: (id: string, data: Partial<Contact>) => void
  remove: (id: string) => void
  getById: (id: string) => Contact | undefined
  search: (query: string) => Contact[]
  filterByTag: (tag: ContactTag | null) => Contact[]
  getBirthdaysThisMonth: () => Contact[]
}

// Deduplica chamadas concorrentes — vários componentes montam ao mesmo tempo e
// cada um chama load(); sem isso a tabela inteira era baixada 3-4x em paralelo.
let inflightLoad: Promise<void> | null = null

// Sync incremental: após o primeiro carregamento completo, load() busca apenas
// contatos com updated_at posterior à marca d'água (a tabela tem 12k+ linhas —
// rebaixar tudo a cada navegação travava a interface). Exclusões feitas por
// outros usuários chegam pelo delta de deleted_rows (trigger no banco) — o
// carregamento completo acontece uma única vez por sessão. O reload periódico
// de 5 min foi removido: baixava ~5 MB por ciclo (egress).
let lastSyncAt: string | null = null
let lastDeleteSyncAt: string | null = null
const SYNC_OVERLAP_MS = 2_000

export const useContactsStore = create<ContactsStore>((set, get) => ({
  contacts: [],
  loading: false,
  erro: null,

  load: () => {
    if (inflightLoad) return inflightLoad
    inflightLoad = (async () => {
      const isFullLoad = lastSyncAt === null
      // Spinner apenas quando ainda não há nada em tela — revisitas mostram o
      // dado existente na hora e atualizam em segundo plano.
      if (get().contacts.length === 0) set({ loading: true })
      set({ erro: null })
      try {
        const overlap = (iso: string) =>
          new Date(new Date(iso).getTime() - SYNC_OVERLAP_MS).toISOString()

        if (isFullLoad) {
          const contacts = await db.contacts.fetchAll()
          for (const c of contacts) {
            if (!lastSyncAt || new Date(c.updatedAt).getTime() > new Date(lastSyncAt).getTime()) {
              lastSyncAt = c.updatedAt
            }
          }
          if (!lastSyncAt) lastSyncAt = new Date(0).toISOString()
          // Exclusões anteriores ao carregamento completo já estão refletidas
          // (as linhas simplesmente não vieram) — o delta parte da mesma âncora.
          lastDeleteSyncAt = lastSyncAt
          set({ contacts })
        } else {
          const [changed, deleted] = await Promise.all([
            db.contacts.fetchSince(overlap(lastSyncAt!)),
            db.contacts.fetchDeletedSince(overlap(lastDeleteSyncAt ?? lastSyncAt!)),
          ])
          if (changed.length > 0) {
            for (const c of changed) {
              if (new Date(c.updatedAt).getTime() > new Date(lastSyncAt!).getTime()) {
                lastSyncAt = c.updatedAt
              }
            }
            const current = get().contacts
            const ids = new Set(current.map(c => c.id))
            const changedById = new Map(changed.map(c => [c.id, c]))
            // Escrita otimista pendente mais recente que o banco vence o delta
            const merged = current.map(c => {
              const ch = changedById.get(c.id)
              if (!ch) return c
              return new Date(c.updatedAt).getTime() > new Date(ch.updatedAt).getTime() ? c : ch
            })
            merged.push(...changed.filter(c => !ids.has(c.id)))
            set({ contacts: merged })
          }

          // Remove contatos excluídos no banco desde a última sync (deleted_rows).
          // Guarda de timestamp: se o contato local é mais recente que a exclusão
          // registrada (reimport com o mesmo id), mantém a versão local.
          if (deleted.length > 0) {
            const deletedAtById = new Map(deleted.map(d => [d.id, d.deletedAt]))
            set(s => ({
              contacts: s.contacts.filter(c => {
                const delAt = deletedAtById.get(c.id)
                return !delAt || new Date(c.updatedAt).getTime() > new Date(delAt).getTime()
              }),
            }))
            for (const d of deleted) {
              if (!lastDeleteSyncAt || new Date(d.deletedAt).getTime() > new Date(lastDeleteSyncAt).getTime()) {
                lastDeleteSyncAt = d.deletedAt
              }
            }
          }
        }
      } catch (err) {
        // A tela PRECISA saber que falhou. Sem isto ela mostraria "0 contatos
        // cadastrados" com 12.578 no banco — ver EstadoTela.
        console.error('[contacts] load:', err)
        set({ erro: mensagemDeErro(err) })
      } finally {
        set({ loading: false })
        inflightLoad = null
      }
    })()
    return inflightLoad
  },

  // Insere contatos já obtidos (ex.: resultado de busca no servidor) no store,
  // sem ir ao banco de novo. Necessário para que getById() enxergue um contato
  // escolhido num combobox que consultou o servidor.
  mergeLocal: (novos) => {
    if (novos.length === 0) return
    set(s => {
      const existentes = new Set(s.contacts.map(c => c.id))
      const faltantes  = novos.filter(c => !existentes.has(c.id))
      return faltantes.length > 0 ? { contacts: [...s.contacts, ...faltantes] } : s
    })
  },

  // Carrega SÓ os contatos indicados, mesclando com o que já existe.
  //
  // Para telas que precisam apenas do nome de alguns contatos (o cliente de uma
  // venda, o contato de uma tarefa) — no Dashboard eram ~40 lookups custando o
  // fetchAll de 12.543 linhas. NÃO mexe na marca d'água do sync incremental:
  // este carregamento é parcial, e avançar `lastSyncAt` faria o delta seguinte
  // pular os contatos que nunca foram baixados.
  loadByIds: async (ids) => {
    const faltantes = ids.filter(id => id && !get().contacts.some(c => c.id === id))
    if (faltantes.length === 0) return
    try {
      const novos = await db.contacts.fetchByIds(faltantes)
      if (novos.length === 0) return
      set(s => {
        const existentes = new Set(s.contacts.map(c => c.id))
        return { contacts: [...s.contacts, ...novos.filter(c => !existentes.has(c.id))] }
      })
    } catch (err) {
      console.error('[contacts] loadByIds:', err)
    }
  },

  // ── Realtime ─────────────────────────────────────────────────────────────────
  // Evento como gatilho do load() incremental — o dado vem sempre do banco.
  // Exclusões chegam só com o id e são aplicadas localmente.
  subscribe: () => {
    const channelName = 'contacts-realtime'
    if (supabase.getChannels().some(c => c.topic === `realtime:${channelName}`)) return () => {}

    let disposed = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let syncTimer: ReturnType<typeof setTimeout> | null = null
    let deleteTimer: ReturnType<typeof setTimeout> | null = null
    let pendingDeletes: string[] = []
    let channel: ReturnType<typeof buildChannel> | null = null

    const scheduleSync = () => {
      // Store ainda não inicializado — não dispara o primeiro carregamento
      // completo (12k+ linhas) por causa de evento alheio
      if (lastSyncAt === null || syncTimer) return
      syncTimer = setTimeout(() => {
        syncTimer = null
        useContactsStore.getState().load()
      }, 500)
    }

    const scheduleDelete = (id: string) => {
      pendingDeletes.push(id)
      if (deleteTimer) return
      deleteTimer = setTimeout(() => {
        const ids = new Set(pendingDeletes)
        pendingDeletes = []
        deleteTimer = null
        set(s => ({ contacts: s.contacts.filter(c => !ids.has(c.id)) }))
      }, 300)
    }

    const buildChannel = () => supabase
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'contacts' }, scheduleSync)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'contacts' }, scheduleSync)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'contacts' }, (payload) => {
        scheduleDelete((payload.old as { id: string }).id)
      })

    const connect = (isReconnect: boolean) => {
      if (disposed) return
      channel = buildChannel()
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (isReconnect && lastSyncAt !== null) useContactsStore.getState().load()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (disposed) return
          if (channel) { supabase.removeChannel(channel); channel = null }
          if (retryTimer) clearTimeout(retryTimer)
          retryTimer = setTimeout(() => connect(true), 4000)
        }
      })
    }
    connect(false)

    return () => {
      disposed = true
      if (retryTimer)  clearTimeout(retryTimer)
      if (syncTimer)   clearTimeout(syncTimer)
      if (deleteTimer) clearTimeout(deleteTimer)
      if (channel) supabase.removeChannel(channel)
    }
  },

  add: (data) => {
    const now = new Date().toISOString()
    // Garante brokerId — sem ele a RLS bloqueia o INSERT silenciosamente
    const brokerId = data.brokerId ?? getCurrentUserId() ?? undefined
    if (!brokerId) {
      toast.error('Sessão expirada. Faça login novamente antes de criar contatos.')
      throw new Error('[contacts] add: brokerId ausente')
    }
    const contact: Contact = { ...data, brokerId, id: generateId(), createdAt: now, updatedAt: now }
    set(s => ({ contacts: [contact, ...s.contacts] }))
    db.contacts.upsert(contact).catch(err => {
      console.error('[contacts] add:', err)
      toast.error('Erro ao salvar contato no banco. Tente novamente.')
      set(s => ({ contacts: s.contacts.filter(c => c.id !== contact.id) }))
    })
    return contact
  },

  update: (id, data) => {
    const now = new Date().toISOString()
    const contacts = get().contacts.map(c =>
      c.id === id ? { ...c, ...data, updatedAt: now } : c
    )
    set({ contacts })
    const updated = contacts.find(c => c.id === id)
    if (updated) db.contacts.upsert(updated).catch(err => {
      console.error('[contacts] update:', err)
      toast.error('Erro ao salvar alteração do contato.')
    })
  },

  remove: (id) => {
    set(s => ({ contacts: s.contacts.filter(c => c.id !== id) }))
    db.contacts.delete(id).catch(err => {
      console.error('[contacts] remove:', err)
      toast.error('Erro ao excluir contato.')
    })
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
