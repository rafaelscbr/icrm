import { destacar } from '../../components/shared/Destaque'
import { DeOndeVem } from '../leads/DeOndeVem'
import { MotivosDeDescarte, useNomeDoMotivo } from '../leads/MotivosDeDescarte'
import { contar, dddsDoRecorte, motivosSafra } from '../leads/safra'
import type { FunilSafra } from '../leads/safra'

/**
 * Dois resumos lado a lado na dashboard (25/11/2026), da mesma safra do funil
 * comercial: de onde vêm os leads (região provável pelo DDD, migração 115) e
 * por que eles saem (motivos de descarte).
 */
export function OrigemEDescartes({ safra, corretor, descricao }: {
  safra: FunilSafra
  /** corretor da visão; null = imobiliária inteira */
  corretor: string | null
  /** "nos últimos 3 meses" etc. */
  descricao: string
}) {
  const nomeMotivo = useNomeDoMotivo()
  const filtro = { corretor, produto: null }
  const c = contar(safra, filtro)
  if (c.recebidos === 0) return null
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-10">
      <section aria-labelledby="de-onde-vem-titulo" className="dash-painel-branco min-w-0">
        <header className="mb-5">
          <h2 id="de-onde-vem-titulo" className="font-display text-[22px] font-bold text-t1 tracking-[-0.025em]">
            {destacar('De onde *vêm*')}
          </h2>
          <p className="text-[13px] text-t4 mt-0.5">Região provável pelo DDD, dos leads que chegaram {descricao}</p>
        </header>
        <DeOndeVem {...dddsDoRecorte(safra, filtro)} />
      </section>
      <section aria-labelledby="por-que-saem-titulo" className="dash-painel-branco min-w-0">
        <header className="mb-5">
          <h2 id="por-que-saem-titulo" className="font-display text-[22px] font-bold text-t1 tracking-[-0.025em]">
            {destacar('Por que *saem*')}
          </h2>
          <p className="text-[13px] text-t4 mt-0.5">Motivos de descarte dos leads que chegaram {descricao}</p>
        </header>
        <MotivosDeDescarte lista={motivosSafra(safra, filtro, 8)} descartados={c.descartados} recebidos={c.recebidos} nomeMotivo={nomeMotivo} />
      </section>
    </div>
  )
}
