import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, ClipboardList, CheckCheck, Filter } from 'lucide-react'
import { PageLayout } from '../components/layout/PageLayout'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { useNotificationsStore } from '../store/useNotificationsStore'
import { useAuthStore } from '../store/useAuthStore'
import { AppNotification } from '../types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins  <  1) return 'agora mesmo'
  if (mins  < 60) return `${mins}min atrás`
  if (hours < 24) return `${hours}h atrás`
  if (days  <  7) return `${days}d atrás`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: days > 365 ? 'numeric' : undefined })
}

function dateLabel(iso: string): string {
  const d = new Date(iso)
  const today     = new Date(); today.setHours(0,0,0,0)
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  const notifDay  = new Date(d); notifDay.setHours(0,0,0,0)

  if (notifDay.getTime() === today.getTime())     return 'Hoje'
  if (notifDay.getTime() === yesterday.getTime()) return 'Ontem'

  const diffDays = Math.floor((today.getTime() - notifDay.getTime()) / 86400000)
  if (diffDays < 7) return 'Esta semana'
  if (diffDays < 30) return 'Este mês'
  return 'Mais antigas'
}

const GROUP_ORDER = ['Hoje', 'Ontem', 'Esta semana', 'Este mês', 'Mais antigas']

function groupNotifications(notifications: AppNotification[]) {
  const groups: Record<string, AppNotification[]> = {}
  for (const n of notifications) {
    const label = dateLabel(n.createdAt)
    if (!groups[label]) groups[label] = []
    groups[label].push(n)
  }
  return GROUP_ORDER.filter(g => groups[g]).map(g => ({ label: g, items: groups[g] }))
}

// ─── NotificationItem ─────────────────────────────────────────────────────────

function NotificationItem({
  n, onRead,
}: { n: AppNotification; onRead: (id: string) => void }) {
  const navigate = useNavigate()

  function handleClick() {
    if (!n.read) onRead(n.id)
    if (n.resourceType === 'task') navigate('/tarefas')
  }

  return (
    <button
      onClick={handleClick}
      className={`w-full text-left flex items-start gap-4 px-5 py-4 transition-colors hover:bg-s2/50 cursor-pointer group
        ${!n.read ? 'bg-indigo-500/4' : ''}`}
    >
      {/* Ícone */}
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
        ${!n.read ? 'bg-indigo-500/20' : 'bg-s3/50'}`}>
        <ClipboardList size={16} className={!n.read ? 'text-brand' : 'text-slate-500'} />
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`text-sm font-medium ${!n.read ? 'text-slate-100' : 'text-slate-400'}`}>
            {n.title}
          </p>
          {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />}
        </div>
        {n.body && (
          <p className="text-xs text-slate-500 mt-0.5 truncate">
            📋 {n.body}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[11px] text-slate-600">{timeAgo(n.createdAt)}</span>
          <span className="text-slate-700">·</span>
          <span className="text-[11px] text-slate-600">
            {new Date(n.createdAt).toLocaleDateString('pt-BR', {
              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
            })}
          </span>
          {n.resourceType === 'task' && (
            <>
              <span className="text-slate-700">·</span>
              <span className="text-[11px] text-brand group-hover:text-brand-text transition-colors">
                Abrir tarefa →
              </span>
            </>
          )}
        </div>
      </div>
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Filter = 'all' | 'unread'

export function NotificationsPage() {
  const { user }                           = useAuthStore()
  const { notifications, markRead, markAllRead } = useNotificationsStore()
  const [filter, setFilter]                = useState<Filter>('all')

  const unreadCount = notifications.filter(n => !n.read).length

  const filtered = filter === 'unread'
    ? notifications.filter(n => !n.read)
    : notifications

  const groups = groupNotifications(filtered)

  function handleMarkAll() {
    if (user) markAllRead(user.id)
  }

  return (
    <PageLayout
      title="Notificações"
      subtitle={unreadCount > 0
        ? `${unreadCount} não lida${unreadCount !== 1 ? 's' : ''}`
        : 'Tudo em dia'
      }
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6">
        {/* Filtros */}
        <div className="flex gap-1 border border-line rounded-xl p-1 bg-s2/50">
          {([
            { key: 'all',    label: 'Todas' },
            { key: 'unread', label: `Não lidas${unreadCount > 0 ? ` (${unreadCount})` : ''}` },
          ] as const).map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer
                ${filter === f.key
                  ? 'bg-s3/70 text-slate-100'
                  : 'text-slate-500 hover:text-slate-300'
                }`}
            >
              <Filter size={10} />
              {f.label}
            </button>
          ))}
        </div>

        {/* Ação */}
        {unreadCount > 0 && (
          <Button variant="secondary" onClick={handleMarkAll} className="flex items-center gap-2 !text-xs">
            <CheckCheck size={13} /> Marcar tudo como lido
          </Button>
        )}
      </div>

      {/* Lista de grupos */}
      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-16 h-16 rounded-2xl bg-s3/50 flex items-center justify-center">
            <Bell size={28} className="text-slate-600" />
          </div>
          <div className="text-center">
            <p className="text-base font-semibold text-slate-300">
              {filter === 'unread' ? 'Nenhuma notificação não lida' : 'Nenhuma notificação ainda'}
            </p>
            <p className="text-sm text-slate-600 mt-1">
              {filter === 'unread'
                ? 'Você está em dia com tudo! 🎉'
                : 'As notificações de tarefas delegadas aparecem aqui.'
              }
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map(group => (
            <div key={group.label}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1">
                {group.label}
              </p>
              <Card className="!p-0 overflow-hidden">
                {group.items.map((n, i) => (
                  <div key={n.id} className={i < group.items.length - 1 ? 'border-b border-line' : ''}>
                    <NotificationItem n={n} onRead={markRead} />
                  </div>
                ))}
              </Card>
            </div>
          ))}
        </div>
      )}
    </PageLayout>
  )
}
