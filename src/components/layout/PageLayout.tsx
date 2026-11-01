import { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Plus, Search, Bell } from 'lucide-react'
import { useSearchStore } from '../../store/useSearchStore'
import { useUnreadCount } from '../../store/useNotificationsStore'
import type { LucideIcon } from 'lucide-react'
import type { Tom } from '../shared/visual'
import { navSections, isGroup } from './nav/navConfig'
import { destacar, semMarcador } from '../shared/Destaque'

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
  const abrirBusca = useSearchStore(st => st.setOpen)
  const naoLidas = useUnreadCount()

  return (
    <div className="flex-1 min-h-full bg-page aurora-host" style={{ ['--area' as string]: area, ['--aba-cor' as string]: area }}>
      <header className="page-bar sticky top-0 z-10 pt-safe">
        <div className={`${caixa} mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-5`}>
          <div className="flex items-baseline gap-2.5 min-w-0 flex-1 lg:flex-none lg:shrink-0" title={subtitle}>
            <h1 className="font-display text-[18px] lg:text-[19px] font-bold text-t1 leading-none tracking-[-0.02em] truncate"
                aria-label={semMarcador(title)}>
              {destacar(title)}
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
            {/* Celular: busca e avisos no topo, onde o olho procura primeiro.
                No desktop eles moram na barra azul. */}
            <div className="lg:hidden flex items-center -mr-1">
              <button type="button" onClick={() => abrirBusca(true)} className="folha-icone" aria-label="Buscar">
                <Search size={20} strokeWidth={1.9} aria-hidden />
              </button>
              <Link to="/notificacoes" className="folha-icone relative"
                aria-label={naoLidas > 0 ? `Avisos — ${naoLidas} não lido${naoLidas !== 1 ? 's' : ''}` : 'Avisos'}>
                <Bell size={20} strokeWidth={1.9} aria-hidden />
                {naoLidas > 0 && (
                  <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-brand-fill text-brand-fill-text text-[10.5px] font-bold flex items-center justify-center tabular-nums" aria-hidden>
                    {naoLidas > 9 ? '9+' : naoLidas}
                  </span>
                )}
              </Link>
            </div>
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
