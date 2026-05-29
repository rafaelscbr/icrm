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

export function Modal({ isOpen, onClose, title, subtitle, children, size = 'md', footer }: ModalProps) {
  const mouseDownTarget = useRef<EventTarget | null>(null)

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
        className={`
          relative w-full ${desktopSizes[size]}
          bg-surface border border-line
          rounded-t-2xl lg:rounded-xl
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
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-s2 text-t3 hover:text-t1 transition-colors cursor-pointer flex-shrink-0"
          >
            <X size={16} />
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
