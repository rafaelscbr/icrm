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
import { mensagemPosChaves } from './mensagem'
import { EstadoPosChaves, RelatoDoSimulador, montarResumo, useRelato } from '../shared/fluxo'

const DEFAULT: Omit<PosChavesInput, 'valorTotal'> = {
  pctChaves:    0,
  entradaQtd:   1,
  entradaValor: 0,
  reforcoQtd:   0,
  reforcoValor: 0,
  reforcoPeriodo: 'semestral',
  parcelasQtd:  0,
}

interface Props {
  shared: SharedFields
  onShared: (patch: Partial<SharedFields>) => void
  corretor: string
  /** fluxo salvo sendo reaberto — ver shared/fluxo.ts. Só vale na montagem. */
  inicial?: EstadoPosChaves
  /** avisa o hospedeiro (o simulador aberto pelo lead) a cada mudança */
  onRelato?: (r: RelatoDoSimulador<EstadoPosChaves>) => void
}

export function PosChavesSimulator({ shared, onShared, corretor, inicial, onRelato }: Props) {
  const [pctChaves, setPctChaves] = useState(inicial?.pctChaves ?? DEFAULT.pctChaves)
  const [base, setBase] = useState<PagamentoBase>({
    entradaQtd:   DEFAULT.entradaQtd,
    entradaValor: DEFAULT.entradaValor,
    reforcoQtd:   DEFAULT.reforcoQtd,
    reforcoValor: DEFAULT.reforcoValor,
    reforcoPeriodo: DEFAULT.reforcoPeriodo,
    parcelasQtd:  DEFAULT.parcelasQtd,
    // por cima do padrão: um fluxo antigo pode não ter um campo criado depois
    ...inicial?.base,
  })
  const [entradaModo, setEntradaModo] = useState<EntradaModo>(inicial?.entradaModo ?? 'valor')
  const [entradaPct,  setEntradaPct]  = useState(inicial?.entradaPct ?? 0)

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
  const mensagem = result.valido ? mensagemPosChaves(input, result, { ...shared, corretor }) : ''

  useRelato(onRelato, {
    estado: { pctChaves, base, entradaModo, entradaPct },
    valido: result.valido,
    mensagem,
    resumo: montarResumo({
      valorTotal: shared.valorTotal, entradaTotal: result.entradaTotal,
      parcelasQtd: base.parcelasQtd, parcelaValor: result.parcelaValor,
    }),
  })

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
              placeholder="Ex: 30"
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
        mensagem={mensagem}
        telefone={shared.telefone}
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
