import { forwardRef } from 'react'
import {
  CardFrame, CardHeader, HeroParcela, SectionLabel, CondRow, ValueRow,
  HighlightBox, CardFooter, fmt,
} from '../shared/CardShell'
import { ReforcoPeriodo } from '../shared/types'
import { DiretoInput, DiretoResult } from './calc'

const PERIODO_LABELS: Record<ReforcoPeriodo, string> = {
  semestral: 'semestral',
  anual:     'anual',
}

interface Props {
  input: DiretoInput
  result: DiretoResult
  empreendimento: string
  cliente: string
  corretor: string
}

export const DiretoCard = forwardRef<HTMLDivElement, Props>(
  ({ input, result, empreendimento, cliente, corretor }, ref) => (
    <div ref={ref}>
      <CardFrame>
        <CardHeader
          corretor={corretor}
          badge="Direto com a construtora"
          empreendimento={empreendimento}
          cliente={cliente}
        />

        <HeroParcela
          parcelasQtd={input.parcelasQtd}
          parcelaValor={result.parcelaValor}
          subtitle="direto com a construtora"
        />

        {/* Condições */}
        <div style={{ padding: '20px 28px 14px', borderBottom: '1px solid #F0EDE8' }}>
          <SectionLabel>Condições de pagamento</SectionLabel>
          <CondRow
            qtd={input.entradaQtd}
            label="Entrada"
            valor={input.entradaValor}
            total={result.entradaTotal}
            showTotal={input.entradaQtd > 1}
          />
          {input.reforcoQtd > 0 && (
            <CondRow
              qtd={input.reforcoQtd}
              label={`Reforço ${PERIODO_LABELS[input.reforcoPeriodo]}`}
              valor={input.reforcoValor}
              total={result.reforcoTotal}
              showTotal={input.reforcoQtd > 1}
            />
          )}
        </div>

        {/* Valores */}
        <div style={{ padding: '18px 28px' }}>
          <SectionLabel>Resumo de valores</SectionLabel>
          <ValueRow label="Valor Total" value={fmt(input.valorTotal)} highlight />
          <ValueRow label="Total em parcelas mensais" value={fmt(result.totalParcelado)} />
        </div>

        <HighlightBox
          label="100% direto com a construtora"
          value="Sem banco"
          note="sem financiamento bancário"
        />

        <CardFooter />
      </CardFrame>
    </div>
  )
)

DiretoCard.displayName = 'DiretoCard'
