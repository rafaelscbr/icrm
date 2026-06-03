import { HTMLAttributes, ReactNode } from 'react'

interface ListContainerProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

/**
 * Container padrão para listas e tabelas do sistema.
 * Usa `.list-surface` — dark: surface-2 (#191F30), light: surface (#FFF).
 * Alterar `.list-surface` no CSS reflete aqui e em todas as telas.
 */
export function ListContainer({ children, className = '', ...props }: ListContainerProps) {
  return (
    <div
      className={`list-surface border border-line rounded-xl overflow-hidden ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
