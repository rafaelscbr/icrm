import { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Plus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Tom } from '../shared/visual'
import { navSections, isGroup } from './nav/navConfig'

interface PageLayoutProps {
  title: string
  subtitle?: string
  /** Ícone da tela — aparece pequeno, ao lado da seção, para dar memória de lugar. */
  icon?: LucideIcon
  /** Mantido por compatibilidade: desde a v8 a cor vem da área (--area-*). */
  iconTom?: Tom
  ctaLabel?: string
  onCta?: () => void
  actions?: ReactNode
  /** Faixa colada ao cabeçalho — as abas da tela. No desktop ela gruda sob a
      barra azul quando o cabeçalho sai de vista. */
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
 * Quadro comum de todas as telas — v7 (01/11/2026).
 *
 * O cabeçalho virou um "topo de página" de verdade: faixa azulada que continua
 * a barra de navegação, título grande, a seção escrita em cima (onde estou) e
 * as abas da tela coladas na base. Antes cada tela tinha um cabeçalho fino com
 * um ícone em caixinha e as abas soltas no meio do conteúdo — o olho não sabia
 * se a aba era da tela ou de um bloco.
 *
 * Rolagem no desktop: o topo sai de vista e só a faixa de abas gruda sob a
 * barra azul — o espaço vertical volta para o conteúdo, e a ação principal
 * continua a um clique no "Criar" da barra. No celular o topo inteiro gruda
 * (não há barra azul lá) e as abas rolam com o conteúdo.
 */
export function PageLayout({
  title, subtitle, icon: Icon, iconTom: _iconTom,
  ctaLabel, onCta, actions, band, largura = 'padrao', children,
}: PageLayoutProps) {
  const { pathname } = useLocation()
  const caixa = largura === 'total' ? 'max-w-none' : 'max-w-7xl'
  const secao = secaoDa(pathname)
  // Quadros de largura total (Kanban) precisam da altura para as colunas:
  // o topo fica mais baixo e o título menor.
  const compacto = largura === 'total'
  const area = corDaArea(secao)

  return (
    <div className="flex-1 min-h-full bg-page aurora-host" style={{ ['--area' as string]: area, ['--aba-cor' as string]: area }}>
      <div className="aurora" aria-hidden />

      {/* ── Topo da página ──────────────────────────────────────── */}
      <header className={`page-mast sticky top-0 z-10 lg:static pt-safe ${band ? '' : 'page-mast-borda'}`}>
        <div className={`${caixa} mx-auto px-4 sm:px-6 lg:px-8 py-3.5 ${compacto ? 'lg:pt-4 lg:pb-3' : 'lg:pt-7 lg:pb-6'} flex items-center lg:items-end justify-between gap-4`}>
          <div className="min-w-0">
            {secao && (
              <p className={`hidden lg:flex items-center gap-1.5 ${compacto ? 'mb-1' : 'mb-2'} font-label text-[11px] font-bold uppercase tracking-[0.14em] text-t4`}>
                {Icon && (
                  <span className="area-selo" aria-hidden>
                    <Icon size={13} strokeWidth={2.2} />
                  </span>
                )}
                <span className="ml-1">{secao}</span>
              </p>
            )}
            <h1 className={`font-display text-[21px] ${compacto ? 'lg:text-[26px]' : 'lg:text-[32px]'} font-extrabold text-t1 leading-[1.1]
                           tracking-[-0.03em] truncate`}>
              {title}
            </h1>
            {subtitle && (
              <p className="text-[13px] lg:text-[14.5px] text-t3 mt-0.5 lg:mt-1.5 truncate">{subtitle}</p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {actions}
            {ctaLabel && onCta && (
              <button
                onClick={onCta}
                className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-brand-fill text-brand-fill-text
                           hover:bg-brand-fill-hover px-4 py-2 min-h-[42px] font-heading text-[14px] font-bold
                           shadow-[0_10px_24px_-12px_var(--brand-shadow)]
                           transition-[background-color,transform] active:scale-[0.98] cursor-pointer
                           focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                <Plus size={16} strokeWidth={2.4} aria-hidden />
                <span className="hidden sm:inline">{ctaLabel}</span>
                <span className="sm:hidden">Novo</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Abas da tela ────────────────────────────────────────── */}
      {band && (
        <div className="page-band lg:sticky lg:top-0 z-10">
          <div className={`${caixa} mx-auto px-4 sm:px-6 lg:px-8`}>{band}</div>
        </div>
      )}

      {/* ── Conteúdo ────────────────────────────────────────────── */}
      <div className={`${caixa} mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8`}>
        {children}
      </div>
    </div>
  )
}
