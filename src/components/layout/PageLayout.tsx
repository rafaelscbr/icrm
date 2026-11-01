import { ReactNode } from 'react'
import { Plus, Search } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { IconeTom } from '../shared/visual'
import type { Tom } from '../shared/visual'
import { useSearchStore } from '../../store/useSearchStore'

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
  /** `total` libera o conteúdo da largura máxima — só para quadros que rolam
      na horizontal, como o Kanban. O cabeçalho continua igual ao das outras
      telas: é ele que dá a sensação de "mesmo lugar". */
  largura?: 'padrao' | 'total'
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
  ctaLabel, onCta, actions, band, largura = 'padrao', children,
}: PageLayoutProps) {
  const caixa = largura === 'total' ? 'max-w-none' : 'max-w-7xl'
  const abrirBusca = useSearchStore(s => s.setOpen)
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  return (
    <div className="flex-1 min-h-full bg-page texture-grain aurora-host">
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 lg:py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {icon && <IconeTom icon={icon} tom={iconTom} tamanho="lg" />}
            <div className="min-w-0">
              <h1 className="font-heading text-[19px] lg:text-[22px] font-bold text-t1 leading-tight
                             tracking-[-0.025em] truncate">
                {title}
              </h1>
              {subtitle && (
                <p className="text-[13px] text-t3 mt-0.5 truncate">{subtitle}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/*
              Busca e comandos sempre à vista no desktop. O ⌘K já existia, mas
              atalho que não aparece na tela não se descobre — a pílula ensina
              o atalho e serve de alvo para quem prefere o mouse.
            */}
            <button
              type="button"
              onClick={() => abrirBusca(true)}
              className="hidden xl:inline-flex items-center gap-2.5 h-10 w-[240px] rounded-[12px] border border-line
                         bg-surface/70 px-3 text-[13px] text-t4 hover:text-t2 hover:border-line-strong
                         transition-colors cursor-pointer"
            >
              <Search size={15} strokeWidth={1.8} aria-hidden />
              <span className="flex-1 text-left">Buscar ou ir para…</span>
              <kbd className="font-label text-[11px] font-semibold text-t4 border border-line rounded-md px-1.5 py-0.5 bg-s2">
                {mac ? '⌘' : 'Ctrl'} K
              </kbd>
            </button>
            {actions}
            {ctaLabel && onCta && (
              <button
                onClick={onCta}
                className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-brand-fill text-brand-fill-text
                           hover:bg-brand-fill-hover px-4 py-2 min-h-[40px] font-heading text-[13.5px] font-bold
                           shadow-[0_8px_22px_-10px_var(--brand-shadow)]
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

        {band && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-3">{band}</div>
        )}
      </div>

      {/* ── Conteúdo ────────────────────────────────────────────── */}
      <div className={`${caixa} mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8`}>
        {children}
      </div>
    </div>
  )
}
