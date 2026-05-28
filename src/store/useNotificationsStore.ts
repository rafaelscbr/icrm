import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import { AppNotification } from '../types'

interface NotificationsStore {
  notifications: AppNotification[]
  loading: boolean
  // Carrega notificações do usuário
  load: (userId: string) => Promise<void>
  // Marca uma notificação como lida
  markRead: (id: string) => void
  // Marca todas como lidas
  markAllRead: (userId: string) => void
  // Inicia subscription realtime — retorna fn de cleanup
  subscribe: (userId: string) => () => void
  // Adiciona notificação recebida via realtime
  _addRealtime: (n: AppNotification) => void
}

export const useNotificationsStore = create<NotificationsStore>((set, get) => ({
  notifications: [],
  loading: false,

  load: async (userId: string) => {
    set({ loading: true })
    try {
      const notifications = await db.notifications.fetchForUser(userId)
      set({ notifications })
    } catch (err) {
      console.error('[notifications] load:', err)
    } finally {
      set({ loading: false })
    }
  },

  markRead: (id: string) => {
    set(s => ({
      notifications: s.notifications.map(n => n.id === id ? { ...n, read: true } : n),
    }))
    db.notifications.markRead(id).catch(err => console.error('[notifications] markRead:', err))
  },

  markAllRead: (userId: string) => {
    set(s => ({
      notifications: s.notifications.map(n => ({ ...n, read: true })),
    }))
    db.notifications.markAllRead(userId).catch(err => console.error('[notifications] markAllRead:', err))
  },

  _addRealtime: (n: AppNotification) => {
    set(s => ({
      notifications: [n, ...s.notifications.filter(x => x.id !== n.id)],
    }))
  },

  subscribe: (userId: string) => {
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const r = payload.new as {
            id: string; user_id: string; type: string; title: string
            body: string | null; resource_id: string | null; resource_type: string | null
            read: boolean; created_at: string
          }
          const notif: AppNotification = {
            id: r.id, userId: r.user_id, type: r.type as AppNotification['type'],
            title: r.title, body: r.body ?? undefined,
            resourceId: r.resource_id ?? undefined, resourceType: r.resource_type ?? undefined,
            read: r.read, createdAt: r.created_at,
          }
          get()._addRealtime(notif)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  },
}))

// Selectors
export const useUnreadCount = () =>
  useNotificationsStore(s => s.notifications.filter(n => !n.read).length)

export const useRecentNotifications = (limit = 3) =>
  useNotificationsStore(s => s.notifications.slice(0, limit))
