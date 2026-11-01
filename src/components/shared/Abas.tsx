import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/**
 * Barra de abas com o teclado que o papel `tab` promete.
 *
 * O sistema tinha dois problemas opostos, ambos ruins:
 *
 * - Telas que **declaravam** `role="tablist"` / `role="tab"` sem entregar nada:
 *   sem roving tabindex (as seis abas entravam na ordem de Tab, uma a uma) e
 *   sem setas. Papel anunciado e comportamento ausente é pior que papel nenhum,
 *   porque cria expectativa.
 * - Telas que eram só `<button>` sem papel algum: funcionavam no Tab, mas nada
 *   dizia que aquilo era um conjunto de abas nem qual estava ativa.
 *
 * Aqui a regra do padrão ARIA fica em um lugar só: **uma** parada de Tab para o
 * conjunto inteiro (só a aba ativa é tabulável), setas circulam, Home e End vão
 * às pontas. Trocar de aba move o foco junto — senão a seta muda o conteúdo e
 * deixa o foco para trás.
 *
 * Não usa Radix Tabs de propósito: as telas já controlam o conteúdo com
 * `tab === 'x' && ...`, e o Tabs do Radix exigiria envolver cada painel em
 * `Tabs.Content`, reescrevendo a composição de seis telas para ganhar o mesmo
 * teclado que cabe aqui.
 */

/**
 * O teclado das abas, sem opinião sobre aparência.
 *
 * Para as barras que têm layout próprio (rótulo em duas linhas, pílula com
 * borda) e não cabem no `Abas` abaixo sem virar um componente de mil variantes.
 * Devolve as props que cada `<button role="tab">` precisa.
 */
export function useRovingTabs<T extends string>(
  valores: T[],
  valor: T,
  onChange: (v: T) => void,
) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  return function propsDaAba(i: number) {
    const ativo = valores[i] === valor
    return {
      role: 'tab' as const,
      'aria-selected': ativo,
      // roving tabindex: o conjunto é UMA parada de Tab
      tabIndex: ativo ? 0 : -1,
      ref: (el: HTMLButtonElement | null) => { refs.current[i] = el },
      onKeyDown: (e: React.KeyboardEvent) => {
        const ultimo = valores.length - 1
        let destino = -1
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') destino = i === ultimo ? 0 : i + 1
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') destino = i === 0 ? ultimo : i - 1
        else if (e.key === 'Home') destino = 0
        else if (e.key === 'End') destino = ultimo
        if (destino < 0) return
        e.preventDefault()
        onChange(valores[destino])
        refs.current[destino]?.focus()
      },
    }
  }
}

export interface Aba<T extends string> {
  value: T
  label: string
  icon?: LucideIcon
  /** número ao lado do rótulo; omita quando a leitura falhou */
  badge?: number
}

interface Props<T extends string> {
  abas: Aba<T>[]
  valor: T
  onChange: (v: T) => void
  /** o que a barra de abas representa, para leitor de tela */
  rotulo: string
  /** aparência: pílula sobre fundo, ou sublinhado */
  variante?: 'pilula' | 'sublinhado'
  className?: string
  /** conteúdo extra à direita da barra */
  fim?: ReactNode
}

export function Abas<T extends string>({
  abas, valor, onChange, rotulo, variante = 'pilula', className = '', fim,
}: Props<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const lista = useRef<HTMLDivElement>(null)
  // Posição do indicador deslizante. Medida do botão ativo; o ResizeObserver
  // reposiciona quando a fonte carrega, o badge muda ou a tela redimensiona.
  const [ind, setInd] = useState<{ x: number; w: number } | null>(null)
  const ativoIdx = abas.findIndex(a => a.value === valor)
  useLayoutEffect(() => {
    const medir = () => {
      const b = refs.current[ativoIdx]
      if (b) setInd({ x: b.offsetLeft, w: b.offsetWidth })
    }
    medir()
    const ro = new ResizeObserver(medir)
    if (lista.current) ro.observe(lista.current)
    return () => ro.disconnect()
  }, [ativoIdx, abas.length])

  function aoTeclar(e: React.KeyboardEvent, i: number) {
    const ultimo = abas.length - 1
    let destino = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') destino = i === ultimo ? 0 : i + 1
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') destino = i === 0 ? ultimo : i - 1
    else if (e.key === 'Home') destino = 0
    else if (e.key === 'End') destino = ultimo
    if (destino < 0) return

    e.preventDefault()
    onChange(abas[destino].value)
    // o foco acompanha a seleção — sem isso a seta troca o conteúdo e o foco
    // fica na aba antiga
    refs.current[destino]?.focus()
  }

  const pilula = variante === 'pilula'

  return (
    <div className={`flex items-center ${pilula ? 'gap-2' : 'gap-0'} ${className}`}>
      <div
        ref={lista}
        role="tablist"
        aria-label={rotulo}
        className={pilula
          ? 'relative flex items-center gap-1 bg-s2/70 border border-line rounded-[14px] p-1 w-fit'
          : 'relative flex gap-0 border-b border-line flex-1 overflow-x-auto'}
      >
        {/* Indicador deslizante — só transform e largura de UM elemento, e a
            regra global de reduced-motion zera a transição. */}
        {ind && (
          <span
            aria-hidden
            className={pilula
              ? 'absolute top-1 bottom-1 left-0 rounded-[10px] bg-surface border border-line shadow-card'
              : 'absolute bottom-0 left-0 h-[2.5px] rounded-full bg-[var(--aba-cor,var(--brand-fill))]'}
            style={{
              width: ind.w,
              transform: `translateX(${ind.x}px)`,
              transition: 'transform 320ms var(--ease-out), width 320ms var(--ease-out)',
            }}
          />
        )}
        {abas.map((a, i) => {
          const ativo = valor === a.value
          return (
            <button
              key={a.value}
              ref={el => { refs.current[i] = el }}
              role="tab"
              id={`aba-${rotulo}-${a.value}`}
              aria-selected={ativo}
              // roving tabindex: o conjunto é UMA parada de Tab
              tabIndex={ativo ? 0 : -1}
              onClick={() => onChange(a.value)}
              onKeyDown={e => aoTeclar(e, i)}
              className={pilula
                ? `relative z-[1] flex items-center gap-2 px-4 py-2 rounded-[10px] text-[13px] font-semibold
                   transition-colors duration-200 cursor-pointer min-h-[40px] whitespace-nowrap
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40
                   ${ativo ? 'text-t1' : 'text-t3 hover:text-t1'}`
                : `relative z-[1] flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold
                   transition-colors duration-200 cursor-pointer min-h-[40px] whitespace-nowrap
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40
                   ${ativo ? 'text-t1' : 'text-t3 hover:text-t2'}`}
            >
              {a.icon && <a.icon size={pilula ? 13 : 12} strokeWidth={1.7} aria-hidden />}
              {a.label}
              {a.badge !== undefined && (
                <span className={`ml-0.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full tabular-nums
                  ${ativo ? 'bg-brand-tint text-brand-text' : 'bg-s3/60 text-t3'}`}>
                  {a.badge.toLocaleString('pt-BR')}
                </span>
              )}
            </button>
          )
        })}
      </div>
      {fim}
    </div>
  )
}
