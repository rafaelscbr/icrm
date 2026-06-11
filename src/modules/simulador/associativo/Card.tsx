import { forwardRef } from 'react'
import {
  CardFrame, CardHeader, HeroParcela, SectionLabel, CondRow, ValueRow,
  HighlightBox, CardFooter, fmt, NAVY, GOLD, GOLD2,
} from '../shared/CardShell'
import {
  AssociativoInput, AssociativoResult, INDICE_LABELS, SISTEMA_LABELS, mesAnoLabel,
} from './calc'

// Card resumo do modo Associativo — linguagem de cliente: condição na obra,
// rampa da taxa de obra (transmite a realidade sem assustar: cresce, tem pico
// e tem data para acabar) e o financiamento estimado na entrega.

interface Props {
  input: AssociativoInput
  result: AssociativoResult
  empreendimento: string
  cliente: string
  corretor: string
}

// Rampa visual da taxa de obra: barras crescendo do 1º mês até a entrega
function TaxaObraRampa({ input, result }: { input: AssociativoInput; result: AssociativoResult }) {
  const BARS = 14
  const m0 = Math.min(Math.max(input.pctObraAssinatura, 0), 100) / 100
  return (
    <div style={{ padding: '0 28px 18px' }}>
      <SectionLabel>Taxa de obra · paga ao banco durante a construção</SectionLabel>
      <div style={{
        background: '#F9F7F4', border: '1px solid #EDE9E2', borderRadius: 14, padding: '14px 16px 12px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <div>
            <div style={{ color: '#9CA3AF', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 3 }}>
              começa em · {mesAnoLabel(input.financiamento)} +1 mês
            </div>
            <div style={{ color: NAVY, fontSize: 15, fontWeight: 800 }}>{fmt(result.taxaObraPrimeira)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#9CA3AF', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 3 }}>
              pico na entrega · {mesAnoLabel(input.entrega)}
            </div>
            <div style={{ color: NAVY, fontSize: 15, fontWeight: 800 }}>{fmt(result.taxaObraUltima)}</div>
          </div>
        </div>
        {/* barras de evolução linear */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 34 }}>
          {Array.from({ length: BARS }, (_, b) => {
            const fracao = m0 + (1 - m0) * ((b + 1) / BARS)
            return (
              <div
                key={b}
                style={{
                  flex: 1,
                  height: `${Math.max(fracao * 100, 8)}%`,
                  borderRadius: 2,
                  background: b === BARS - 1
                    ? `linear-gradient(180deg, ${GOLD2}, ${GOLD})`
                    : `rgba(15,23,48,${0.14 + fracao * 0.38})`,
                }}
              />
            )
          })}
        </div>
        <div style={{ color: '#B0A99E', fontSize: 9.5, marginTop: 8, lineHeight: 1.5 }}>
          Cresce conforme a evolução da obra, dura {result.mesesTaxaObra} meses e termina na entrega das chaves.
          Não amortiza o saldo financiado.
        </div>
      </div>
    </div>
  )
}

export const AssociativoCard = forwardRef<HTMLDivElement, Props>(
  ({ input, result, empreendimento, cliente, corretor }, ref) => {
    const indice = INDICE_LABELS[input.indice]
    return (
      <div ref={ref}>
        <CardFrame>
          <CardHeader
            corretor={corretor}
            badge="Associativo"
            empreendimento={empreendimento}
            cliente={cliente}
          />

          <HeroParcela
            parcelasQtd={input.parcelasQtd}
            parcelaValor={input.parcelaValor}
            subtitle={`durante a obra · corrigidas pelo ${indice}`}
          />

          {/* Projeção da correção (apenas se aplicada) */}
          {input.aplicarCorrecao && (
            <div style={{ padding: '8px 28px 0', textAlign: 'center' }}>
              <span style={{ color: '#9CA3AF', fontSize: 10.5 }}>
                com {indice} projetado de {input.taxaIndiceAnual.toLocaleString('pt-BR')}% a.a., a última parcela fica em ≈ {fmt(result.ultimaParcelaCorrigida)}
              </span>
            </div>
          )}

          {/* Condições */}
          <div style={{ padding: '18px 28px 12px', borderBottom: '1px solid #F0EDE8' }}>
            <SectionLabel>Condições durante a obra</SectionLabel>
            <CondRow
              qtd={input.entradaQtd}
              label="Entrada"
              valor={input.entradaValor}
              total={result.entradaTotal}
              showTotal={input.entradaQtd > 1}
            />
            {input.balaoQtd > 0 && (
              <CondRow
                qtd={input.balaoQtd}
                label="Balão anual"
                valor={input.balaoValor}
                total={result.balaoTotal}
                showTotal={input.balaoQtd > 1}
              />
            )}
          </div>

          {/* Linha do tempo + valores */}
          <div style={{ padding: '16px 28px 14px' }}>
            <SectionLabel>Resumo de valores</SectionLabel>
            <ValueRow label="Valor do imóvel" value={fmt(input.valorTotal)} />
            <ValueRow
              label={`Pago na obra (${result.pagoNaObraPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)`}
              value={fmt(result.pagoNaObra)}
              highlight
            />
            <ValueRow label="Assinatura do financiamento" value={mesAnoLabel(input.financiamento)} />
            <ValueRow label="Entrega das chaves" value={mesAnoLabel(input.entrega)} />
          </div>

          <TaxaObraRampa input={input} result={result} />

          <HighlightBox
            label={`Saldo a financiar (${result.saldoFinanciarPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)`}
            value={fmt(result.saldoFinanciar)}
            note="financiado no banco na entrega, sujeito a aprovação de crédito"
          />

          {/* Financiamento estimado */}
          <div style={{ padding: '0 28px 18px' }}>
            <ValueRow
              label={`Parcela estimada (${SISTEMA_LABELS[input.sistema]} · ${input.prazoMeses}m · ${input.taxaBancoAnual.toLocaleString('pt-BR')}% a.a.)`}
              value={`≈ ${fmt(result.parcelaFinanciamento)}*`}
              highlight
            />
            <div style={{ color: '#B0A99E', fontSize: 9.5, lineHeight: 1.5 }}>
              * Estimativa sobre o saldo de hoje. O valor final depende da análise de crédito e das condições do banco na assinatura.
            </div>
          </div>

          <CardFooter />
        </CardFrame>
      </div>
    )
  }
)

AssociativoCard.displayName = 'AssociativoCard'
