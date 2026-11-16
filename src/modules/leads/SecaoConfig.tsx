import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { destacar } from '../../components/shared/Destaque'

/**
 * Moldura das seções de Configurações de Leads.
 *
 * Cada seção tinha o seu cabeçalho — caixa de ícone, título, texto, botão — e
 * nenhuma era igual à outra. Aqui é um formato só: título, uma frase dizendo o
 * que aquilo faz e, à direita, a ação da seção (ligar/desligar, atualizar).
 */
export function SecaoConfig({ id, titulo, descricao, lado, children }: {
  id: string
  /** aceita o marcador *palavra* de destaque */
  titulo: string
  descricao: string
  lado?: ReactNode
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="min-w-0">
      <div className="flex items-start justify-between gap-x-6 gap-y-3 flex-wrap mb-4">
        <div className="min-w-0 flex-1 basis-[280px]">
          <h3 id={id} className="font-display text-[18px] font-bold tracking-[-0.02em] text-t1">{destacar(titulo)}</h3>
          <p className="text-[13.5px] leading-relaxed text-t3 mt-1 max-w-2xl">{descricao}</p>
        </div>
        {lado && <div className="flex items-center gap-2.5 flex-shrink-0">{lado}</div>}
      </div>
      {children}
    </section>
  )
}

/** Liga/desliga — o mesmo em todas as seções, com alvo de toque de 44px. */
export function Interruptor({ ligado, onChange, rotulo, disabled = false, carregando = false, title, comTexto = false }: {
  ligado: boolean
  onChange: () => void
  /** o que o controle faz, para leitor de tela: "Rodízio por tempo de resposta" */
  rotulo: string
  disabled?: boolean
  carregando?: boolean
  title?: string
  /** escreve "Ligado" / "Desligado" ao lado */
  comTexto?: boolean
}) {
  return (
    <span className="inline-flex items-center gap-2.5 flex-shrink-0">
      {comTexto && (
        <span className={`text-[13px] font-medium ${ligado ? 'text-success' : 'text-t3'}`} aria-hidden>
          {carregando ? <Loader2 size={13} className="animate-spin inline" /> : ligado ? 'Ligado' : 'Desligado'}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        aria-label={rotulo}
        title={title}
        onClick={onChange}
        disabled={disabled || carregando}
        className="relative w-11 h-6 rounded-full transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed
                   before:absolute before:-inset-2.5 before:content-['']
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        style={{ background: ligado ? 'var(--brand)' : 'var(--line-strong)' }}
      >
        <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-[left] duration-150"
          style={{ left: ligado ? '1.375rem' : '2px' }} />
      </button>
    </span>
  )
}

/** Campo "folha limpa": sem borda, fundo suave, foco com anel. */
export const CAMPO = `h-10 rounded-[10px] bg-s2 px-3 text-[14px] text-t1 placeholder:text-t4
  focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-50`
