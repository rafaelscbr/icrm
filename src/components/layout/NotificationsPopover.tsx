import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, ClipboardList, UserPlus, RefreshCw, ArrowRight, X } from 'lucide-react'
import { useNotificationsStore } from '../../store/useNotificationsStore'
import { useAuthStore } from '../../store/useAuthStore'
import { AppNotification } from '../../types'

function timeAgo(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins  <  1) return 'agora mesmo'
  if (mins  < 60) return `${mins}min atrás`
  if (hours < 24) return `${hours}h atrás`
  if (days  <  7) return `${days}d atrás`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

const PANEL_WIDTH = 340
const MAX_ITEMS   = 6

interface Props {
  isOpen:  boolean
  onClose: () => void
  anchorEl: HTMLElement | null
}

/**
 * Painel de notificações ancorado ao item da sidebar.
 * Renderizado via portal no <body> — escapa dos stacking contexts dos
 * headers das páginas (sticky + backdrop-blur), que antes o cobriam.
 */
export function NotificationsPopover({ isOpen, onClose, anchorEl }: Props) {
  const navigate   = useNavigate()
  const { user }   = useAuthStore()
  const { notifications, markRead, markAllRead } = useNotificationsStore()
  const panelRef = useRef<HTMLDivElement>(null)

  const recent    = notifications.slice(0, MAX_ITEMS)
  const unreadAll = notifications.filter(n => !n.read).length

  // Foco entra no painel ao abrir e retorna ao gatilho ao fechar
  useEffect(() => {
    if (!isOpen) return
    const previous = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => previous?.focus?.()
  }, [isOpen])

  // Escape fecha (listener global — o foco pode estar em qualquer item)
  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen || !anchorEl) return null

  // Ancora à direita do item da sidebar, alinhado pela base; nunca sai da viewport
  const rect   = anchorEl.getBoundingClientRect()
  const left   = Math.min(rect.right + 12, window.innerWidth - PANEL_WIDTH - 12)
  const bottom = Math.max(12, window.innerHeight - rect.bottom)

  function notifIcon(n: AppNotification) {
    const cls = !n.read ? 'text-brand' : 'text-t4'
    if (n.type === 'lead_assigned')   return <UserPlus      size={14} strokeWidth={1.6} className={cls} />
    if (n.type === 'lead_recaptured') return <RefreshCw     size={14} strokeWidth={1.6} className={cls} />
    return <ClipboardList size={14} strokeWidth={1.6} className={cls} />
  }

  function handleClick(n: AppNotification) {
    markRead(n.id)
    if (n.resourceType === 'task') navigate('/tarefas')
    if (n.resourceType === 'lead') navigate('/leads')
    onClose()
  }

  return createPortal(
    <div className="fixed inset-0 z-[120]" role="presentation">
      {/* Camada transparente: clique fora fecha */}
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

      <div
        ref={panelRef}
        role="dialog"
        aria-label={unreadAll > 0 ? `Notificações — ${unreadAll} não lidas` : 'Notificações'}
        tabIndex={-1}
        style={{ position: 'absolute', left, bottom, width: PANEL_WIDTH }}
        className="modal-surface border border-line rounded-[18px] shadow-modal overflow-hidden flex flex-col animate-in fade-in slide-in-from-left-2 duration-150 focus:outline-none"
      >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-line flex-shrink-0">
          <div className="flex items-center gap-2">
            <Bell size={14} strokeWidth={1.6} className="text-brand" />
            <span className="font-heading text-sm font-bold text-t1">Notificações</span>
            {unreadAll > 0 && (
              <span className="font-label text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand text-[#0F1730] leading-none tabular-nums">
                {unreadAll}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadAll > 0 && (
              <button
                onClick={() => user && markAllRead(user.id)}
                title="Marcar todas como lidas"
                className="flex items-center gap-1 px-2 py-1 rounded-[10px] font-label text-[10px] uppercase tracking-[0.06em] text-t3 hover:text-brand-text hover:bg-brand-tint transition-all duration-150"
              >
                <CheckCheck size={11} strokeWidth={1.6} /> Lidas
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Fechar notificações"
              className="w-6 h-6 flex items-center justify-center rounded-[10px] text-t4 hover:text-t1 hover:bg-s3 transition-all duration-150"
            >
              <X size={12} strokeWidth={1.6} />
            </button>
          </div>
        </div>

        {/* ── Lista ─────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto max-h-[55vh]" role="list" aria-label="Notificações recentes">
          {recent.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-12 h-12 rounded-[14px] bg-s2 border border-line flex items-center justify-center">
                <Bell size={18} strokeWidth={1.6} className="text-t4" />
              </div>
              <div className="text-center">
                <p className="font-heading text-sm font-bold text-t2">Tudo em dia</p>
                <p className="text-xs text-t4 mt-0.5">Nenhuma notificação por enquanto</p>
              </div>
            </div>
          ) : (
            recent.map((n, i) => (
              <button
                key={n.id}
                role="listitem"
                onClick={() => handleClick(n)}
                className={`w-full text-left flex items-start gap-3 px-4 py-3 transition-colors duration-150 cursor-pointer hover:bg-s2
                  ${i < recent.length - 1 ? 'border-b border-line' : ''}
                  ${!n.read ? 'bg-brand-tint/40' : ''}
                `}
              >
                <span className={`w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0 mt-0.5 border
                  ${!n.read ? 'bg-brand-tint border-brand/25' : 'bg-s2 border-line'}`}>
                  {notifIcon(n)}
                </span>

                <span className="flex-1 min-w-0">
                  <span className="flex items-start justify-between gap-2">
                    <span className={`block text-xs font-medium leading-snug ${!n.read ? 'text-t1' : 'text-t3'}`}>
                      {n.title}
                    </span>
                    {!n.read && (
                      <span className="w-1.5 h-1.5 rounded-full bg-brand flex-shrink-0 mt-1" aria-label="Não lida" />
                    )}
                  </span>
                  {n.body && (
                    <span className="block text-[11px] text-t3 mt-0.5 truncate">{n.body}</span>
                  )}
                  <span className="flex items-center gap-1.5 mt-1">
                    <span className="font-label text-[10px] text-t4 tabular-nums">{timeAgo(n.createdAt)}</span>
                    {n.resourceType === 'lead' && (
                      <span className="font-label text-[10px] text-brand-text">· Abrir lead</span>
                    )}
                    {n.resourceType === 'task' && (
                      <span className="font-label text-[10px] text-brand-text">· Abrir tarefa</span>
                    )}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <div className="border-t border-line px-3 py-2 flex-shrink-0">
          <button
            onClick={() => { navigate('/notificacoes'); onClose() }}
            className="w-full flex items-center justify-center gap-1.5 font-label text-[11px] uppercase tracking-[0.08em] text-t3 hover:text-brand-text py-1.5 rounded-[10px] hover:bg-brand-tint transition-all duration-150"
          >
            Ver todas{notifications.length > MAX_ITEMS ? ` (${notifications.length})` : ''}
            <ArrowRight size={11} strokeWidth={1.6} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
