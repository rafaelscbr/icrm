import { useState, useRef, useCallback, Ref, ReactNode } from 'react'
import { Download, AlertCircle } from 'lucide-react'
import { toPng } from 'html-to-image'
import toast from 'react-hot-toast'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { Button } from '../../../components/ui/Button'
import { PagamentoBase, ReforcoPeriodo, SharedFields } from './types'

// ── Formatação ────────────────────────────────────────────────────────────────

export function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
}

// ── Átomos de formulário ──────────────────────────────────────────────────────

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-surface rounded-2xl border border-line p-5 space-y-4">
      <h2 className="text-t3 text-xs font-semibold uppercase tracking-widest">{title}</h2>
      {children}
    </div>
  )
}

// Input monetário com máscara R$ — digita só números, formata como centavos.
// Ex: digitar "758458461" exibe "R$ 758.584,61" e entrega 758584.61.
export function CurrencyInput({ label, value, onChange, disabled }: {
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

export function DerivedBox({ label, value, accent = false, icon }: {
  label: string; value: string; accent?: boolean; icon?: ReactNode
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

// ── Seção de identificação (compartilhada entre modos) ────────────────────────

export function IdentificacaoSection({ shared, onShared }: {
  shared: SharedFields
  onShared: (patch: Partial<SharedFields>) => void
}) {
  return (
    <Section title="Identificação">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Empreendimento / Unidade"
          value={shared.empreendimento}
          onChange={e => onShared({ empreendimento: e.target.value })}
          placeholder="Ex: Porto Velas 3D"
        />
        <Input
          label="Nome do cliente (opcional)"
          value={shared.cliente}
          onChange={e => onShared({ cliente: e.target.value })}
          placeholder="Ex: João da Silva"
        />
      </div>
    </Section>
  )
}

// ── Seção de pagamento (entrada + reforço + parcelas) — idêntica entre modos ──

export type EntradaModo = 'valor' | 'pct'

interface PagamentoSectionProps {
  title: string
  base: PagamentoBase
  onChange: (patch: Partial<PagamentoBase>) => void
  valorTotal: number
  entradaModo: EntradaModo
  setEntradaModo: (m: EntradaModo) => void
  entradaPct: number
  setEntradaPct: (v: number) => void
  entradaValorEfetivo: number
  parcelaValor: number
  valido: boolean
  erro?: string
}

export function PagamentoSection({
  title, base, onChange, valorTotal,
  entradaModo, setEntradaModo, entradaPct, setEntradaPct, entradaValorEfetivo,
  parcelaValor, valido, erro,
}: PagamentoSectionProps) {
  const num = (field: keyof PagamentoBase) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value)
    onChange({ [field]: isNaN(v) ? 0 : v })
  }

  return (
    <Section title={title}>

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
            value={base.entradaQtd || ''}
            onChange={num('entradaQtd')}
          />
          {entradaModo === 'valor' ? (
            <CurrencyInput
              label="Valor por entrada"
              value={base.entradaValor}
              onChange={v => onChange({ entradaValor: v })}
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
            <span>{entradaPct}% de {fmtBRL(valorTotal)} =</span>
            <span className="font-semibold text-brand">{fmtBRL(entradaValorEfetivo)}</span>
            {base.entradaQtd > 1 && <span>por entrada</span>}
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
            value={base.reforcoQtd}
            onChange={num('reforcoQtd')}
          />
          <CurrencyInput
            label="Valor por reforço"
            value={base.reforcoValor}
            onChange={v => onChange({ reforcoValor: v })}
            disabled={base.reforcoQtd === 0}
          />
        </div>
        <div className="mt-3">
          <Select
            label="Periodicidade do reforço"
            value={base.reforcoPeriodo}
            onChange={e => onChange({ reforcoPeriodo: e.target.value as ReforcoPeriodo })}
            disabled={base.reforcoQtd === 0}
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
            value={base.parcelasQtd || ''}
            onChange={num('parcelasQtd')}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-t2">Valor calculado</label>
            <div className={`w-full rounded-lg px-3 py-2.5 min-h-[42px] text-sm flex items-center justify-between border transition-all ${
              valido
                ? 'bg-success-bg border-success-line text-success'
                : 'bg-s2 border-line text-t3'
            }`}>
              <span className="font-bold text-base tracking-tight">
                {valido ? fmtBRL(parcelaValor) : '—'}
              </span>
              <span className="text-xs opacity-60 ml-2">por mês</span>
            </div>
          </div>
        </div>
      </div>

      {/* Aviso de erro */}
      {!valido && erro && (
        <div className="flex items-center gap-2.5 text-sm rounded-xl px-4 py-3 bg-warning-bg border border-warning-line text-warning">
          <AlertCircle size={15} className="flex-shrink-0" />
          <span>{erro}</span>
        </div>
      )}
    </Section>
  )
}

// ── Coluna de preview + export (compartilhada entre modos) ────────────────────

export function PreviewColumn({ valido, slugBase, renderCard }: {
  valido: boolean
  slugBase: string
  renderCard: (ref: Ref<HTMLDivElement>) => ReactNode
}) {
  const [exporting, setExporting] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const handleExport = useCallback(async () => {
    if (!cardRef.current || !valido) return
    setExporting(true)
    try {
      const slug = slugBase.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-') || 'simulacao'
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
  }, [valido, slugBase])

  return (
    <div className="flex flex-col items-center gap-4 xl:sticky xl:top-6">
      <div className="flex items-center justify-between w-full">
        <p className="text-t3 text-xs uppercase tracking-widest">Preview da proposta</p>
        <p className="text-t4 text-xs">como o cliente recebe</p>
      </div>

      <div className="flex justify-center">
        {renderCard(cardRef)}
      </div>

      <Button
        variant="primary"
        size="lg"
        onClick={handleExport}
        disabled={!valido || exporting}
        className="w-full"
      >
        <Download size={16} />
        {exporting ? 'Gerando imagem…' : 'Baixar proposta (PNG)'}
      </Button>

      <p className="text-t4 text-xs text-center leading-relaxed">
        A imagem é gerada em alta resolução (3×) e fica ótima para enviar no WhatsApp ou e-mail.
      </p>
    </div>
  )
}
