import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Lightbulb } from 'lucide-react'

/**
 * Primitivas visuais da Prospecção Ativa.
 *
 * Mesma linguagem do Pulse — superfície com grão e gradiente diagonal, filete
 * de marca no título, rótulo em Space Grotesk maiúsculo, número grande em
 * tabular. O dourado é racionado: só o bloco de meta o recebe, porque marca
 * dinheiro e objetivo. Card de operação fica sem, senão nada destaca.
 *
 * Está aqui, e não solto em cada tela, para que a fila, o quadro e o
 * desempenho não divirjam com o tempo.
 */

/** Tons semânticos disponíveis. Cor aqui é significado, nunca decoração. */
export type Tom = 'marca' | 'sucesso' | 'atencao' | 'risco' | 'info' | 'neutro'

export const TOM: Record<Tom, { texto: string; fundo: string; borda: string; ponto: string; solido: string }> = {
  marca:   { texto: 'text-brand-text', fundo: 'bg-brand-tint',  borda: 'border-brand/25',   ponto: 'bg-brand',   solido: 'var(--brand)'   },
  sucesso: { texto: 'text-success',    fundo: 'bg-success-bg',  borda: 'border-success-line', ponto: 'bg-success', solido: 'var(--success)' },
  atencao: { texto: 'text-warning',    fundo: 'bg-warning-bg',  borda: 'border-warning-line', ponto: 'bg-warning', solido: 'var(--warning)' },
  risco:   { texto: 'text-error',      fundo: 'bg-error-bg',    borda: 'border-error-line',   ponto: 'bg-error',   solido: 'var(--error)'   },
  info:    { texto: 'text-info',       fundo: 'bg-info-bg',     borda: 'border-info-line',    ponto: 'bg-info',    solido: 'var(--info)'    },
  neutro:  { texto: 'text-t3',         fundo: 'bg-s3/60',       borda: 'border-line',         ponto: 'bg-t4',      solido: 'var(--t3)'      },
}

/** Superfície padrão: grão + gradiente diagonal. Nunca fundo chapado. */
export function Painel({ children, className = '', dourado = false }: {
  children: ReactNode
  className?: string
  /** só para blocos de dinheiro, meta e marca */
  dourado?: boolean
}) {
  return (
    <section
      className={`relative rounded-[14px] border border-line surface-premium shadow-card
                  overflow-hidden ${dourado ? 'gold-edge gold-glow-tl' : ''} ${className}`}
    >
      {children}
    </section>
  )
}

/** Cabeçalho de painel — filete de marca, ícone e rótulo. */
export function PainelTitulo({ icon: Icon, children, extra, tom = 'marca' }: {
  icon: LucideIcon
  children: ReactNode
  extra?: ReactNode
  tom?: Tom
}) {
  return (
    <header className="flex items-center gap-2 px-4 pt-3.5 pb-2.5">
      <span className={`w-1 h-3.5 rounded-full ${TOM[tom].ponto}`} aria-hidden />
      <Icon size={15} strokeWidth={1.6} className="text-t3" aria-hidden />
      <h2 className="font-label text-[11px] uppercase tracking-[0.14em] text-t3">{children}</h2>
      {extra && <div className="ml-auto">{extra}</div>}
    </header>
  )
}

export function Rotulo({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`font-label text-[11px] uppercase tracking-[0.14em] text-t4 ${className}`}>
      {children}
    </span>
  )
}

/** Ícone em bloco tonalizado — nunca solto sobre o fundo. */
export function IconeTom({ icon: Icon, tom = 'neutro', tamanho = 'md' }: {
  icon: LucideIcon
  tom?: Tom
  tamanho?: 'sm' | 'md' | 'lg'
}) {
  const caixa = { sm: 'w-7 h-7 rounded-[9px]', md: 'w-9 h-9 rounded-[11px]', lg: 'w-11 h-11 rounded-[14px]' }[tamanho]
  const px    = { sm: 13, md: 16, lg: 19 }[tamanho]
  const t = TOM[tom]
  return (
    <span className={`${caixa} ${t.fundo} border ${t.borda} flex items-center justify-center shrink-0`} aria-hidden>
      <Icon size={px} strokeWidth={1.6} className={t.texto} />
    </span>
  )
}

/**
 * Barra de progresso com halo.
 *
 * O brilho é o que faz o número parecer meta e não enfeite — receita da barra
 * de VGV no guia de gradientes. Só o tom `marca` recebe halo dourado.
 */
export function Barra({ pct, tom = 'marca', altura = 6 }: { pct: number; tom?: Tom; altura?: number }) {
  const preenchido = Math.max(0, Math.min(100, pct))
  const dourado = tom === 'marca'
  return (
    <div
      className="w-full rounded-full bg-s3 overflow-hidden"
      style={{ height: altura }}
      role="progressbar"
      aria-valuenow={Math.round(preenchido)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-[520ms]"
        style={{
          width: `${preenchido}%`,
          // Os dois pontos do degradê são tokens de tema: no papel o ouro
          // escurece em vez de clarear (ver --grad-brand no index.css).
          background: dourado
            ? 'linear-gradient(90deg, var(--brand-dark), var(--brand) 75%)'
            : TOM[tom].solido,
          boxShadow: dourado && preenchido > 0 ? '0 0 16px var(--brand-shadow)' : undefined,
        }}
      />
    </div>
  )
}

/** Número grande com rótulo — o bloco de leitura de relance. */
export function Numero({ valor, rotulo, nota, tom = 'neutro', icon }: {
  valor: ReactNode
  rotulo: string
  nota?: ReactNode
  tom?: Tom
  icon?: LucideIcon
}) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="flex items-center gap-1.5">
        {icon && <IconeTom icon={icon} tom={tom} tamanho="sm" />}
        <Rotulo>{rotulo}</Rotulo>
      </div>
      <span className={`font-heading font-extrabold tabular-nums leading-none text-[28px]
                        tracking-tight truncate ${tom === 'neutro' ? 'text-t1' : TOM[tom].texto}`}>
        {valor}
      </span>
      {nota && <span className="text-[11px] text-t4 truncate">{nota}</span>}
    </div>
  )
}

/**
 * Dica — explica a regra que a tela não consegue mostrar sozinha.
 *
 * Existe porque este módulo tem várias regras invisíveis (reserva de lead,
 * cadência, o que conta como ligação). Sem elas escritas, o corretor inventa
 * a própria explicação, e ela costuma estar errada.
 */
export function Dica({ children, tom = 'neutro' }: { children: ReactNode; tom?: Tom }) {
  const t = TOM[tom]
  return (
    <div className={`flex items-start gap-2.5 rounded-[14px] border ${t.borda} ${t.fundo} px-3.5 py-2.5`}>
      <Lightbulb size={13} strokeWidth={1.6} className={`${t.texto} shrink-0 mt-0.5`} aria-hidden />
      <p className={`text-[13px] leading-relaxed ${tom === 'neutro' ? 'text-t3' : t.texto}`}>{children}</p>
    </div>
  )
}

/** Chip de status — cor + ícone, nunca cor sozinha. */
export function Chip({ icon: Icon, tom = 'neutro', children }: {
  icon?: LucideIcon
  tom?: Tom
  children: ReactNode
}) {
  const t = TOM[tom]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border ${t.borda} ${t.fundo}
                      px-2 py-0.5 text-[11px] font-semibold ${t.texto}`}>
      {Icon && <Icon size={11} strokeWidth={1.8} aria-hidden />}
      {children}
    </span>
  )
}
