import { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Plus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Tom } from '../shared/visual'
import { navSections, isGroup } from './nav/navConfig'

interface PageLayoutProps {
  title: string
  subtitle?: string
  /** Mantido por compatibilidade: o topo v10 não mostra mais ícone. */
  icon?: LucideIcon
  /** Mantido por compatibilidade. */
  iconTom?: Tom
  ctaLabel?: string
  onCta?: () => void
  actions?: ReactNode
  /** Abas da tela — no desktop ficam na mesma linha do título. */
  band?: ReactNode
  /** `total` libera o conteúdo da largura máxima — só para quadros que rolam
      na horizontal, como o Kanban. */
  largura?: 'padrao' | 'total'
  children: ReactNode
}

/** Cor de cada área (ver --area-* no index.css). */
function corDaArea(secao: string | null): string {
  if (!secao) return 'var(--area-conta)'
  if (secao.includes('Produtos'))  return 'var(--area-produtos)'
  if (secao.includes('Prospecção')) return 'var(--area-prospeccao)'
  if (secao.startsWith('Operação')) return 'var(--area-operacao)'
  if (secao.startsWith('Comercial')) return 'var(--area-comercial)'
  if (secao.startsWith('Inteligência')) return 'var(--area-inteligencia)'
  return 'var(--area-conta)'
}

/** Seção do menu onde a tela mora ("Comercial", "Operação"…). */
function secaoDa(pathname: string): string | null {
  let melhor: string | null = null
  let tamanho = -1
  for (const s of navSections) {
    for (const item of s.items) {
      const folhas = isGroup(item) ? item.children : [item]
      for (const f of folhas) {
        const casa = f.to === '/' ? pathname === '/' : pathname === f.to || pathname.startsWith(f.to + '/')
        if (casa && f.to.length > tamanho) {
          melhor = isGroup(item) ? `${s.label} · ${item.label}` : s.label
          tamanho = f.to.length
        }
      }
    }
  }
  if (!melhor && (pathname.startsWith('/notificacoes') || pathname.startsWith('/admin'))) return 'Conta'
  return melhor
}

/**
 * Quadro comum de todas as telas — v10 (01/11/2026).
 *
 * O topo é UMA linha: título, abas e ação principal. A v7 empilhava seção,
 * título grande, subtítulo e abas — ~200px antes do conteúdo, e no Kanban de
 * Leads o primeiro card só aparecia na metade da tela. O Rafael pediu
 * minimalismo; o topo agora ocupa 56px e gruda sob a barra azul.
 *
 * O subtítulo vira texto pequeno ao lado do título; quando há abas, ele some no
 * desktop (as abas ocupam o espaço) e fica como dica no título.
 */
export function PageLayout({
  title, subtitle, icon: _icon, iconTom: _iconTom,
  ctaLabel, onCta, actions, band, largura = 'padrao', children,
}: PageLayoutProps) {
  const caixa = largura === 'total' ? 'max-w-none' : 'max-w-7xl'
  // A cor da área continua no indicador das abas e no hover das tabelas.
  const area = corDaArea(secaoDa(useLocation().pathname))

  return (
    <div className="flex-1 min-h-full bg-page aurora-host" style={{ ['--area' as string]: area, ['--aba-cor' as string]: area }}>
      <header className="page-bar sticky top-0 z-10 pt-safe">
        <div className={`${caixa} mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-5`}>
          <div className="flex items-baseline gap-2.5 min-w-0 shrink-0 max-w-[60%] lg:max-w-none" title={subtitle}>
            <h1 className="font-display text-[18px] lg:text-[19px] font-bold text-t1 leading-none tracking-[-0.02em] truncate">
              {title}
            </h1>
            {subtitle && (
              <span className={`text-[13px] text-t4 truncate ${band ? 'hidden sm:inline lg:hidden' : 'hidden sm:inline'}`}>
                {subtitle}
              </span>
            )}
          </div>

          {band && (
            <div className="hidden lg:flex self-stretch min-w-0 overflow-x-auto rolagem-limpa page-bar-abas">{band}</div>
          )}

          <div className="ml-auto flex items-center gap-2 flex-shrink-0">
            {actions}
            {ctaLabel && onCta && (
              <button
                onClick={onCta}
                className="inline-flex items-center justify-center gap-1.5 rounded-[10px] bg-brand-fill text-brand-fill-text
                           hover:bg-brand-fill-hover px-3.5 h-9 text-[13.5px] font-semibold
                           transition-[background-color,transform] active:scale-[0.98] cursor-pointer
                           focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                <Plus size={15} strokeWidth={2.4} aria-hidden />
                <span className="hidden sm:inline">{ctaLabel}</span>
                <span className="sm:hidden">Novo</span>
              </button>
            )}
          </div>
        </div>

        {/* Celular e tablet: as abas descem para uma faixa rolável. */}
        {band && (
          <div className={`lg:hidden ${caixa} mx-auto px-4 sm:px-6 overflow-x-auto rolagem-limpa page-bar-abas`}>{band}</div>
        )}
      </header>

      <div className={`${caixa} mx-auto px-4 sm:px-6 lg:px-8 py-5 lg:py-6`}>
        {children}
      </div>
    </div>
  )
}
