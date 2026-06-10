import { forwardRef } from 'react'
import {
  CardFrame, CardHeader, HeroParcela, SectionLabel, CondRow, ValueRow,
  HighlightBox, CardFooter, fmt,
} from '../shared/CardShell'
import { ReforcoPeriodo } from '../shared/types'
import { PosChavesInput, PosChavesResult } from './calc'

const PERIODO_LABELS: Record<ReforcoPeriodo, string> = {
  semestral: 'semestral',
  anual:     'anual',
}

interface Props {
  input: PosChavesInput
  result: PosChavesResult
  empreendimento: string
  cliente: string
  corretor: string
}

export const PosChavesCard = forwardRef<HTMLDivElement, Props>(
  ({ input, result, empreendimento, cliente, corretor }, ref) => (
    <div ref={ref}>
      <CardFrame>
        <CardHeader
          corretor={corretor}
          badge="Pós-chaves"
          empreendimento={empreendimento}
          cliente={cliente}
        />

        <HeroParcela
          parcelasQtd={input.parcelasQtd}
          parcelaValor={result.parcelaValor}
          subtitle="até a entrega das chaves"
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
          <ValueRow label="Valor Total" value={fmt(input.valorTotal)} />
          <ValueRow label="Percentual até as chaves" value={`${input.pctChaves.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`} />
          <ValueRow label="Valor até as chaves" value={fmt(result.valorAteChaves)} highlight />
        </div>

        <HighlightBox
          label="Saldo devedor"
          value={fmt(result.saldoDevedor)}
          note="a ser financiado na entrega das chaves"
        />

        <CardFooter />
      </CardFrame>
    </div>
  )
)

PosChavesCard.displayName = 'PosChavesCard'
