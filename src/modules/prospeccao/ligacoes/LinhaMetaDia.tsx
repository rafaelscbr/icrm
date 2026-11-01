import type { ReactNode } from 'react'
import { Barra } from '../../../components/shared/visual'

/**
 * Meta de ligações do dia em uma linha (v10, 01/11/2026).
 *
 * Antes era um painel dourado com ícone, número de 38px, frase e chips — o
 * maior bloco da tela, empurrando a fila e as campanhas para baixo. O que o
 * corretor precisa ler é "quantas fiz, quantas faltam"; o resto é nota.
 */
export function LinhaMetaDia({ hoje, meta, semana, mes, semDesfecho, acao, className = '' }: {
  hoje: number
  meta: number
  semana: number
  mes: number
  semDesfecho: number
  acao?: ReactNode
  className?: string
}) {
  const bateu  = hoje >= meta
  const faltam = Math.max(0, meta - hoje)
  return (
    <div className={`bento flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3.5 ${className}`}>
      <div className="flex items-baseline gap-2 shrink-0">
        <span className="text-[12.5px] text-t4">Hoje</span>
        <span className={`font-display font-extrabold tabular-nums leading-none text-[26px] tracking-[-0.02em]
                          ${bateu ? 'text-success' : 'text-t1'}`}>
          {hoje}
        </span>
        <span className="text-[13px] text-t4 tabular-nums">de {meta}</span>
      </div>

      <div className="flex-1 min-w-[160px]">
        <Barra pct={(hoje / meta) * 100} tom={bateu ? 'sucesso' : 'marca'} altura={5}
               rotuloAcessivel={`${hoje} de ${meta} tentativas hoje`} />
        <p className="text-[12px] text-t4 mt-1.5 tabular-nums">
          {bateu ? 'Meta batida' : `Faltam ${faltam}`}
          <span className="text-t5" aria-hidden> · </span>{semana} na semana
          <span className="text-t5" aria-hidden> · </span>{mes} no mês
          {semDesfecho > 0 && (
            <span className="text-warning">
              <span className="text-t5" aria-hidden> · </span>{semDesfecho} sem desfecho
            </span>
          )}
        </p>
      </div>

      {acao}
    </div>
  )
}
