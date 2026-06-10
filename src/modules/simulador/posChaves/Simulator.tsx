import { useState } from 'react'
import { TrendingDown } from 'lucide-react'
import { Input } from '../../../components/ui/Input'
import { PagamentoBase, SharedFields } from '../shared/types'
import {
  Section, CurrencyInput, DerivedBox, IdentificacaoSection,
  PagamentoSection, PreviewColumn, EntradaModo, fmtBRL,
} from '../shared/components'
import { calcularPosChaves, PosChavesInput } from './calc'
import { PosChavesCard } from './Card'

const DEFAULT: Omit<PosChavesInput, 'valorTotal'> = {
  pctChaves:    33,
  entradaQtd:   1,
  entradaValor: 36412.06,
  reforcoQtd:   9,
  reforcoValor: 8000,
  reforcoPeriodo: 'semestral',
  parcelasQtd:  56,
}

interface Props {
  shared: SharedFields
  onShared: (patch: Partial<SharedFields>) => void
  corretor: string
}

export function PosChavesSimulator({ shared, onShared, corretor }: Props) {
  const [pctChaves, setPctChaves] = useState(DEFAULT.pctChaves)
  const [base, setBase] = useState<PagamentoBase>({
    entradaQtd:   DEFAULT.entradaQtd,
    entradaValor: DEFAULT.entradaValor,
    reforcoQtd:   DEFAULT.reforcoQtd,
    reforcoValor: DEFAULT.reforcoValor,
    reforcoPeriodo: DEFAULT.reforcoPeriodo,
    parcelasQtd:  DEFAULT.parcelasQtd,
  })
  const [entradaModo, setEntradaModo] = useState<EntradaModo>('valor')
  const [entradaPct,  setEntradaPct]  = useState(5)

  // Em modo %, o valor da entrada é derivado do valor total do imóvel
  const entradaValorEfetivo = entradaModo === 'pct'
    ? shared.valorTotal * (entradaPct / 100)
    : base.entradaValor

  const input: PosChavesInput = {
    ...base,
    entradaValor: entradaValorEfetivo,
    valorTotal: shared.valorTotal,
    pctChaves,
  }
  const result = calcularPosChaves(input)

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_460px] gap-8 items-start max-w-6xl mx-auto">

      {/* ── Formulário ── */}
      <div className="space-y-5">
        <IdentificacaoSection shared={shared} onShared={onShared} />

        <Section title="Valores do empreendimento">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CurrencyInput
              label="Valor Total"
              value={shared.valorTotal}
              onChange={v => onShared({ valorTotal: v })}
            />
            <Input
              label="Porcentagem até as chaves (%)"
              type="number"
              step="0.5"
              min="0"
              max="100"
              value={pctChaves || ''}
              onChange={e => {
                const v = parseFloat(e.target.value)
                setPctChaves(isNaN(v) ? 0 : v)
              }}
              placeholder="33"
            />
          </div>

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

        <PagamentoSection
          title="Condições de pagamento até as chaves"
          base={base}
          onChange={patch => setBase(prev => ({ ...prev, ...patch }))}
          valorTotal={shared.valorTotal}
          entradaModo={entradaModo}
          setEntradaModo={setEntradaModo}
          entradaPct={entradaPct}
          setEntradaPct={setEntradaPct}
          entradaValorEfetivo={entradaValorEfetivo}
          parcelaValor={result.parcelaValor}
          valido={result.valido}
          erro={result.erro}
        />
      </div>

      {/* ── Preview + Export ── */}
      <PreviewColumn
        valido={result.valido}
        slugBase={shared.empreendimento}
        renderCard={ref => (
          <PosChavesCard
            ref={ref}
            input={input}
            result={result}
            empreendimento={shared.empreendimento}
            cliente={shared.cliente}
            corretor={corretor}
          />
        )}
      />
    </div>
  )
}
