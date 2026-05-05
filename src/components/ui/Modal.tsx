import { ReactNode, useEffect, useRef } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

const desktopSizes = {
  sm: 'lg:max-w-md',
  md: 'lg:max-w-lg',
  lg: 'lg:max-w-2xl',
}

export function Modal({ isOpen, onClose, title, children, size = 'md' }: ModalProps) {
  // Rastreia onde o mousedown começou para não fechar ao soltar o mouse
  // fora do modal após selecionar texto dentro de um input
  const mouseDownTarget = useRef<EventTarget | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
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
      onMouseDown={(e) => { mouseDownTarget.current = e.target }}
      onClick={(e) => {
        // Só fecha se o mousedown E o mouseup aconteceram no backdrop
        if (e.target === e.currentTarget && mouseDownTarget.current === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className={`
          relative w-full ${desktopSizes[size]}
          bg-[#13151f]/95 backdrop-blur-xl border border-white/12
          rounded-t-2xl lg:rounded-2xl
          shadow-2xl shadow-black/60
          max-h-[92vh] overflow-y-auto
          animate-in fade-in slide-in-from-bottom-4 lg:zoom-in-95 duration-200
        `}
      >
        {/* Handle — mobile only */}
        <div className="flex justify-center pt-3 pb-1 lg:hidden">
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-5 lg:px-6 py-3.5 lg:py-4 border-b border-white/8">
          <h2 className="text-base font-semibold text-slate-100">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/8 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-5 lg:px-6 py-5 lg:py-6">{children}</div>
      </div>
    </div>
  )
}
