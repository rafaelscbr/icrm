import { useRef, useState, useEffect, useCallback, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Rótulo flutuante do trilho recolhido.
 *
 * Substitui o `title=""` nativo, que tinha dois problemas de uso real: demora
 * ~1s para aparecer e some sozinho depois de alguns segundos. Num trilho de
 * 68px onde o rótulo é a ÚNICA forma de saber o que o ícone faz, esperar um
 * segundo por item é o que faz o corretor desistir e expandir a barra.
 *
 * É rótulo, não menu: nada aqui recebe clique. O conteúdo do trilho recolhido
 * é sempre alcançável direto no ícone, um clique e um Tab por destino.
 *
 * Renderiza em portal no <body>: o `<nav>` tem `overflow-y: auto`, então um
 * painel posicionado dentro dele seria cortado na horizontal.
 */
export function RailPopout({ label, children }: { label: string; children: ReactNode }) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  const abrir = useCallback(() => {
    clearTimeout(timer.current)
    const r = anchorRef.current?.getBoundingClientRect()
    if (r) setPos({ left: r.right + 10, top: r.top })
  }, [])

  const fechar = useCallback(() => {
    clearTimeout(timer.current)
    setPos(null)
  }, [])

  // O trilho rola: sem isto o painel fica pendurado na posição antiga.
  useEffect(() => {
    if (!pos) return
    const off = () => setPos(null)
    window.addEventListener('scroll', off, true)
    window.addEventListener('resize', off)
    return () => {
      window.removeEventListener('scroll', off, true)
      window.removeEventListener('resize', off)
    }
  }, [pos])

  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- invólucro de medida: quem recebe clique e foco é o link dentro dele; aqui o mouse só liga/desliga um rótulo decorativo (aria-hidden)
    <div
      ref={anchorRef}
      className="relative"
      onMouseEnter={abrir}
      onMouseLeave={fechar}
      onFocusCapture={abrir}
      onBlurCapture={fechar}
    >
      {children}

      {pos && createPortal(
        <div
          style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 130 }}
          className="animate-in fade-in slide-in-from-left-1 pointer-events-none duration-100"
          // O rótulo já é anunciado pelo .sr-only do próprio item; aqui seria eco.
          aria-hidden="true"
        >
          <span
            className="nav-elev block whitespace-nowrap rounded-lg px-2.5 py-1.5
                       text-[12.5px] font-medium leading-none"
            style={{ color: 'var(--nav-active-text)', marginTop: 9 }}
          >
            {label}
          </span>
        </div>,
        document.body,
      )}
    </div>
  )
}
