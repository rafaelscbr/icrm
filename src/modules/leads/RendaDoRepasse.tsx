import { useEffect, useMemo } from 'react'
import { BadgeCheck, CircleHelp, XCircle } from 'lucide-react'
import type { Development, DevelopmentUnit, Lead, LeadProfile } from '../../types'
import { Destaque } from '../../components/shared/Destaque'
import { formatCurrencyFull } from '../../lib/formatters'
import { bancoParaCalculo, useParametrosFinanciamento } from '../simulador/financiamento/dados'
import { calcularRepasse } from '../simulador/financiamento/repasse'

/**
 * "Passa no banco?" — a renda do repasse na ficha do lead, sem simular nada.
 *
 * Pedido do Rafael em 24/11/2026: abrir a ficha e já saber se o cliente
 * financia o saldo no banco, no pior cenário (piso da faixa de renda
 * declarada, SAC). Como no Simulador de financiamento, a conta é de imóvel
 * pronto, em valores de hoje, sem correção da obra. As regras moram em
 * simulador/financiamento/repasse.ts; aqui só se lê e mostra.
 *
 * Também mostra a renda da OBRA (30% do desembolso mensal, já cadastrada na
 * tipologia), porque o que decide é a maior das duas.
 */
export function RendaDoRepasse({ lead, tipologia, lancamento, perfil, explicarFalta = false }: {
  lead: Lead
  tipologia?: DevelopmentUnit
  lancamento?: Development
  perfil: LeadProfile | null
  /**
   * Na aba Financiamento (26/11/2026) a falta de dado é dita em uma linha;
   * em outros lugares o bloco simplesmente não aparece.
   */
  explicarFalta?: boolean
}) {
  const { bancos, carregado, carregar } = useParametrosFinanciamento()
  useEffect(() => { void carregar() }, [carregar])

  const banco = useMemo(() => {
    const linha = bancos.find(b => b.padrao && b.ativo) ?? bancos.find(b => b.ativo)
    return linha ? bancoParaCalculo(linha) : null
  }, [bancos])

  const falta = (texto: string) => explicarFalta
    ? <p className="text-[13.5px] text-t3 leading-relaxed">{texto}</p>
    : null

  if (!lead.developmentUnitId || !tipologia) return falta('Escolha a tipologia do lead (em Editar) para calcular se ele passa no banco.')
  if (!carregado) return falta('Carregando os bancos…')
  if (!banco) return falta('Nenhum banco ativo. Cadastre um banco no Admin para calcular o financiamento.')

  const renda = perfil?.profile.renda
  const idade = perfil?.profile.idade
  const idadeNum = idade?.value && /^\d+$/.test(idade.value) ? parseInt(idade.value, 10) : null
  const rep = calcularRepasse({
    preco: lead.averageTicket ?? tipologia.price ?? tipologia.priceMin,
    planos: tipologia.paymentPlans,
    rendaPiso: renda?.min ?? null,
    idade: idadeNum,
    idadeInformadaEm: idade?.at ?? (idade?.source === 'formulario' ? lead.createdAt : null),
  }, banco)

  // Ficha enxuta (25/11/2026): sem o dado da tabela, o bloco não aparece —
  // um aviso de que falta dado só ocupava espaço.
  if (!rep) return falta(`A tabela de ${tipologia.name} não informa o % financiado no banco.`)
  const { r } = rep
  if (!r.valido) return falta(r.erro ?? 'Não foi possível calcular o financiamento com os dados deste lead.')

  const rendaObra = tipologia.incomeMin ?? lancamento?.incomeMin
  const exigida = Math.max(r.rendaNecessaria, rendaObra ?? 0)
  const decide = rendaObra != null && rendaObra > r.rendaNecessaria ? 'obra' : 'repasse'
  const inv = r.inverso
  const semPiso = renda && !(renda.min && renda.min > 0)

  return (
    <section aria-labelledby="repasse-titulo">
      <div className="flex items-baseline justify-between gap-3 mb-2.5">
        <h3 id="repasse-titulo" className="text-[15px] font-semibold text-t1">Passa no <Destaque>banco</Destaque>?</h3>
        <span className="text-[12px] text-t4 truncate">{banco.nome} {r.taxaAnual.toLocaleString('pt-BR')}% · SAC · {r.prazo} meses</span>
      </div>

      <div className={`rounded-[18px] border p-4 ${inv ? (inv.passa ? 'border-success-line bg-success-bg' : 'border-error-line bg-error-bg') : 'border-line bg-s2/60'}`}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[12.5px] text-t3">Renda bruta exigida</p>
            <p className="font-display text-[24px] font-extrabold text-t1 tabular-nums leading-tight">{formatCurrencyFull(exigida)}</p>
            <p className="text-[12px] text-t4 mt-0.5">
              {decide === 'repasse' ? 'pela parcela do banco' : 'pelo desembolso durante a obra'}
            </p>
          </div>
          <div className="text-right">
            {inv ? (
              <>
                <p className={`inline-flex items-center gap-1.5 text-[13.5px] font-bold ${inv.passa ? 'text-success' : 'text-error'}`}>
                  {inv.passa ? <BadgeCheck size={16} aria-hidden /> : <XCircle size={16} aria-hidden />}
                  {inv.passa ? 'Passa' : 'Fora da regra'}
                </p>
                <p className="text-[12.5px] text-t3 tabular-nums">com {formatCurrencyFull(inv.rendaCliente)} (piso declarado)</p>
                {!inv.passa && (
                  <p className="text-[12.5px] font-semibold text-error tabular-nums">falta {formatCurrencyFull(r.rendaNecessaria - inv.rendaCliente)} de renda</p>
                )}
              </>
            ) : (
              <p className="inline-flex items-center gap-1.5 text-[13px] text-t3">
                <CircleHelp size={15} aria-hidden />
                {semPiso ? 'faixa de renda sem piso' : 'renda não informada'}
              </p>
            )}
          </div>
        </div>

        <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px]">
          <div><dt className="text-t4">Parcela no banco</dt><dd className="font-semibold text-t1 tabular-nums">{formatCurrencyFull(r.parcelaTotal)}</dd></div>
          <div><dt className="text-t4">Valor financiado</dt><dd className="font-semibold text-t1 tabular-nums">{formatCurrencyFull(r.financiado)}</dd></div>
          <div><dt className="text-t4">Renda na obra</dt><dd className="font-semibold text-t1 tabular-nums">{rendaObra ? formatCurrencyFull(rendaObra) : '—'}</dd></div>
          <div><dt className="text-t4">Idade</dt><dd className="font-semibold text-t1 tabular-nums">{rep.idade ? `${rep.idade} anos` : 'não informada'}</dd></div>
        </dl>

        {inv && !inv.passa && inv.sugestoes.length > 0 && (
          <ul className="mt-3 space-y-0.5 text-[12.5px] text-t2">
            {inv.sugestoes.slice(0, 3).map(s => <li key={s.tipo}>→ {s.texto}</li>)}
          </ul>
        )}

        <p className="mt-3 text-[11.5px] text-t4">
          {rep.financiamentoPct}% financiado · valores de hoje, como imóvel pronto
          {r.cotaEstourada && ' · acima da cota do banco'}
          {' · '}Simulação de referência; aprovação depende da análise do banco.
        </p>
      </div>
    </section>
  )
}
