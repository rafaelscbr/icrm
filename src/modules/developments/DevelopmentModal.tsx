import { useState } from 'react'
import {
  Pencil, AlertTriangle, CheckCircle2, Wallet, Layers, MapPin,
  Megaphone, CalendarClock, Info, Building2, Trash2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { useDevelopmentsStore } from '../../store/useDevelopmentsStore'
import { QualificationScale } from './QualificationScale'
import { pendenciasDaRegua, fgtsIsCriterion } from './qualification'
import {
  Development, DEVELOPMENT_STATUS_LABEL, DEVELOPMENT_REGIME_LABEL,
} from '../../types'
import { formatCurrencyRound, formatDate, formatMonthYear } from '../../lib/formatters'

interface DevelopmentModalProps {
  isOpen: boolean
  onClose: () => void
  development: Development
  onEdit: () => void
  canEdit: boolean
}

/** Par rótulo/valor — a unidade de leitura de toda a ficha. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="font-label text-[11px] font-bold uppercase tracking-[0.12em] text-t4">{label}</p>
      <p className="text-sm text-t1 mt-0.5 truncate">{value}</p>
    </div>
  )
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={d.name}
      subtitle={[d.builder, d.region, d.city].filter(Boolean).join(' · ')}
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-3 w-full">
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${d.confirmed ? 'text-success' : 'text-warning'}`}>
            {d.confirmed ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
            {d.confirmed ? 'Régua confirmada' : 'Régua a confirmar'}
          </span>
          <div className="flex gap-2">
            {canEdit && (
              <Button
                variant="ghost"
                onClick={() => setConfirmandoExclusao(true)}
                aria-label={`Excluir ${d.name}`}
                className="!text-t4 hover:!text-error hover:!bg-error-bg"
              >
                <Trash2 size={13} />
                <span className="hidden sm:inline">Excluir</span>
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>Fechar</Button>
            {canEdit && (
              <Button onClick={onEdit}>
                <Pencil size={13} /> Editar
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-6">

        {/* Confirmação de exclusão — inline, não abre modal em cima de modal */}
        {confirmandoExclusao && (
          <div className="flex flex-col gap-3 p-4 rounded-xl border border-error-line bg-error-bg">
            <div className="flex items-start gap-3">
              <Trash2 size={15} className="text-error flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-error">Excluir {d.name}?</p>
                <p className="text-xs text-t2 mt-1 leading-relaxed">
                  Sai da lista de lançamentos e deixa de qualificar lead.
                  {d.metaFormIds.length > 0 && (
                    <> Os {d.metaFormIds.length} formulário(s) do Meta ligados a ele continuam
                    trazendo lead — só que sem produto associado.</>
                  )}
                  {' '}O histórico é preservado: leads que entraram por este produto continuam
                  com a referência intacta.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={() => setConfirmandoExclusao(false)} disabled={excluindo}>
                Cancelar
              </Button>
              <Button variant="danger" size="sm" onClick={handleExcluir} disabled={excluindo}>
                {excluindo ? 'Excluindo…' : 'Excluir'}
              </Button>
            </div>
          </div>
        )}

        {/* Aviso de régua não confirmada — o mais importante da tela */}
        {!d.confirmed && (
          <div className="flex items-start gap-3 p-4 rounded-xl border border-warning-line bg-warning-bg">
            <AlertTriangle size={15} className="text-warning flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-warning">Ainda não classifica lead</p>
              <p className="text-xs text-t2 mt-1 leading-relaxed">
                {pendencias.length > 0
                  ? <>Falta definir: <span className="text-t1 font-medium">{pendencias.join(', ')}</span>.</>
                  : 'Confira os valores e marque “Régua conferida” na edição.'}
              </p>
            </div>
          </div>
        )}

        {/* Ficha */}
        <section className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Fact label="Fase" value={DEVELOPMENT_STATUS_LABEL[d.status]} />
          <Fact label="Regime" value={DEVELOPMENT_REGIME_LABEL[d.regime]} />
          <Fact label="Entrega" value={d.deliveryEstimate ? formatMonthYear(d.deliveryEstimate) : 'Não informada'} />
          <Fact label="Valor das unidades" value={faixaValor} />
          <Fact label="Aceita" value={publico || 'Não definido'} />
          <Fact
            label="Tipologias"
            value={d.unitTypes.length > 0 ? `${d.unitTypes.join(', ')} dorm` : 'Não informadas'}
          />
        </section>

        {/* Régua */}
        <section className="flex flex-col gap-4 p-4 rounded-xl bg-s2 border border-line">
          <div className="flex items-center gap-2">
            <Wallet size={13} className="text-brand" />
            <h3 className="font-label text-[11px] font-bold uppercase tracking-[0.14em] text-t2">
              Régua de qualificação
            </h3>
          </div>
          <QualificationScale label="Renda familiar" min={d.incomeMin} ideal={d.incomeIdeal} suffix="/mês" />
          <QualificationScale label="Entrada" min={d.downPaymentMin} ideal={d.downPaymentIdeal} />

          {/* FGTS — o texto muda conforme o regime, e é isso que evita o alerta falso */}
          <div className="flex items-start gap-2 pt-1">
            <Info size={12} className="text-t4 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-t3 leading-relaxed">
              {d.regime === 'pos_chaves'
                ? 'Pós-chaves: o FGTS não entra na qualificação. Lead sem essa resposta não fica incompleto.'
                : fgtsConta
                  ? 'Associativo: o FGTS compõe a entrada e conta na qualificação.'
                  : 'Associativo, mas o FGTS não compõe a entrada — fica no perfil como informação, sem afetar a régua.'}
            </p>
          </div>
        </section>

        {/* Fluxos de pagamento */}
        {d.paymentPlans.length > 0 && (
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Layers size={13} className="text-brand" />
              <h3 className="font-label text-[11px] font-bold uppercase tracking-[0.14em] text-t2">
                Fluxos de pagamento
              </h3>
            </div>
            <div className="flex flex-col gap-2">
              {d.paymentPlans.map((p, i) => (
                <div key={i} className="p-3 rounded-xl border border-line bg-surface">
                  <p className="text-sm font-semibold text-t1">{p.name}</p>
                  {/*
                    `!= null` cobre null E undefined de propósito: o JSON vindo
                    do banco traz `months: null`, e um teste só por `undefined`
                    deixava passar um "+ nullx" na tela.
                  */}
                  <p className="text-xs text-t3 mt-1 tabular-nums">
                    {[
                      p.downPayment != null ? `${formatCurrencyRound(p.downPayment)} de entrada` : null,
                      p.installment != null ? `${formatCurrencyRound(p.installment)}/mês` : null,
                      p.months != null ? `${p.months}x` : null,
                    ].filter(Boolean).join(' + ') || 'Sem valores definidos'}
                  </p>
                  {p.notes && <p className="text-xs text-t4 mt-1">{p.notes}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Vigência e origem */}
        <section className="grid sm:grid-cols-2 gap-4">
          <div className="flex items-start gap-2">
            <CalendarClock size={13} className="text-t4 mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <p className="font-label text-[11px] font-bold uppercase tracking-[0.12em] text-t4">Vigência</p>
              <p className="text-sm text-t1 mt-0.5">
                Desde {formatDate(d.validFrom)}
                {d.validUntil ? ` até ${formatDate(d.validUntil)}` : ''}
              </p>
              <p className="text-xs text-t4 mt-0.5">
                O lead é qualificado pela condição da data em que entrou
              </p>
            </div>
          </div>

          {d.metaFormIds.length > 0 && (
            <div className="flex items-start gap-2">
              <Megaphone size={13} className="text-t4 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <p className="font-label text-[11px] font-bold uppercase tracking-[0.12em] text-t4">Formulários do Meta</p>
                <p className="text-sm text-t1 mt-0.5">
                  {d.metaFormIds.length} {d.metaFormIds.length === 1 ? 'formulário traz' : 'formulários trazem'} lead para cá
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Observações */}
        {d.notes && (
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Building2 size={13} className="text-brand" />
              <h3 className="font-label text-[11px] font-bold uppercase tracking-[0.14em] text-t2">
                Observações
              </h3>
            </div>
            <p className="text-sm text-t2 leading-relaxed whitespace-pre-wrap">{d.notes}</p>
          </section>
        )}

        {/* Histórico da régua */}
        {(d.conditionHistory?.length ?? 0) > 0 && (
          <p className="text-xs text-t4 inline-flex items-center gap-1.5">
            <MapPin size={11} />
            {d.conditionHistory!.length} versão(ões) anterior(es) da régua guardada(s) para auditoria
          </p>
        )}
      </div>
    </Modal>
  )
}
