import { forwardRef, Fragment, ReactNode } from 'react'
import { CardFrame, CardHeader, SectionLabel, CardFooter, fmt, NAVY, GOLD } from '../shared/CardShell'
import {
  AssociativoInput, AssociativoResult, INDICE_LABELS, SISTEMA_LABELS, mesAnoLabel,
} from './calc'

// Card completo do modo Associativo: tudo do resumo + tabela mês a mês como a
// planilha da construtora — material para o corretor abrir em vídeo chamada e
// explicar linha por linha. Exportado como PNG longo.

interface Props {
  input: AssociativoInput
  result: AssociativoResult
  empreendimento: string
  cliente: string
  corretor: string
}

const fmt0 = (v: number | null) =>
  v === null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 })

function StatBox({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div style={{ flex: 1, background: '#F9F7F4', border: '1px solid #EDE9E2', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ color: '#9CA3AF', fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 5 }}>
        {label}
      </div>
      <div style={{ color: NAVY, fontSize: 16, fontWeight: 800, letterSpacing: -0.3 }}>{value}</div>
      {note && <div style={{ color: '#B0A99E', fontSize: 9, marginTop: 3 }}>{note}</div>}
    </div>
  )
}

function Th({ children, right = true }: { children: ReactNode; right?: boolean }) {
  return (
    <th style={{
      padding: '7px 10px', textAlign: right ? 'right' : 'left',
      color: 'rgba(255,255,255,0.75)', fontSize: 9, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: 1.2, whiteSpace: 'nowrap',
    }}>
      {children}
    </th>
  )
}

function Td({ children, right = true, bold = false, muted = false }: {
  children: ReactNode; right?: boolean; bold?: boolean; muted?: boolean
}) {
  return (
    <td style={{
      padding: '5px 10px', textAlign: right ? 'right' : 'left',
      fontSize: 10.5, whiteSpace: 'nowrap',
      fontWeight: bold ? 700 : 400,
      color: muted ? '#C9C4BB' : bold ? NAVY : '#4B5563',
    }}>
      {children}
    </td>
  )
}

const MARCO_LABELS = {
  financiamento: 'Assinatura do financiamento',
  entrega: 'Entrega das chaves',
} as const

export const AssociativoCardCompleto = forwardRef<HTMLDivElement, Props>(
  ({ input, result, empreendimento, cliente, corretor }, ref) => {
    const indice = INDICE_LABELS[input.indice]
    return (
      <div ref={ref}>
        <CardFrame width={620}>
          <CardHeader
            corretor={corretor}
            badge="Associativo · Completo"
            empreendimento={empreendimento}
            cliente={cliente}
          />

          {/* Faixa de indicadores */}
          <div style={{ display: 'flex', gap: 10, padding: '18px 24px 6px' }}>
            <StatBox
              label="Valor do imóvel"
              value={fmt(input.valorTotal)}
            />
            <StatBox
              label={`Pago na obra · ${result.pagoNaObraPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}
              value={fmt(result.pagoNaObra)}
              note={`entrada + ${input.parcelasQtd} parcelas${input.balaoQtd > 0 ? ` + ${input.balaoQtd} balões` : ''}`}
            />
            <StatBox
              label={`A financiar · ${result.saldoFinanciarPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}
              value={fmt(result.saldoFinanciar)}
              note={`≈ ${fmt(result.parcelaFinanciamento)}/mês (${SISTEMA_LABELS[input.sistema]} ${input.prazoMeses}m)*`}
            />
          </div>

          {/* Tabela mês a mês */}
          <div style={{ padding: '14px 24px 6px' }}>
            <SectionLabel>
              Fluxo mês a mês{input.aplicarCorrecao
                ? ` · parcelas e balões com ${indice} projetado de ${input.taxaIndiceAnual.toLocaleString('pt-BR')}% a.a.`
                : ` · valores base, sem projeção do ${indice}`}
            </SectionLabel>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: NAVY }}>
                  <Th right={false}>Mês</Th>
                  <Th>Parcela</Th>
                  <Th>Balão</Th>
                  <Th>Taxa de obra</Th>
                  <Th>Total do mês</Th>
                </tr>
              </thead>
              <tbody>
                {result.fluxo.map((m, i) => (
                  <Fragment key={m.idx}>
                    {m.marco && (
                      <tr>
                        <td colSpan={5} style={{ padding: 0 }}>
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '5px 10px', margin: '3px 0',
                            background: 'rgba(228,178,60,0.10)',
                            borderLeft: `3px solid ${GOLD}`,
                          }}>
                            <span style={{ color: NAVY, fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.5 }}>
                              {MARCO_LABELS[m.marco]} · {m.label}
                            </span>
                            {m.marco === 'financiamento' && (
                              <span style={{ color: '#9CA3AF', fontSize: 9 }}>
                                taxa de obra começa no mês seguinte
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    <tr style={{ background: i % 2 === 0 ? '#FFFFFF' : '#FAF8F5' }}>
                      <Td right={false} bold>{m.label}</Td>
                      <Td muted={m.parcela === null}>{fmt0(m.parcela)}</Td>
                      <Td muted={m.balao === null} bold={m.balao !== null}>{fmt0(m.balao)}</Td>
                      <Td muted={m.taxaObra === null}>{fmt0(m.taxaObra)}</Td>
                      <Td bold>{fmt0(m.total)}</Td>
                    </tr>
                  </Fragment>
                ))}
                {/* Totais */}
                <tr style={{ borderTop: `2px solid ${NAVY}` }}>
                  <Td right={false} bold>Total</Td>
                  <Td bold>{fmt0(result.fluxo.reduce((s, m) => s + (m.parcela ?? 0), 0))}</Td>
                  <Td bold>{fmt0(result.fluxo.reduce((s, m) => s + (m.balao ?? 0), 0))}</Td>
                  <Td bold>{fmt0(result.taxaObraTotal)}</Td>
                  <Td bold>{fmt0(result.totalNaObra)}</Td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Pós-entrega */}
          <div style={{ padding: '10px 24px 16px' }}>
            <div style={{
              background: '#F9F7F4', border: '1px solid #EDE9E2', borderRadius: 12,
              padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
            }}>
              <div>
                <div style={{ color: '#9CA3AF', fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>
                  Após a entrega · {mesAnoLabel(input.entrega)}
                </div>
                <div style={{ color: NAVY, fontSize: 13, fontWeight: 700 }}>
                  Financiamento de {fmt(result.saldoFinanciar)} · parcela estimada ≈ {fmt(result.parcelaFinanciamento)}*
                </div>
              </div>
              <div style={{ color: '#B0A99E', fontSize: 9, textAlign: 'right', maxWidth: 150, lineHeight: 1.5 }}>
                * estimativa sobre o saldo de hoje, sujeita à análise de crédito do banco
              </div>
            </div>
          </div>

          <CardFooter />
        </CardFrame>
      </div>
    )
  }
)

AssociativoCardCompleto.displayName = 'AssociativoCardCompleto'
