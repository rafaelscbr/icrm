import { useState } from 'react'
import { Pencil, Building2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '../../components/ui/Button'
import {
  FichaPainel, FichaBarraTopo, FichaNome, FichaAgora, FichaNumeros, FichaSecao, FichaRegua,
} from '../../components/shared/Ficha'
import { Destaque } from '../../components/shared/Destaque'
import { useDevelopmentsStore } from '../../store/useDevelopmentsStore'
import { QualificationScale } from './QualificationScale'
import { DevelopmentMatches } from './DevelopmentMatches'
import { DevelopmentUnits } from './DevelopmentUnits'
import { pendenciasDaRegua, fgtsIsCriterion } from './qualification'
import {
  Development, DEVELOPMENT_STATUS_LABEL, DEVELOPMENT_REGIME_LABEL,
} from '../../types'
import { formatCurrency, formatCurrencyRound, formatDate, formatMonthYear } from '../../lib/formatters'
import { resolvePaymentPlan } from '../../types'

interface DevelopmentModalProps {
  isOpen: boolean
  onClose: () => void
  development: Development
  onEdit: () => void
  canEdit: boolean
}

export function DevelopmentModal({
  isOpen, onClose, development: d, onEdit, canEdit,
}: DevelopmentModalProps) {
  const { update } = useDevelopmentsStore()
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const [excluindo, setExcluindo] = useState(false)

  const pendencias = pendenciasDaRegua(d)
  const fgtsConta = fgtsIsCriterion(d)

  /*
   * Excluir aqui é ARQUIVAR (active = false), não apagar a linha.
   *
   * A régua de um lançamento é o que qualificou os leads que entraram por ele.
   * Apagar de vez deixaria esses leads apontando para uma condição que não
   * existe mais, e o histórico passaria a mentir. Arquivado, o produto some da
   * operação e o passado continua explicável.
   */
  async function handleExcluir() {
    setExcluindo(true)
    try {
      await update(d.id, { active: false })
      toast.success(`${d.name} foi excluído`)
      onClose()
    } catch {
      // O store já avisou e manteve a tela como estava.
    } finally {
      setExcluindo(false)
    }
  }

  const publico = [
    d.acceptsResident ? 'quem vai morar' : null,
    d.acceptsInvestor ? 'investidor' : null,
  ].filter(Boolean).join(' e ')

  const faixaValor =
    d.valueMin != null && d.valueMax != null
      ? `${formatCurrencyRound(d.valueMin)} a ${formatCurrencyRound(d.valueMax)}`
      : d.valueMin != null ? `a partir de ${formatCurrencyRound(d.valueMin)}`
      : d.valueMax != null ? `até ${formatCurrencyRound(d.valueMax)}`
      : 'Não informada'

  if (!isOpen) return null

  const fases = (Object.keys(DEVELOPMENT_STATUS_LABEL) as (keyof typeof DEVELOPMENT_STATUS_LABEL)[])
    .map(k => ({ chave: k, rotulo: DEVELOPMENT_STATUS_LABEL[k] }))

  return (
    <FichaPainel
      rotulo={`Lançamento ${d.name}`}
      onClose={onClose}
      topo={
        <>
          <FichaBarraTopo
            onClose={onClose}
            contexto={<><Building2 size={13} strokeWidth={1.8} aria-hidden />
              <span className="truncate">{[d.builder, DEVELOPMENT_REGIME_LABEL[d.regime]].filter(Boolean).join(' · ')}</span></>}
            acoes={canEdit ? (
              <button onClick={onEdit} className="ficha-icone" aria-label={`Editar ${d.name}`} title="Editar">
                <Pencil size={16} strokeWidth={1.8} />
              </button>
            ) : undefined}
          />
          <FichaNome>{d.name}</FichaNome>
          <div className="flex items-center gap-x-3 gap-y-1 mt-2 flex-wrap text-[14px]">
            <span className="text-t2">{[d.region, d.city].filter(Boolean).join(', ') || 'Local não informado'}</span>
            <span className="text-t4">Entrega {d.deliveryEstimate ? formatMonthYear(d.deliveryEstimate) : 'a definir'}</span>
          </div>
          <div className="mt-6 mb-5">
            <FichaRegua rotulo="Fase da obra" etapas={fases} atual={d.status} cor="var(--area-produtos)" />
          </div>
        </>
      }
      rodape={canEdit ? (
        confirmandoExclusao ? (
          <div className="flex items-center gap-2 w-full" role="alertdialog" aria-label={`Excluir ${d.name}`}>
            <span className="text-[13px] text-error flex-1">Excluir? Sai da lista e deixa de qualificar lead; o histórico fica.</span>
            <Button variant="ghost" size="sm" onClick={() => setConfirmandoExclusao(false)} disabled={excluindo}>Não</Button>
            <Button variant="danger" size="sm" onClick={handleExcluir} carregando={excluindo}>Excluir</Button>
          </div>
        ) : (
          <>
            <button onClick={() => setConfirmandoExclusao(true)} className="inline-flex items-center h-9 px-3 rounded-[10px] text-[13.5px] font-medium text-error hover:bg-error-bg">
              Excluir
            </button>
            <div className="flex-1" />
            <Button onClick={onEdit} className="gap-1.5"><Pencil size={14} aria-hidden /> Editar</Button>
          </>
        )
      ) : undefined}
    >
      <div className="flex flex-col gap-7">
        <FichaAgora
          tom={d.confirmed ? 'sucesso' : 'atencao'}
          rotulo={d.confirmed ? 'Régua conferida' : 'Ainda não classifica lead'}
          texto={d.confirmed
            ? 'Já qualifica lead. Veja abaixo quem da base cabe neste produto.'
            : pendencias.length > 0
              ? `Falta definir: ${pendencias.join(', ')}.`
              : 'Confira os valores e marque “Régua conferida” na edição.'}
        >
          {!d.confirmed && canEdit && (
            <button onClick={onEdit} className="ficha-acao w-full">
              <Pencil size={15} strokeWidth={1.9} aria-hidden /> Conferir a régua
            </button>
          )}
        </FichaAgora>

        <FichaNumeros itens={[
          { rotulo: 'Unidades', valor: d.valueMin != null && d.valueMax != null
              ? `${formatCurrency(d.valueMin)} – ${formatCurrency(d.valueMax)}`
              : faixaValor },
          { rotulo: 'Renda mínima', valor: d.incomeMin != null ? formatCurrencyRound(d.incomeMin) : '—' },
          { rotulo: 'Entrada mínima', valor: d.downPaymentMin != null ? formatCurrencyRound(d.downPaymentMin) : '—' },
        ]} />

        <p className="text-[14px] text-t2 leading-relaxed -mt-2">
          Aceita {publico || 'público não definido'}
          {d.unitTypes.length > 0 && <> · {d.unitTypes.join(', ')} dorm</>}
        </p>

        <FichaSecao titulo={<>Régua de <Destaque>qualificação</Destaque></>}>
          <div className="flex flex-col gap-4 rounded-[16px] bg-s2 p-4">
            <QualificationScale label="Renda familiar" min={d.incomeMin} ideal={d.incomeIdeal} suffix="/mês" />
            <QualificationScale label="Entrada" min={d.downPaymentMin} ideal={d.downPaymentIdeal} />
            <p className="text-[13px] text-t3 leading-relaxed">
              {d.regime === 'pos_chaves'
                ? 'Pós-chaves: o FGTS não entra na qualificação. Lead sem essa resposta não fica incompleto.'
                : fgtsConta
                  ? 'Associativo: o FGTS compõe a entrada e conta na qualificação.'
                  : 'Associativo, mas o FGTS não compõe a entrada — fica no perfil como informação.'}
            </p>
          </div>
        </FichaSecao>

        {d.paymentPlans.length > 0 && (
          <FichaSecao titulo="Fluxos de pagamento">
            <ul className="flex flex-col">
              {d.paymentPlans.map((p, i) => {
                // Resolve o percentual sobre o menor valor do produto: o fluxo é
                // guardado em % e aqui vira dinheiro, que é como se fala com o
                // cliente. `!= null` cobre o null que vem do banco.
                const r = resolvePaymentPlan(p, d.valueMin)
                return (
                  <li key={i} className="py-2.5 border-b border-line last:border-0">
                    <p className="text-[14.5px] font-semibold text-t1">{p.name}</p>
                    <p className="text-[13px] text-t3 mt-0.5 tabular-nums">
                      {[
                        r.downPayment != null
                          ? `${(r.downPayments ?? 1) > 1 ? `${r.downPayments}× ` : ''}${formatCurrencyRound(r.downPayment)} de entrada`
                          : null,
                        r.installment != null && r.months != null ? `${r.months}× ${formatCurrencyRound(r.installment)}` : null,
                        r.reinforcement != null
                          ? `${r.reinforcements ?? 1}× ${formatCurrencyRound(r.reinforcement)}` + (r.reinforcementPeriod ? ` ${r.reinforcementPeriod}` : '')
                          : null,
                        r.financing != null ? `${formatCurrencyRound(r.financing)} financiado` : null,
                      ].filter(Boolean).join(' + ') || 'Sem valores definidos'}
                    </p>
                    {p.notes && <p className="text-[12.5px] text-t4 mt-0.5">{p.notes}</p>}
                  </li>
                )
              })}
            </ul>
          </FichaSecao>
        )}

        <DevelopmentUnits development={d} />

        {d.confirmed && <DevelopmentMatches development={d} />}

        <FichaSecao titulo="Vigência">
          <p className="text-[14px] text-t2">
            Desde {formatDate(d.validFrom)}{d.validUntil ? ` até ${formatDate(d.validUntil)}` : ', sem prazo'}
          </p>
          <p className="text-[12.5px] text-t4 mt-0.5">
            O lead é qualificado pela condição da data em que entrou
            {d.metaFormIds.length > 0 && <> · {d.metaFormIds.length} formulário{d.metaFormIds.length !== 1 ? 's' : ''} do Meta trazem lead para cá</>}
            {(d.conditionHistory?.length ?? 0) > 0 && <> · {d.conditionHistory!.length} versão(ões) anterior(es) guardada(s)</>}
          </p>
        </FichaSecao>

        {d.notes && (
          <FichaSecao titulo="Observações">
            <p className="text-[14px] text-t2 leading-relaxed whitespace-pre-wrap">{d.notes}</p>
          </FichaSecao>
        )}
      </div>
    </FichaPainel>
  )
}
