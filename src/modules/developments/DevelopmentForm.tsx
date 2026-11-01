import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { SidePanel } from '../../components/ui/SidePanel'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { MoneyInput } from '../../components/ui/MoneyInput'
import { QualificationScale } from './QualificationScale'
import { useDevelopmentsStore } from '../../store/useDevelopmentsStore'
import {
  Development, DevelopmentRegime, DevelopmentStatus, PaymentPlan,
  DEVELOPMENT_STATUS_LABEL, DEVELOPMENT_REGIME_LABEL,
} from '../../types'
import { localDateStr } from '../../lib/formatters'
import toast from 'react-hot-toast'

interface DevelopmentFormProps {
  isOpen: boolean
  onClose: () => void
  development?: Development
}

const TIPOLOGIAS = ['1', '2', '3', '4']

/** Seção do formulário — título em texto, sem ícone nem maiúsculas (v10). */
function Section({ title, hint, children }: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-[15px] font-semibold text-t1">{title}</h3>
        {hint && <p className="text-[12.5px] text-t4 mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

export function DevelopmentForm({ isOpen, onClose, development }: DevelopmentFormProps) {
  const { add, update } = useDevelopmentsStore()
  const editando = !!development

  const [name, setName]           = useState(development?.name ?? '')
  const [builder, setBuilder]     = useState(development?.builder ?? '')
  const [region, setRegion]       = useState(development?.region ?? '')
  const [city, setCity]           = useState(development?.city ?? 'Itajaí')
  const [status, setStatus]       = useState<DevelopmentStatus>(development?.status ?? 'lancamento')
  const [regime, setRegime]       = useState<DevelopmentRegime>(development?.regime ?? 'pos_chaves')
  const [delivery, setDelivery]   = useState(development?.deliveryEstimate ?? '')

  const [valueMin, setValueMin]   = useState<number | undefined>(development?.valueMin)
  const [valueMax, setValueMax]   = useState<number | undefined>(development?.valueMax)

  const [incomeMin, setIncomeMin]     = useState<number | undefined>(development?.incomeMin)
  const [incomeIdeal, setIncomeIdeal] = useState<number | undefined>(development?.incomeIdeal)
  const [downMin, setDownMin]         = useState<number | undefined>(development?.downPaymentMin)
  const [downIdeal, setDownIdeal]     = useState<number | undefined>(development?.downPaymentIdeal)

  const [fgtsComposes, setFgtsComposes] = useState(development?.fgtsComposes ?? false)
  const [resident, setResident]         = useState(development?.acceptsResident ?? true)
  const [investor, setInvestor]         = useState(development?.acceptsInvestor ?? true)
  const [unitTypes, setUnitTypes]       = useState<string[]>(development?.unitTypes ?? [])

  const [plans, setPlans] = useState<PaymentPlan[]>(development?.paymentPlans ?? [])

  const [validFrom, setValidFrom]   = useState(development?.validFrom ?? localDateStr())
  const [validUntil, setValidUntil] = useState(development?.validUntil ?? '')
  const [confirmed, setConfirmed]   = useState(development?.confirmed ?? false)
  const [notes, setNotes]           = useState(development?.notes ?? '')

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [vigencia, setVigencia] = useState(Boolean(development?.validUntil || development?.notes))

  function toggleTipologia(t: string) {
    setUnitTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t].sort())
  }

  function addPlan() {
    setPlans(prev => [...prev, { name: `Fluxo ${prev.length + 1}` }])
  }
  function updatePlan(i: number, patch: Partial<PaymentPlan>) {
    setPlans(prev => prev.map((p, idx) => idx === i ? { ...p, ...patch } : p))
  }
  function removePlan(i: number) {
    setPlans(prev => prev.filter((_, idx) => idx !== i))
  }

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!name.trim()) e.name = 'Informe o nome do empreendimento'
    if (incomeMin !== undefined && incomeIdeal !== undefined && incomeIdeal < incomeMin) {
      e.incomeIdeal = 'A renda ideal precisa ser maior que a mínima'
    }
    if (downMin !== undefined && downIdeal !== undefined && downIdeal < downMin) {
      e.downIdeal = 'A entrada ideal precisa ser maior que a mínima'
    }
    if (valueMin !== undefined && valueMax !== undefined && valueMax < valueMin) {
      e.valueMax = 'O valor máximo precisa ser maior que o mínimo'
    }
    if (!resident && !investor) {
      e.publico = 'O produto precisa aceitar pelo menos um público'
    }
    // Confirmar a régua é o que libera a classificação de lead rodar em cima
    // dela. Deixar confirmar sem os dois mínimos criaria régua "válida" que não
    // decide nada.
    if (confirmed && incomeMin === undefined && downMin === undefined) {
      e.confirmed = 'Para confirmar, informe pelo menos a renda ou a entrada mínima'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const pilula = (ativo: boolean) =>
    `px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors cursor-pointer ${
      ativo ? 'bg-brand-fill text-brand-fill-text' : 'bg-s2 text-t2 hover:bg-s3'}`

  const sujo = !editando && Boolean(name.trim() || builder.trim() || region.trim() || incomeMin !== undefined
    || downMin !== undefined || valueMin !== undefined || plans.length || notes.trim())

  async function handleSubmit() {
    if (!validate() || saving) return
    setSaving(true)
    const payload = {
      name: name.trim(),
      builder: builder.trim() || undefined,
      region: region.trim() || undefined,
      city: city.trim() || 'Itajaí',
      status, regime,
      deliveryEstimate: delivery || undefined,
      valueMin, valueMax,
      incomeMin, incomeIdeal,
      downPaymentMin: downMin, downPaymentIdeal: downIdeal,
      fgtsComposes,
      acceptsResident: resident,
      acceptsInvestor: investor,
      unitTypes,
      paymentPlans: plans.filter(p => p.name.trim()),
      validFrom,
      validUntil: validUntil || undefined,
      metaFormIds: development?.metaFormIds ?? [],
      confirmed,
      active: development?.active ?? true,
      notes: notes.trim() || undefined,
    }
    try {
      if (editando) {
        await update(development.id, payload)
        toast.success('Lançamento atualizado')
      } else {
        await add(payload)
        toast.success('Lançamento cadastrado')
      }
      onClose()
    } catch {
      // O store já avisou o usuário e manteve a tela como estava.
    } finally {
      setSaving(false)
    }
  }

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={editando ? 'Editar lançamento' : 'Novo lançamento'}
      size="lg"
      confirmarSaida={sujo && !saving}
      footer={
        <div className="flex items-center justify-between gap-3 w-full">
          <p className={`text-[12.5px] hidden sm:block ${confirmed ? 'text-success' : 'text-t4'}`}>
            {confirmed ? 'Régua conferida — já qualifica lead' : 'Régua não conferida — ainda não qualifica ninguém'}
          </p>
          <div className="flex gap-2 ml-auto">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="button" onClick={handleSubmit} carregando={saving}>
              {editando ? 'Salvar alterações' : 'Cadastrar lançamento'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-8">

        {/* Nome — o título */}
        <div className="flex flex-col gap-4">
          <div>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Nome do empreendimento"
              aria-label="Nome do empreendimento"
              aria-invalid={errors.name ? true : undefined}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- o painel abre para cadastrar: o cursor vai para o nome
              autoFocus={!editando}
              className="campo-titulo campo-livre"
            />
            {errors.name
              ? <p className="text-xs text-error mt-0.5" role="alert">{errors.name}</p>
              : <p className="text-[13px] text-t4 mt-0.5">A régua daqui é o que qualifica o lead depois</p>}
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <Input label="Construtora" value={builder} onChange={e => setBuilder(e.target.value)} placeholder="Opcional" />
            <Input
              label="Região ou bairro" value={region} onChange={e => setRegion(e.target.value)}
              placeholder="Fazenda" title="Cruza com a preferência de região do lead"
            />
            <Input label="Cidade" value={city} onChange={e => setCity(e.target.value)} />
          </div>

          <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
            <div className="flex flex-col gap-1.5">
              <span className="rotulo-campo">Fase da obra</span>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Fase da obra">
                {(Object.keys(DEVELOPMENT_STATUS_LABEL) as DevelopmentStatus[]).map(st => (
                  <button key={st} type="button" role="radio" aria-checked={status === st}
                    onClick={() => setStatus(st)} className={pilula(status === st)}>
                    {DEVELOPMENT_STATUS_LABEL[st]}
                  </button>
                ))}
              </div>
            </div>
            <Input label="Entrega" type="month" value={delivery} onChange={e => setDelivery(e.target.value)} />
          </div>
        </div>

        {/* ── Regime ─────────────────────────────────────────────── */}
        <Section title="Regime da obra">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Regime da obra">
            {(Object.keys(DEVELOPMENT_REGIME_LABEL) as DevelopmentRegime[]).map(r => (
              <button key={r} type="button" role="radio" aria-checked={regime === r}
                onClick={() => setRegime(r)} className={pilula(regime === r)}>
                {DEVELOPMENT_REGIME_LABEL[r]}
              </button>
            ))}
          </div>

          {/* Vale para qualquer regime: o que importa é se o saldo abate a
              entrada, não como a obra é financiada. No Belíssimo o
              financiamento é imediato e o FGTS entra sem ser associativo. */}
          <div className="flex items-start justify-between gap-4">
            <span className="min-w-0">
              <span className="block text-[14px] font-medium text-t1">O FGTS compõe a entrada</span>
              <span className="block text-[12.5px] text-t4 mt-0.5">
                {fgtsComposes
                  ? 'O saldo entra na conta da entrada e o sistema pergunta por ele.'
                  : 'O sistema ignora o FGTS: não pergunta, não cobra e não marca o lead como incompleto.'}
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={fgtsComposes}
              aria-label="O FGTS compõe a entrada"
              onClick={() => setFgtsComposes(v => !v)}
              className={`relative w-10 h-6 rounded-full transition-colors shrink-0 cursor-pointer mt-0.5 ${fgtsComposes ? 'bg-brand-fill' : 'bg-s3'}`}
            >
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${fgtsComposes ? 'left-5' : 'left-1'}`} />
            </button>
          </div>
        </Section>

        {/* ── Régua de qualificação ──────────────────────────────── */}
        <Section
          title="Régua de qualificação"
          hint="Mínimo é onde começa a ser possível. Ideal é onde passa com folga."
        >
          <div className="grid sm:grid-cols-2 gap-3">
            <MoneyInput
              label="Renda familiar mínima" value={incomeMin} onChange={setIncomeMin}
              placeholder="5.000" hint="Abaixo disso, Difícil"
            />
            <MoneyInput
              label="Renda familiar ideal" value={incomeIdeal} onChange={setIncomeIdeal}
              placeholder="10.000" error={errors.incomeIdeal} hint="Acima disso, Ideal"
            />
          </div>
          <QualificationScale label="Renda familiar" min={incomeMin} ideal={incomeIdeal} suffix="/mês" />

          <div className="grid sm:grid-cols-2 gap-3 mt-2">
            <MoneyInput
              label="Entrada mínima" value={downMin} onChange={setDownMin}
              placeholder="15.000" hint="Abaixo disso, Difícil"
            />
            <MoneyInput
              label="Entrada ideal" value={downIdeal} onChange={setDownIdeal}
              placeholder="30.000" error={errors.downIdeal} hint="Acima disso, Ideal"
            />
          </div>
          <QualificationScale label="Entrada" min={downMin} ideal={downIdeal} />

          {/* Público */}
          <div className="flex flex-col gap-2 mt-2">
            <span className="rotulo-campo">Aceita quem</span>
            <div className="flex flex-wrap gap-1.5">
              {[
                { on: resident, set: setResident, label: 'Vai morar' },
                { on: investor, set: setInvestor, label: 'Investidor' },
              ].map(({ on, set, label }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => set(!on)}
                  aria-pressed={on}
                  className={pilula(on)}
                >
                  {label}
                </button>
              ))}
            </div>
            {errors.publico && <p className="text-xs text-error" role="alert">{errors.publico}</p>}
          </div>

          {/* Tipologias */}
          <div className="flex flex-col gap-2 mt-2">
            <span className="rotulo-campo">Tipologias</span>
            <div className="flex flex-wrap gap-1.5">
              {TIPOLOGIAS.map(t => {
                const on = unitTypes.includes(t)
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTipologia(t)}
                    aria-pressed={on}
                    className={pilula(on)}
                  >
                    {t} {t === '1' ? 'dorm' : 'dorms'}
                  </button>
                )
              })}
            </div>
            <p className="text-[12px] text-t4">Informativo: tipologia nunca reprova lead.</p>
          </div>

          {/* Faixa de valor */}
          <div className="grid sm:grid-cols-2 gap-3 mt-2">
            <MoneyInput label="Unidade mais barata" value={valueMin} onChange={setValueMin} placeholder="517.000" />
            <MoneyInput label="Unidade mais cara" value={valueMax} onChange={setValueMax} placeholder="681.000" error={errors.valueMax} />
          </div>
        </Section>

        {/* ── Fluxos de pagamento ────────────────────────────────── */}
        <Section
          title="Fluxos de pagamento"
          hint="Cada fluxo tem a própria entrada — é o que permite dizer “não bate no A, bate no B”"
        >
          <div className="flex flex-col gap-2">
            {plans.map((p, i) => (
              <div key={i} className="flex flex-col gap-2.5 pt-3 first:pt-0 border-t border-line first:border-0">
                <div className="flex items-center gap-2">
                  <input
                    value={p.name}
                    onChange={e => updatePlan(i, { name: e.target.value })}
                    placeholder="Nome do fluxo"
                    aria-label={`Nome do fluxo ${i + 1}`}
                    className="flex-1 bg-transparent border-0 border-b border-line-input px-0 py-1 text-sm font-semibold text-t1
                               focus:outline-none focus:border-brand transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => removePlan(i)}
                    aria-label={`Remover ${p.name || `fluxo ${i + 1}`}`}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-t4 hover:bg-error-bg hover:text-error transition-colors cursor-pointer flex-shrink-0"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="grid sm:grid-cols-3 gap-2">
                  <MoneyInput label="Entrada" value={p.downPayment} onChange={v => updatePlan(i, { downPayment: v })} placeholder="30.000" />
                  <MoneyInput label="Parcela mensal" value={p.installment} onChange={v => updatePlan(i, { installment: v })} placeholder="1.500" />
                  <Input
                    label="Nº de parcelas" inputMode="numeric"
                    value={p.months?.toString() ?? ''}
                    onChange={e => {
                      const d = e.target.value.replace(/\D/g, '')
                      updatePlan(i, { months: d ? parseInt(d, 10) : undefined })
                    }}
                    placeholder="60"
                  />
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={addPlan}
            className="self-start inline-flex items-center gap-1.5 text-[13px] font-medium text-t3 hover:text-t1 cursor-pointer">
            <Plus size={13} strokeWidth={2} aria-hidden /> Fluxo de pagamento
          </button>
        </Section>

        {vigencia ? (
          <div className="flex flex-col gap-8 animate-in fade-in duration-150">
        {/* ── Vigência ───────────────────────────────────────────── */}
        <Section
          title="Vigência da condição"
          hint="O lead é qualificado pela condição que valia no dia em que entrou"
        >
          <div className="grid sm:grid-cols-2 gap-3">
            <Input label="Válida desde" type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)} />
            <Input
              label="Válida até" type="date" value={validUntil}
              onChange={e => setValidUntil(e.target.value)}
              hint="Em branco = sem prazo"
            />
          </div>
          {editando && (development.conditionHistory?.length ?? 0) > 0 && (
            <p className="text-xs text-t4">
              {development.conditionHistory!.length} versão(ões) anterior(es) desta régua guardada(s).
            </p>
          )}
        </Section>

        {/* ── Observações ────────────────────────────────────────── */}
        <Section title="Observações">
          <Textarea
            value={notes} onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="Condição negociada, particularidades da tabela, o que confirmar…"
          />
          {editando && development.metaFormIds.length > 0 && (
            <p className="text-xs text-t4">
              {development.metaFormIds.length} formulário(s) do Meta apontam para este produto.
            </p>
          )}
        </Section>

          </div>
        ) : (
          <button type="button" onClick={() => setVigencia(true)}
            className="self-start text-[13px] font-medium text-t3 hover:text-t1 cursor-pointer">
            + Vigência e observações
            <span className="text-t4 font-normal"> · válida desde {validFrom.split('-').reverse().join('/')}</span>
          </button>
        )}

        {/* ── Confirmação ────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 pt-5 border-t border-line">
          <span className="min-w-0">
            <span className={`block text-[14px] font-semibold ${confirmed ? 'text-success' : 'text-t1'}`}>
              Régua conferida e correta
            </span>
            <span className="block text-[12.5px] text-t4 mt-0.5 leading-relaxed">
              Valores pré-preenchidos vêm dos formulários do Meta e das vendas registradas — são
              inferência, não condição oficial. Nada classifica lead enquanto isto estiver desligado.
            </span>
            {errors.confirmed && (
              <span className="block text-xs text-error mt-1" role="alert">{errors.confirmed}</span>
            )}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={confirmed}
            aria-label="Régua conferida e correta"
            onClick={() => setConfirmed(v => !v)}
            className={`relative w-10 h-6 rounded-full transition-colors shrink-0 cursor-pointer mt-0.5 ${confirmed ? 'bg-success' : 'bg-s3'}`}
          >
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${confirmed ? 'left-5' : 'left-1'}`} />
          </button>
        </div>
      </div>
    </SidePanel>
  )
}
