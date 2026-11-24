import { useState } from 'react'
import { Wallet } from 'lucide-react'
import { PagamentoBase, SharedFields } from '../shared/types'
import {
  Section, CurrencyInput, DerivedBox, IdentificacaoSection,
  PagamentoSection, PreviewColumn, EntradaModo, fmtBRL,
} from '../shared/components'
import { calcularDireto, DiretoInput } from './calc'
import { DiretoCard } from './Card'
import { mensagemDireto } from './mensagem'
import { EstadoDireto, RelatoDoSimulador, montarResumo, useRelato } from '../shared/fluxo'

const DEFAULT: PagamentoBase = {
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
  inicial?: EstadoDireto
  /** avisa o hospedeiro (o simulador aberto pelo lead) a cada mudança */
  onRelato?: (r: RelatoDoSimulador<EstadoDireto>) => void
}

export function DiretoSimulator({ shared, onShared, corretor, inicial, onRelato }: Props) {
  // por cima do padrão: um fluxo antigo pode não ter um campo criado depois
  const [base, setBase] = useState<PagamentoBase>({ ...DEFAULT, ...inicial?.base })
  const [entradaModo, setEntradaModo] = useState<EntradaModo>(inicial?.entradaModo ?? 'valor')
  const [entradaPct,  setEntradaPct]  = useState(inicial?.entradaPct ?? 0)

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
  const mensagem = result.valido ? mensagemDireto(input, result, { ...shared, corretor }) : ''

  useRelato(onRelato, {
    estado: { base, entradaModo, entradaPct },
    valido: result.valido,
    mensagem,
    resumo: montarResumo({
      valorTotal: shared.valorTotal, entradaTotal: result.entradaTotal,
      parcelasQtd: base.parcelasQtd, parcelaValor: result.parcelaValor,
    }),
    repasse: null, // direto com a construtora: não há banco
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
        mensagem={mensagem}
        telefone={shared.telefone}
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
