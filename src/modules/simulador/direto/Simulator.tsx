import { useState } from 'react'
import { Wallet } from 'lucide-react'
import { PagamentoBase, SharedFields } from '../shared/types'
import {
  Section, CurrencyInput, DerivedBox, IdentificacaoSection,
  PagamentoSection, PreviewColumn, EntradaModo, fmtBRL,
} from '../shared/components'
import { calcularDireto, DiretoInput } from './calc'
import { DiretoCard } from './Card'

const DEFAULT: PagamentoBase = {
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

export function DiretoSimulator({ shared, onShared, corretor }: Props) {
  const [base, setBase] = useState<PagamentoBase>(DEFAULT)
  const [entradaModo, setEntradaModo] = useState<EntradaModo>('valor')
  const [entradaPct,  setEntradaPct]  = useState(5)

  // Em modo %, o valor da entrada é derivado do valor total do imóvel
  const entradaValorEfetivo = entradaModo === 'pct'
    ? shared.valorTotal * (entradaPct / 100)
    : base.entradaValor

  const input: DiretoInput = {
    ...base,
    entradaValor: entradaValorEfetivo,
    valorTotal: shared.valorTotal,
  }
  const result = calcularDireto(input)

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
            <DerivedBox
              label="Total em parcelas mensais"
              value={fmtBRL(result.totalParcelado)}
              accent
              icon={<Wallet size={13} className="text-brand" />}
            />
          </div>
          <p className="text-xs text-t4 leading-relaxed">
            Sem financiamento bancário: entrada, reforços e parcelas mensais cobrem 100% do valor do imóvel.
          </p>
        </Section>

        <PagamentoSection
          title="Condições de pagamento"
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
          <DiretoCard
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
