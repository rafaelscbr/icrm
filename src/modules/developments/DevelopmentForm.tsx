import { useState } from 'react'
import { Plus, Trash2, Info, CheckCircle2, Building2, Ruler, Wallet, CalendarClock, Link2 } from 'lucide-react'
import { SidePanel } from '../../components/ui/SidePanel'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
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

/** Cabeçalho de seção — dá ritmo ao formulário longo sem virar wizard. */
function Section({ icon: Icon, title, hint, children }: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <Icon size={14} className="text-brand translate-y-0.5" />
        <div className="min-w-0">
          <h3 className="font-label text-[11px] font-bold uppercase tracking-[0.14em] text-t2">{title}</h3>
          {hint && <p className="text-xs text-t4 mt-0.5">{hint}</p>}
        </div>
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

  async function handleSubmit() {
    if (!validate()) return
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
      title={editando ? `Editar ${development.name}` : 'Novo lançamento'}
      subtitle="A régua daqui é o que qualifica o lead depois"
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-3 w-full">
          <p className="text-xs text-t4 hidden sm:block">
            {confirmed
              ? 'Régua confirmada — pode ser usada para qualificar lead'
              : 'Enquanto não confirmar, a régua não classifica ninguém'}
          </p>
          <div className="flex gap-2 ml-auto">
            <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? 'Salvando…' : editando ? 'Salvar' : 'Cadastrar'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-7">

        {/* ── Identificação ──────────────────────────────────────── */}
        <Section icon={Building2} title="Identificação">
          <div className="grid sm:grid-cols-2 gap-3">
            <Input
              label="Nome do empreendimento" required
              value={name} onChange={e => setName(e.target.value)}
              error={errors.name} placeholder="Porto Velas"
            />
            <Input
              label="Construtora"
              value={builder} onChange={e => setBuilder(e.target.value)}
              placeholder="Opcional"
            />
            <Input
              label="Região / bairro"
              value={region} onChange={e => setRegion(e.target.value)}
              placeholder="Fazenda"
              hint="Usada para cruzar com a preferência de região do lead"
            />
            <Input
              label="Cidade"
              value={city} onChange={e => setCity(e.target.value)}
            />
            <Select label="Fase da obra" value={status} onChange={e => setStatus(e.target.value as DevelopmentStatus)}>
              {(Object.keys(DEVELOPMENT_STATUS_LABEL) as DevelopmentStatus[]).map(s => (
                <option key={s} value={s}>{DEVELOPMENT_STATUS_LABEL[s]}</option>
              ))}
            </Select>
            <Input
              label="Previsão de entrega" type="month"
              value={delivery} onChange={e => setDelivery(e.target.value)}
            />
          </div>
        </Section>

        {/* ── Regime ─────────────────────────────────────────────── */}
        <Section
          icon={Ruler}
          title="Regime da obra"
          hint="Define se o FGTS entra na conta"
        >
          <div className="grid sm:grid-cols-2 gap-2">
            {(Object.keys(DEVELOPMENT_REGIME_LABEL) as DevelopmentRegime[]).map(r => {
              const ativo = regime === r
              return (
                <button
                  key={r}
                  onClick={() => setRegime(r)}
                  aria-pressed={ativo}
                  className={`text-left p-3 rounded-xl border transition-all duration-150 cursor-pointer
                    ${ativo
                      ? 'border-brand bg-brand-tint shadow-brand'
                      : 'border-line bg-surface hover:border-line-strong'}`}
                >
                  <span className={`block text-sm font-semibold ${ativo ? 'text-brand-text' : 'text-t1'}`}>
                    {DEVELOPMENT_REGIME_LABEL[r]}
                  </span>
                  <span className="block text-xs text-t3 mt-0.5">
                    {r === 'associativo'
                      ? 'FGTS pode compor a entrada'
                      : 'FGTS só no financiamento — não é critério'}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Vale para qualquer regime: o que importa é se o saldo abate a
              entrada, não como a obra é financiada. No Belíssimo o
              financiamento é imediato e o FGTS entra sem ser associativo. */}
          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-s2 border border-line cursor-pointer">
              <input
                type="checkbox"
                checked={fgtsComposes}
                onChange={e => setFgtsComposes(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[var(--brand)] cursor-pointer"
              />
              <span className="min-w-0">
                <span className="block text-sm text-t1 font-medium">O FGTS compõe a entrada</span>
                <span className="block text-xs text-t3 mt-0.5">
                  Marcado, o saldo entra na conta da entrada do lead. Desmarcado, o FGTS
                  aparece no perfil mas não muda a qualificação.
                </span>
              </span>
            </label>
          )}

          {!fgtsComposes && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-info-bg border border-info-line">
              <Info size={13} className="text-info flex-shrink-0 mt-0.5" />
              <p className="text-xs text-info">
                Com o FGTS fora da conta, o sistema o ignora por completo — não pergunta,
                não cobra e não marca o lead como incompleto por não ter respondido.
              </p>
            </div>
          )}
        </Section>

        {/* ── Régua de qualificação ──────────────────────────────── */}
        <Section
          icon={Wallet}
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
          <div className="p-3 rounded-xl bg-s2 border border-line">
            <QualificationScale label="Renda familiar" min={incomeMin} ideal={incomeIdeal} suffix="/mês" />
          </div>

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
          <div className="p-3 rounded-xl bg-s2 border border-line">
            <QualificationScale label="Entrada" min={downMin} ideal={downIdeal} />
          </div>

          {/* Público */}
          <div className="flex flex-col gap-2 mt-2">
            <p className="text-xs font-medium text-t2">Aceita quem</p>
            <div className="flex flex-wrap gap-2">
              {[
                { on: resident, set: setResident, label: 'Vai morar' },
                { on: investor, set: setInvestor, label: 'Investidor' },
              ].map(({ on, set, label }) => (
                <button
                  key={label}
                  onClick={() => set(!on)}
                  aria-pressed={on}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all duration-150 cursor-pointer
                    ${on
                      ? 'bg-brand-tint text-brand-text border-brand/25'
                      : 'bg-surface text-t3 border-line hover:border-line-strong'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {errors.publico && <p className="text-xs text-error" role="alert">{errors.publico}</p>}
          </div>

          {/* Tipologias */}
          <div className="flex flex-col gap-2 mt-2">
            <p className="text-xs font-medium text-t2">Tipologias disponíveis</p>
            <div className="flex flex-wrap gap-2">
              {TIPOLOGIAS.map(t => {
                const on = unitTypes.includes(t)
                return (
                  <button
                    key={t}
                    onClick={() => toggleTipologia(t)}
                    aria-pressed={on}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all duration-150 cursor-pointer
                      ${on
                        ? 'bg-brand-tint text-brand-text border-brand/25'
                        : 'bg-surface text-t3 border-line hover:border-line-strong'}`}
                  >
                    {t} {t === '1' ? 'dorm' : 'dorms'}
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-t4">
              Informativo — tipologia nunca reprova lead, entra no perfil como preferência.
            </p>
          </div>

          {/* Faixa de valor */}
          <div className="grid sm:grid-cols-2 gap-3 mt-2">
            <MoneyInput label="Unidade mais barata" value={valueMin} onChange={setValueMin} placeholder="517.000" />
            <MoneyInput label="Unidade mais cara" value={valueMax} onChange={setValueMax} placeholder="681.000" error={errors.valueMax} />
          </div>
        </Section>

        {/* ── Fluxos de pagamento ────────────────────────────────── */}
        <Section
          icon={Wallet}
          title="Fluxos de pagamento"
          hint="Cada fluxo tem a própria entrada — é o que permite dizer “não bate no A, bate no B”"
        >
          {plans.length === 0 && (
            <p className="text-xs text-t4">Nenhum fluxo cadastrado.</p>
          )}
          <div className="flex flex-col gap-2">
            {plans.map((p, i) => (
              <div key={i} className="p-3 rounded-xl bg-s2 border border-line flex flex-col gap-2.5">
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
          <Button variant="secondary" size="sm" onClick={addPlan} className="self-start">
            <Plus size={13} /> Adicionar fluxo
          </Button>
        </Section>

        {/* ── Vigência ───────────────────────────────────────────── */}
        <Section
          icon={CalendarClock}
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
        <Section icon={Link2} title="Observações">
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

        {/* ── Confirmação ────────────────────────────────────────── */}
        <label
          className={`flex items-start gap-2.5 p-4 rounded-xl border cursor-pointer transition-colors
            ${confirmed ? 'bg-success-bg border-success-line' : 'bg-warning-bg border-warning-line'}`}
        >
          <input
            type="checkbox"
            checked={confirmed}
            onChange={e => setConfirmed(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-[var(--brand)] cursor-pointer"
          />
          <span className="min-w-0">
            <span className={`flex items-center gap-1.5 text-sm font-semibold ${confirmed ? 'text-success' : 'text-warning'}`}>
              {confirmed && <CheckCircle2 size={13} />}
              Régua conferida e correta
            </span>
            <span className="block text-xs text-t3 mt-0.5">
              Os valores pré-preenchidos vieram das faixas dos formulários do Meta e das vendas
              já registradas — são inferência, não condição oficial. Nada classifica lead
              enquanto isto estiver desmarcado.
            </span>
            {errors.confirmed && (
              <span className="block text-xs text-error mt-1" role="alert">{errors.confirmed}</span>
            )}
          </span>
        </label>
      </div>
    </SidePanel>
  )
}
