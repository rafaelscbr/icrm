import { useState, useRef, useCallback } from 'react'
import { Calculator, Download, AlertCircle, TrendingDown } from 'lucide-react'
import { toPng } from 'html-to-image'
import toast from 'react-hot-toast'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Button } from '../../components/ui/Button'
import { calcularFluxo, FluxoInput, ReforcoPeriodo } from './calc'
import { ProposalCard } from './ProposalCard'

const DEFAULT: FluxoInput & { empreendimento: string; cliente: string } = {
  empreendimento: 'Porto Velas 3D',
  cliente: '',
  valorTotal:   758584.61,
  pctChaves:    33,
  entradaQtd:   1,
  entradaValor: 36412.06,
  reforcoQtd:   9,
  reforcoValor: 8000,
  reforcoPeriodo: 'semestral',
  parcelasQtd:  56,
}

export function SimuladorPage() {
  const [empreendimento, setEmpreendimento] = useState(DEFAULT.empreendimento)
  const [cliente,        setCliente]        = useState(DEFAULT.cliente)
  const [form, setForm] = useState<FluxoInput>({
    valorTotal:   DEFAULT.valorTotal,
    pctChaves:    DEFAULT.pctChaves,
    entradaQtd:   DEFAULT.entradaQtd,
    entradaValor: DEFAULT.entradaValor,
    reforcoQtd:   DEFAULT.reforcoQtd,
    reforcoValor: DEFAULT.reforcoValor,
    reforcoPeriodo: DEFAULT.reforcoPeriodo,
    parcelasQtd:  DEFAULT.parcelasQtd,
  })
  const [entradaModo, setEntradaModo] = useState<'valor' | 'pct'>('valor')
  const [entradaPct,  setEntradaPct]  = useState(5)
  const [exporting, setExporting] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  // Em modo %, o valor da entrada é derivado do valor total do imóvel
  const entradaValorEfetivo = entradaModo === 'pct'
    ? form.valorTotal * (entradaPct / 100)
    : form.entradaValor

  const inputEfetivo: FluxoInput = { ...form, entradaValor: entradaValorEfetivo }
  const result = calcularFluxo(inputEfetivo)

  const set = (field: keyof FluxoInput) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value)
    setForm(prev => ({ ...prev, [field]: isNaN(v) ? 0 : v }))
  }

  const handleExport = useCallback(async () => {
    if (!cardRef.current || !result.valido) return
    setExporting(true)
    try {
      const slug = empreendimento.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-') || 'simulacao'
      const url  = await toPng(cardRef.current, { pixelRatio: 3, cacheBust: true })
      const a    = document.createElement('a')
      a.download = `fluxo-${slug}.png`
      a.href = url
      a.click()
      toast.success('Proposta baixada com sucesso!')
    } catch {
      toast.error('Erro ao gerar imagem. Tente novamente.')
    } finally {
      setExporting(false)
    }
  }, [result.valido, empreendimento])

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Page header */}
      <div className="px-6 py-5 border-b border-line flex items-center gap-3 flex-shrink-0">
        <div className="w-9 h-9 rounded-xl bg-brand/15 flex items-center justify-center">
          <Calculator size={18} className="text-brand" />
        </div>
        <div>
          <h1 className="text-t1 font-bold text-lg leading-tight">Simulador de Fluxo de Pagamento</h1>
          <p className="text-t3 text-sm">Preencha os campos e baixe a proposta pronta para enviar ao cliente</p>
        </div>
      </div>

      <div className="flex-1 p-6 min-h-0">
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_460px] gap-8 items-start max-w-6xl mx-auto">

          {/* ── Formulário ── */}
          <div className="space-y-5">

            {/* Identificação */}
            <Section title="Identificação">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Empreendimento / Unidade"
                  value={empreendimento}
                  onChange={e => setEmpreendimento(e.target.value)}
                  placeholder="Ex: Porto Velas 3D"
                />
                <Input
                  label="Nome do cliente (opcional)"
                  value={cliente}
                  onChange={e => setCliente(e.target.value)}
                  placeholder="Ex: João da Silva"
                />
              </div>
            </Section>

            {/* Valores */}
            <Section title="Valores do empreendimento">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <CurrencyInput
                  label="Valor Total"
                  value={form.valorTotal}
                  onChange={v => setForm(prev => ({ ...prev, valorTotal: v }))}
                />
                <Input
                  label="Porcentagem até as chaves (%)"
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  value={form.pctChaves || ''}
                  onChange={set('pctChaves')}
                  placeholder="33"
                />
              </div>

              {/* Derivados */}
              <div className="grid grid-cols-2 gap-3 mt-1">
                <DerivedBox
                  label="Valor até as chaves"
                  value={fmtBRL(result.valorAteChaves)}
                  accent
                />
                <DerivedBox
                  label="Saldo devedor"
                  value={fmtBRL(result.saldoDevedor)}
                  icon={<TrendingDown size={13} className="text-t3" />}
                />
              </div>
            </Section>

            {/* Pagamento */}
            <Section title="Condições de pagamento até as chaves">

              {/* Entrada */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-t3 text-xs font-medium">Entrada</p>
                  {/* Toggle R$ fixo / % do total */}
                  <div className="flex rounded-lg border border-line overflow-hidden">
                    {([
                      { modo: 'valor', label: 'R$ fixo' },
                      { modo: 'pct',   label: '% do total' },
                    ] as const).map(({ modo, label }) => (
                      <button
                        key={modo}
                        type="button"
                        onClick={() => setEntradaModo(modo)}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                          entradaModo === modo
                            ? 'bg-brand/15 text-brand'
                            : 'bg-surface text-t3 hover:text-t1'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-[110px_1fr] gap-3">
                  <Input
                    label="Quantidade"
                    type="number"
                    step="1"
                    min="1"
                    value={form.entradaQtd || ''}
                    onChange={set('entradaQtd')}
                  />
                  {entradaModo === 'valor' ? (
                    <CurrencyInput
                      label="Valor por entrada"
                      value={form.entradaValor}
                      onChange={v => setForm(prev => ({ ...prev, entradaValor: v }))}
                    />
                  ) : (
                    <Input
                      label="Porcentagem do valor total (%)"
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      value={entradaPct || ''}
                      onChange={e => {
                        const v = parseFloat(e.target.value)
                        setEntradaPct(isNaN(v) ? 0 : v)
                      }}
                    />
                  )}
                </div>
                {entradaModo === 'pct' && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-t3">
                    <span>{entradaPct}% de {fmtBRL(form.valorTotal)} =</span>
                    <span className="font-semibold text-brand">{fmtBRL(entradaValorEfetivo)}</span>
                    {form.entradaQtd > 1 && <span>por entrada</span>}
                  </div>
                )}
              </div>

              <div className="w-full h-px bg-line" />

              {/* Reforço */}
              <div>
                <p className="text-t3 text-xs font-medium mb-2.5">Reforço</p>
                <div className="grid grid-cols-[110px_1fr] gap-3">
                  <Input
                    label="Quantidade"
                    type="number"
                    step="1"
                    min="0"
                    value={form.reforcoQtd}
                    onChange={set('reforcoQtd')}
                  />
                  <CurrencyInput
                    label="Valor por reforço"
                    value={form.reforcoValor}
                    onChange={v => setForm(prev => ({ ...prev, reforcoValor: v }))}
                    disabled={form.reforcoQtd === 0}
                  />
                </div>
                <div className="mt-3">
                  <Select
                    label="Periodicidade do reforço"
                    value={form.reforcoPeriodo}
                    onChange={e => setForm(prev => ({ ...prev, reforcoPeriodo: e.target.value as ReforcoPeriodo }))}
                    disabled={form.reforcoQtd === 0}
                  >
                    <option value="semestral">Semestral</option>
                    <option value="anual">Anual</option>
                  </Select>
                </div>
              </div>

              <div className="w-full h-px bg-line" />

              {/* Parcelas */}
              <div>
                <p className="text-t3 text-xs font-medium mb-2.5">Parcelas mensais</p>
                <div className="grid grid-cols-[110px_1fr] gap-3 items-start">
                  <Input
                    label="Quantidade"
                    type="number"
                    step="1"
                    min="1"
                    value={form.parcelasQtd || ''}
                    onChange={set('parcelasQtd')}
                  />
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-t2">Valor calculado</label>
                    <div className={`w-full rounded-lg px-3 py-2.5 min-h-[42px] text-sm flex items-center justify-between border transition-all ${
                      result.valido
                        ? 'bg-success-bg border-success-line text-success'
                        : 'bg-s2 border-line text-t3'
                    }`}>
                      <span className="font-bold text-base tracking-tight">
                        {result.valido ? fmtBRL(result.parcelaValor) : '—'}
                      </span>
                      <span className="text-xs opacity-60 ml-2">por mês</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Aviso de erro */}
              {!result.valido && result.erro && (
                <div className="flex items-center gap-2.5 text-sm rounded-xl px-4 py-3 bg-warning-bg border border-warning-line text-warning">
                  <AlertCircle size={15} className="flex-shrink-0" />
                  <span>{result.erro}</span>
                </div>
              )}
            </Section>
          </div>

          {/* ── Preview + Export ── */}
          <div className="flex flex-col items-center gap-4 xl:sticky xl:top-6">
            <div className="flex items-center justify-between w-full">
              <p className="text-t3 text-xs uppercase tracking-widest">Preview da proposta</p>
              <p className="text-t4 text-xs">como o cliente recebe</p>
            </div>

            {/* Card exportável */}
            <div className="flex justify-center">
              <ProposalCard
                ref={cardRef}
                input={inputEfetivo}
                result={result}
                empreendimento={empreendimento}
                cliente={cliente}
              />
            </div>

            <Button
              variant="primary"
              size="lg"
              onClick={handleExport}
              disabled={!result.valido || exporting}
              className="w-full"
            >
              <Download size={16} />
              {exporting ? 'Gerando imagem…' : 'Baixar proposta (PNG)'}
            </Button>

            <p className="text-t4 text-xs text-center leading-relaxed">
              A imagem é gerada em alta resolução (3×) e fica ótima para enviar no WhatsApp ou e-mail.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
}

// Input monetário com máscara R$ — digita só números, formata como centavos.
// Ex: digitar "758458461" exibe "R$ 758.584,61" e entrega 758584.61.
function CurrencyInput({ label, value, onChange, disabled }: {
  label: string
  value: number
  onChange: (v: number) => void
  disabled?: boolean
}) {
  const display = value
    ? `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : ''

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '')
    onChange(digits ? parseInt(digits, 10) / 100 : 0)
  }

  return (
    <Input
      label={label}
      inputMode="numeric"
      value={display}
      onChange={handleChange}
      placeholder="R$ 0,00"
      disabled={disabled}
    />
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface rounded-2xl border border-line p-5 space-y-4">
      <h2 className="text-t3 text-xs font-semibold uppercase tracking-widest">{title}</h2>
      {children}
    </div>
  )
}

function DerivedBox({ label, value, accent = false, icon }: {
  label: string; value: string; accent?: boolean; icon?: React.ReactNode
}) {
  return (
    <div className={`rounded-xl px-4 py-3 border ${accent ? 'bg-brand/10 border-brand/25' : 'bg-s2 border-line'}`}>
      <p className="text-t3 text-xs mb-1 flex items-center gap-1.5">
        {icon}
        {label}
      </p>
      <p className={`font-bold text-sm ${accent ? 'text-brand' : 'text-t1'}`}>{value}</p>
    </div>
  )
}
