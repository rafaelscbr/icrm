import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

/**
 * Ficha orientada à ação — peças do padrão "Folha" (02/11/2026).
 *
 * Nasceu na ficha do lead e virou o padrão de toda tela de detalhe do sistema.
 * A ficha responde três perguntas, nesta ordem:
 *   1. quem é       — nome grande como título, uma linha de dados embaixo;
 *   2. em que pé está — régua, situação ou números que mostram o estado;
 *   3. o que fazer agora — UM bloco (`FichaAgora`) com a frase da próxima ação
 *      e os botões que a executam, o tom só num filete à esquerda.
 * O resto (histórico, perfil, listas) fica abaixo ou em abas, sem caixa com
 * borda dentro de caixa. Estilo em `.ficha-*` no index.css.
 */

export type TomFicha = 'risco' | 'atencao' | 'sucesso' | 'neutro' | 'info'

const COR_TOM: Record<TomFicha, string> = {
  risco: 'var(--error)', atencao: 'var(--warning)', sucesso: 'var(--success)',
  info: 'var(--info)', neutro: 'var(--brand)',
}

/** Painel lateral à direita (tela cheia no celular), com Esc e fundo que fecha. */
export function FichaPainel({ rotulo, onClose, topo, rodape, children, largura = '36rem', pausarEsc = false }: {
  rotulo: string
  /** Um formulário aberto por cima cuida do próprio Esc. */
  pausarEsc?: boolean
  onClose: () => void
  /** Cabeçalho fixo (nome, dados, régua). O corpo rola abaixo dele. */
  topo: ReactNode
  rodape?: ReactNode
  children: ReactNode
  largura?: string
}) {
  useEffect(() => {
    if (pausarEsc) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, pausarEsc])

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/25" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={rotulo}
        className="ficha relative w-full h-full overflow-hidden sm:rounded-l-[22px] flex flex-col
                   animate-in fade-in slide-in-from-right-4 duration-200"
        style={{ maxWidth: `min(100%, ${largura})` }}
      >
        <header className="flex-shrink-0 px-6" style={{ paddingTop: 'calc(18px + env(safe-area-inset-top, 0px))' }}>
          {topo}
        </header>
        <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5">{children}</div>
        {rodape && (
          <footer className="flex-shrink-0 px-6 pt-3 border-t border-line flex items-center gap-2"
                  style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>
            {rodape}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}

/** Linha de cima do cabeçalho: contexto pequeno à esquerda, ícones à direita. */
export function FichaBarraTopo({ contexto, acoes, onClose }: {
  contexto: ReactNode
  acoes?: ReactNode
  onClose: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 -mr-2 mb-3">
      <span className="text-[12.5px] text-t4 flex items-center gap-1.5 min-w-0">{contexto}</span>
      <div className="flex items-center flex-shrink-0">
        {acoes}
        <button onClick={onClose} className="ficha-icone" aria-label="Fechar">
          <X size={19} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  )
}

/** Nome da ficha — o título. */
export function FichaNome({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-display text-[26px] sm:text-[28px] font-bold text-t1 leading-[1.1] tracking-[-0.025em]"
        style={{ textWrap: 'balance' } as React.CSSProperties}>
      {children}
    </h2>
  )
}

/** O que fazer agora: rótulo e prazo no tom, a frase, e os botões embaixo. */
export function FichaAgora({ tom, rotulo, prazo, texto, children }: {
  tom: TomFicha
  rotulo: string
  prazo?: string
  texto: ReactNode
  children?: ReactNode
}) {
  const corRotulo = tom === 'neutro' ? 'var(--t3)' : COR_TOM[tom]
  return (
    <section className="ficha-agora" style={{ ['--tom' as string]: COR_TOM[tom] }} aria-label="O que fazer agora">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12.5px] font-semibold" style={{ color: corRotulo }}>{rotulo}</p>
        {prazo && <span className="text-[12.5px] font-semibold tabular-nums flex-shrink-0" style={{ color: corRotulo }}>{prazo}</span>}
      </div>
      <p className="text-[16px] font-semibold text-t1 leading-snug mt-1">{texto}</p>
      {children && <div className="mt-4">{children}</div>}
    </section>
  )
}

/** Faixa de números do negócio: três (ou dois) valores com filete fino entre eles. */
export function FichaNumeros({ itens }: {
  itens: { rotulo: string; valor: ReactNode; tom?: 'sucesso' | 'atencao' | 'risco' }[]
}) {
  const cor = { sucesso: 'text-success', atencao: 'text-warning', risco: 'text-error' }
  return (
    <dl className="ficha-numeros" style={{ gridTemplateColumns: `repeat(${itens.length}, minmax(0, 1fr))` }}>
      {itens.map(i => (
        <div key={i.rotulo}>
          <dt>{i.rotulo}</dt>
          <dd className={`tabular-nums ${i.tom ? cor[i.tom] : 'text-t1'}`}>{i.valor}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Título de seção dentro da ficha — aceita `<Destaque>` nas palavras certas. */
export function FichaSecao({ titulo, acao, children }: { titulo: ReactNode; acao?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h3 className="text-[15px] font-semibold text-t1">{titulo}</h3>
        {acao}
      </div>
      {children}
    </section>
  )
}
