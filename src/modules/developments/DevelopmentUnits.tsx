import { useEffect, useState } from 'react'
import { Layers, Loader2, BedDouble, Car, Ruler } from 'lucide-react'
import { db } from '../../lib/db'
import {
  DevelopmentUnit, Development, resolvePaymentPlan, monthlyEffort,
  REINFORCEMENT_MONTHS,
} from '../../types'
import { formatCurrencyRound } from '../../lib/formatters'

/**
 * Tipologias com o fluxo em reais.
 *
 * O banco guarda o fluxo em PERCENTUAL, porque é assim que a construtora monta
 * a tabela e é o que vale para qualquer unidade da tipologia. Mas ninguém
 * negocia em porcentagem: o corretor precisa dizer "entrada de R$ 19.100 e
 * R$ 2.199 por mês". Aqui o percentual vira dinheiro sobre o preço de entrada
 * da tipologia.
 *
 * O esforço mensal equivalente aparece junto porque é o número que o cliente
 * sente: quem paga R$ 2.199 por mês mais R$ 7.781 por semestre desembolsa
 * R$ 3.496 na média. Sem diluir o reforço, a parcela parece bem menor do que é.
 */

function Fato({ Icon, children }: { Icon: typeof BedDouble; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-t3">
      <Icon size={10} strokeWidth={1.6} className="text-t4" />
      {children}
    </span>
  )
}

function Tipologia({ u }: { u: DevelopmentUnit }) {
  const base  = u.price ?? u.priceMin
  const plano = u.paymentPlans[0]
  const r     = plano ? resolvePaymentPlan(plano, base) : null
  const mensalEquivalente = r ? monthlyEffort(r) : null

  const faixa =
    u.priceMin != null && u.priceMax != null && u.priceMax !== u.priceMin
      ? `${formatCurrencyRound(u.priceMin)} – ${formatCurrencyRound(u.priceMax)}`
      : base != null ? formatCurrencyRound(base) : 'sem preço'

  return (
    <div className={`p-3 rounded-xl border ${u.available ? 'border-line bg-surface' : 'border-line bg-s2/40 opacity-60'}`}>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-t1 truncate">{u.name}</p>
          <div className="flex items-center gap-2.5 flex-wrap mt-0.5">
            {u.areaSqm != null && (
              <Fato Icon={Ruler}>{u.areaSqm.toString().replace('.', ',')} m²</Fato>
            )}
            {u.bedrooms != null && (
              <Fato Icon={BedDouble}>
                {u.bedrooms} {u.bedrooms === 1 ? 'dorm' : 'dorms'}
                {u.suites ? ` · ${u.suites} ${u.suites === 1 ? 'suíte' : 'suítes'}` : ''}
              </Fato>
            )}
            {u.parking != null && (
              <Fato Icon={Car}>{u.parking === 0 ? 'sem vaga' : `${u.parking} vaga`}</Fato>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-semibold text-t1 tabular-nums whitespace-nowrap">{faixa}</p>
          {u.available
            ? u.unitsAvailable != null && (
                <p className="text-[11px] text-t4">
                  {u.unitsAvailable} {u.unitsAvailable === 1 ? 'unidade' : 'unidades'}
                </p>
              )
            : <p className="text-[11px] text-warning">sem tabela</p>}
        </div>
      </div>

      {/* O fluxo em dinheiro — é o que se fala com o cliente */}
      {r && base != null && (
        <div className="mt-2 pt-2 border-t border-line">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px] tabular-nums">
            {r.downPayment != null && (
              <span className="text-t2">
                <span className="text-t4">entrada</span>{' '}
                {(r.downPayments ?? 1) > 1 && `${r.downPayments}× `}
                {formatCurrencyRound(r.downPayment)}
              </span>
            )}
            {r.installment != null && r.months != null && (
              <span className="text-t2">
                <span className="text-t4">+</span> {r.months}× {formatCurrencyRound(r.installment)}
              </span>
            )}
            {r.reinforcement != null && (
              <span className="text-t2">
                <span className="text-t4">+</span> {r.reinforcements ?? 1}×{' '}
                {formatCurrencyRound(r.reinforcement)}
                {r.reinforcementPeriod && (
                  <span className="text-t4"> {r.reinforcementPeriod}</span>
                )}
              </span>
            )}
            {r.financing != null && (
              <span className="text-t2">
                <span className="text-t4">+</span> {formatCurrencyRound(r.financing)}{' '}
                <span className="text-t4">financiado</span>
              </span>
            )}
          </div>

          {/* O número que o cliente sente no bolso todo mês */}
          {mensalEquivalente != null && r.reinforcement != null && r.reinforcementPeriod && (
            <p className="text-[11px] text-brand-text mt-1.5 tabular-nums">
              ≈ {formatCurrencyRound(mensalEquivalente)}/mês
              <span className="text-t4">
                {' '}com o reforço diluído em {REINFORCEMENT_MONTHS[r.reinforcementPeriod]} meses
              </span>
            </p>
          )}
        </div>
      )}

      {u.notes && <p className="text-[11px] text-t4 mt-1.5 leading-relaxed">{u.notes}</p>}
    </div>
  )
}

export function DevelopmentUnits({ development }: { development: Development }) {
  const [units, setUnits] = useState<DevelopmentUnit[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let vivo = true
    setLoading(true)
    db.developmentUnits.byDevelopment(development.id)
      .then(u => { if (vivo) setUnits(u) })
      .catch(() => { if (vivo) setUnits([]) })
      .finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [development.id])

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-t4">
        <Loader2 size={12} className="animate-spin" /> Carregando tipologias…
      </div>
    )
  }
  if (!units || units.length === 0) return null

  const disponiveis = units.filter(u => u.available)

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Layers size={13} className="text-brand" />
        <h3 className="font-label text-[11px] font-bold uppercase tracking-[0.14em] text-t2">
          Tipologias
        </h3>
        <span className="font-label text-[11px] bg-s3 text-t2 px-1.5 py-0.5 rounded-full tabular-nums">
          {disponiveis.length}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {units.map(u => <Tipologia key={u.id} u={u} />)}
      </div>
    </section>
  )
}
