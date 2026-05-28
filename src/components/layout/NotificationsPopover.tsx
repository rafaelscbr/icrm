import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, ClipboardList, ArrowRight, X } from 'lucide-react'
import { useNotificationsStore } from '../../store/useNotificationsStore'
import { useAuthStore } from '../../store/useAuthStore'
import { AppNotification } from '../../types'

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins  <  1) return 'agora mesmo'
  if (mins  < 60) return `${mins}min atrás`
  if (hours < 24) return `${hours}h atrás`
  if (days  <  7) return `${days}d atrás`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

interface Props {
  isOpen:  boolean
  onClose: () => void
  anchorEl: HTMLElement | null
}

export function NotificationsPopover({ isOpen, onClose, anchorEl }: Props) {
  const navigate   = useNavigate()
  const { user }   = useAuthStore()
  const { notifications, markRead, markAllRead } = useNotificationsStore()
  const popoverRef = useRef<HTMLDivElement>(null)

  const recent     = notifications.slice(0, 3)
  const unreadAll  = notifications.filter(n => !n.read).length

  // Fecha ao clicar fora
  useEffect(() => {
    if (!isOpen) return
    function handler(e: MouseEvent) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        anchorEl && !anchorEl.contains(e.target as Node)
      ) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen, onClose, anchorEl])

  // Calcula posição baseado no anchorEl
  let style: React.CSSProperties = { display: 'none' }
  if (isOpen && anchorEl) {
    const rect   = anchorEl.getBoundingClientRect()
    style = {
      position: 'fixed',
      left:     rect.right + 10,
      bottom:   window.innerHeight - rect.bottom,
      width:    320,
      zIndex:   9999,
    }
  }

  function handleClick(n: AppNotification) {
    markRead(n.id)
    if (n.resourceType === 'task') {
      navigate('/tarefas')
    }
    onClose()
  }

  function handleMarkAll() {
    if (user) markAllRead(user.id)
  }

  if (!isOpen) return null

  return (
    <div
      ref={popoverRef}
      style={style}
      className="bg-s2 border border-line rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-left-2 duration-150"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-line">
        <div className="flex items-center gap-2">
          <Bell size={14} className="text-brand" />
          <span className="text-sm font-semibold text-slate-100">Notificações</span>
          {unreadAll > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-brand text-white text-[10px] font-bold leading-none">
              {unreadAll}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadAll > 0 && (
            <button
              onClick={handleMarkAll}
              title="Marcar tudo como lido"
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-slate-500 hover:text-brand hover:bg-indigo-500/10 transition-colors cursor-pointer"
            >
              <CheckCheck size={11} /> Limpar
            </button>
          )}
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-300 hover:bg-s3/50 transition-colors cursor-pointer"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto max-h-80">
        {recent.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <div className="w-12 h-12 rounded-full bg-s3/50 flex items-center justify-center">
              <Bell size={20} className="text-slate-600" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-400">Tudo em dia!</p>
              <p className="text-xs text-slate-600 mt-0.5">Nenhuma notificação por enquanto</p>
            </div>
          </div>
        ) : (
          recent.map((n, i) => (
            <button
              key={n.id}
              onClick={() => handleClick(n)}
              className={`w-full text-left flex items-start gap-3 px-4 py-3 transition-colors cursor-pointer hover:bg-s3/50
                ${i < recent.length - 1 ? 'border-b border-line' : ''}
                ${!n.read ? 'bg-indigo-500/4' : ''}
              `}
            >
              {/* Ícone */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5
                ${!n.read ? 'bg-indigo-500/20' : 'bg-s3/50'}`}>
                <ClipboardList size={14} className={!n.read ? 'text-brand' : 'text-slate-500'} />
              </div>

              {/* Conteúdo */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-xs font-medium leading-tight ${!n.read ? 'text-slate-100' : 'text-slate-400'}`}>
                    {n.title}
                  </p>
                  {!n.read && (
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0 mt-1" />
                  )}
                </div>
                {n.body && (
                  <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                    📋 {n.body}
                  </p>
                )}
                <p className="text-[10px] text-slate-600 mt-1">{timeAgo(n.createdAt)}</p>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Footer — Ver histórico */}
      <div className="border-t border-line px-4 py-2.5">
        <button
          onClick={() => { navigate('/notificacoes'); onClose() }}
          className="w-full flex items-center justify-center gap-2 text-xs text-slate-500 hover:text-brand transition-colors cursor-pointer py-1 rounded-lg hover:bg-indigo-500/8"
        >
          Ver histórico completo
          <ArrowRight size={11} />
        </button>
      </div>
    </div>
  )
}
