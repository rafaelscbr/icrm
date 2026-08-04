import { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { IconeTom } from '../shared/visual'
import type { Tom } from '../shared/visual'

interface PageLayoutProps {
  title: string
  subtitle?: string
  /** Ícone da tela — dá identidade ao cabeçalho e ajuda a saber onde se está. */
  icon?: LucideIcon
  /** Tom do ícone. Cada área do sistema tem o seu, o que cria memória de lugar. */
  iconTom?: Tom
  ctaLabel?: string
  onCta?: () => void
  actions?: ReactNode
  /** Faixa colada ao cabeçalho — indicadores, filtros ou abas da tela. */
  band?: ReactNode
  children: ReactNode
}

/**
 * Quadro comum de todas as telas.
 *
 * O cabeçalho é a única coisa que aparece em 100% das páginas, então é onde a
 * hierarquia rende mais: ícone com tom próprio da área, título em Sora,
 * subtítulo dizendo o que a tela faz e a ação primária no degradê da marca.
 *
 * `band` existe para as telas que precisam de indicadores ou abas grudados no
 * cabeçalho — antes cada uma resolvia isso do seu jeito, com espaçamento
 * diferente. Fica dentro da faixa fixa, então continua visível na rolagem.
 */
export function PageLayout({
  title, subtitle, icon, iconTom = 'marca',
  ctaLabel, onCta, actions, band, children,
}: PageLayoutProps) {
  return (
    <div className="flex-1 min-h-screen bg-page texture-grain aurora-host">
      {/*
        Brilho dourado que respira no fundo do sistema. Fica aqui, no layout
        compartilhado, para valer em todas as páginas sem cada tela precisar
        saber que existe. `aurora-host` empurra o conteúdo para z-index 1.
      */}
      <div className="aurora" aria-hidden />

      {/* ── Cabeçalho fixo ──────────────────────────────────────── */}
      <div
        className="sticky top-0 z-10 nav-bg-blur pt-safe"
        style={{ borderBottom: '1px solid var(--line)' }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {icon && <IconeTom icon={icon} tom={iconTom} />}
            <div className="min-w-0">
              <h1 className="font-heading text-[19px] font-bold text-t1 leading-tight
                             tracking-[-0.015em] truncate">
                {title}
              </h1>
              {subtitle && (
                <p className="text-[13px] text-t3 mt-0.5 truncate">{subtitle}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {actions}
            {ctaLabel && onCta && (
              <button
                onClick={onCta}
                className="inline-flex items-center justify-center gap-2 rounded-lg grad-brand
                           px-4 py-2 min-h-[40px] font-heading text-[13px] font-bold
                           transition-transform active:scale-[0.98] cursor-pointer
                           focus:outline-none focus:ring-2 focus:ring-brand/40"
              >
                <Plus size={15} strokeWidth={2.4} aria-hidden />
                <span className="hidden sm:inline">{ctaLabel}</span>
                <span className="sm:hidden">Novo</span>
              </button>
            )}
          </div>
        </div>

        {band && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-3">{band}</div>
        )}
      </div>

      {/* ── Conteúdo ────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        {children}
      </div>
    </div>
  )
}
