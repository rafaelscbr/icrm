import { create } from 'zustand'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import { AppNotification } from '../types'

// Som curto de alerta — gerado via Web Audio (sem asset). Pode falhar
// silenciosamente se o navegador ainda não liberou áudio (sem interação).
function playAlertSound() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(1175, ctx.currentTime + 0.12)
    gain.gain.setValueAtTime(0.12, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.35)
    osc.onended = () => ctx.close()
  } catch { /* áudio bloqueado pelo navegador — push e toast cobrem */ }
}

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
    // Lead novo/transferido/recapturado: alerta sonoro + toast com a urgência
    if (n.type === 'lead_assigned' || n.type === 'lead_recaptured') {
      playAlertSound()
      toast(`${n.title}${n.body ? ` — ${n.body}` : ''}`, {
        duration: 8000,
        style: { borderLeft: '3px solid #E4B23C' },
      })
    }
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
