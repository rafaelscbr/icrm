import { ReactNode, useEffect, useRef } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  footer?: ReactNode
}

const desktopSizes = {
  sm: 'lg:max-w-md',
  md: 'lg:max-w-lg',
  lg: 'lg:max-w-2xl',
  xl: 'lg:max-w-4xl',
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Modal({ isOpen, onClose, title, subtitle, children, size = 'md', footer }: ModalProps) {
  const mouseDownTarget = useRef<EventTarget | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (isOpen) {
      document.addEventListener('keydown', handler)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  // Acessibilidade: foco entra no modal ao abrir e volta ao elemento de origem ao fechar
  useEffect(() => {
    if (!isOpen) return
    previousFocus.current = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => { previousFocus.current?.focus?.() }
  }, [isOpen])

  // Tab fica preso dentro do modal (focus trap)
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Tab' || !panelRef.current) return
    const focusables = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === panelRef.current)) {
      e.preventDefault(); last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault(); first.focus()
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end lg:items-center justify-center lg:p-4"
      onMouseDown={e => { mouseDownTarget.current = e.target }}
      onClick={e => {
        if (e.target === e.currentTarget && mouseDownTarget.current === e.currentTarget) onClose()
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={`
          relative w-full ${desktopSizes[size]}
          bg-surface border border-line
          rounded-t-[18px] lg:rounded-[18px]
          shadow-modal
          max-h-[92vh] flex flex-col
          animate-in
        `}
      >
        {/* Mobile handle */}
        <div className="flex justify-center pt-3 pb-1 lg:hidden">
          <div className="w-10 h-1 bg-line-strong rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 lg:px-6 py-4 border-b border-line flex-shrink-0">
          <div className="min-w-0 pr-4">
            <h2 className="text-base font-semibold text-t1 leading-tight">{title}</h2>
            {subtitle && <p className="text-xs text-t3 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="w-8 h-8 flex items-center justify-center rounded-[10px] hover:bg-s2 text-t3 hover:text-t1 transition-colors cursor-pointer flex-shrink-0"
          >
            <X size={16} strokeWidth={1.6} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 lg:px-6 py-5 lg:py-6 overflow-y-auto flex-1">
          {children}
        </div>

        {/* Optional footer */}
        {footer && (
          <div className="px-5 lg:px-6 py-4 border-t border-line flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
