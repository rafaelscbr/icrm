import { ReactNode, useEffect, useRef } from 'react'
import { X } from 'lucide-react'

interface SidePanelProps {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  /** Largura em desktop. `lg` cabe formulário de duas colunas. */
  size?: 'md' | 'lg' | 'xl'
  footer?: ReactNode
  /** Ações no cabeçalho, à esquerda do X. */
  headerActions?: ReactNode
}

const larguras = {
  md: 'sm:max-w-[34rem]',
  lg: 'sm:max-w-[42rem]',
  xl: 'sm:max-w-[52rem]',
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Painel lateral — o padrão de trabalho do sistema.
 *
 * Um modal centralizado cobre a tela e diz "pare tudo e resolva isto". A maior
 * parte do que se faz aqui não é assim: o corretor mexe num lead sem perder o
 * Kanban de vista, o admin ajusta a régua de um lançamento comparando com a
 * lista atrás. O painel preserva esse contexto — por isso o overlay é leve
 * (25%, não 65%): o que está atrás precisa continuar legível.
 *
 * Em telas pequenas vira tela cheia, onde dividir espaço não faz sentido.
 *
 * O LeadModal já fazia isso, inline. Aqui vira componente para as próximas
 * telas não reinventarem — e para o focus trap e o Escape virem junto de graça,
 * em vez de dependerem de quem copiou o bloco lembrar deles.
 */
export function SidePanel({
  isOpen, onClose, title, subtitle, children,
  size = 'lg', footer, headerActions,
}: SidePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  // Foco entra no painel ao abrir e volta para a origem ao fechar.
  useEffect(() => {
    if (!isOpen) return
    previousFocus.current = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => { previousFocus.current?.focus?.() }
  }, [isOpen])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Tab' || !panelRef.current) return
    const focusables = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
    if (focusables.length === 0) return
    const primeiro = focusables[0]
    const ultimo = focusables[focusables.length - 1]
    const ativo = document.activeElement
    if (e.shiftKey && (ativo === primeiro || ativo === panelRef.current)) {
      e.preventDefault(); ultimo.focus()
    } else if (!e.shiftKey && ativo === ultimo) {
      e.preventDefault(); primeiro.focus()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/25 animate-overlay"
        onClick={onClose}
        aria-hidden
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={`relative w-full ${larguras[size]} h-full modal-surface shadow-modal
          overflow-hidden sm:rounded-l-[20px] border-l border-line flex flex-col
          focus:outline-none
          animate-panel-up sm:animate-panel-right`}
      >
        {/* Cabeçalho fixo */}
        <div
          className="flex-shrink-0 flex items-start justify-between gap-3 px-5 py-4"
          style={{ borderBottom: '1px solid var(--line)' }}
        >
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-base font-bold text-t1 leading-tight tracking-[-0.01em] truncate">
              {title}
            </h2>
            {subtitle && <p className="text-xs text-t3 mt-0.5 truncate">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {headerActions}
            <button
              onClick={onClose}
              aria-label="Fechar painel"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-t3
                         hover:bg-s2 hover:text-t1 transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Corpo rolável — o único que rola */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5">
          {children}
        </div>

        {/* Rodapé fixo: as ações nunca somem no scroll de um formulário longo */}
        {footer && (
          <div
            className="flex-shrink-0 px-5 py-4"
            style={{ borderTop: '1px solid var(--line)', background: 'var(--s2)' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
