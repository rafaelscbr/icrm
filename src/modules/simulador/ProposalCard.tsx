import { forwardRef } from 'react'
import { FluxoInput, FluxoResult, ReforcoPeriodo } from './calc'

const PERIODO_LABELS: Record<ReforcoPeriodo, string> = {
  semestral: 'semestral',
  anual:     'anual',
}

const NAVY  = '#0F1730'
const NAVY2 = '#19274A'
const GOLD  = '#E4B23C'
const GOLD2 = '#F0CC78'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
}

interface ProposalCardProps {
  input: FluxoInput
  result: FluxoResult
  empreendimento: string
  cliente: string
}

export const ProposalCard = forwardRef<HTMLDivElement, ProposalCardProps>(
  ({ input, result, empreendimento, cliente }, ref) => {
    const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    const font  = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif'

    return (
      <div
        ref={ref}
        style={{
          width: 420,
          background: '#FFFFFF',
          borderRadius: 24,
          overflow: 'hidden',
          fontFamily: font,
          boxShadow: '0 32px 64px rgba(15,23,48,0.22), 0 8px 24px rgba(15,23,48,0.12)',
        }}
      >
        {/* ── Header ── */}
        <div style={{ background: NAVY, padding: '28px 28px 24px', position: 'relative', overflow: 'hidden' }}>
          {/* subtle radial glow */}
          <div style={{
            position: 'absolute', top: -60, right: -60, width: 200, height: 200,
            background: `radial-gradient(circle, rgba(228,178,60,0.12) 0%, transparent 70%)`,
            pointerEvents: 'none',
          }} />

          {/* Logo + brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: `linear-gradient(135deg, ${GOLD} 0%, ${GOLD2} 100%)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 17, fontWeight: 900, color: NAVY, letterSpacing: -1,
              flexShrink: 0,
            }}>S</div>
            <div>
              <div style={{ color: GOLD, fontSize: 11, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase' }}>
                Souza Imobiliária
              </div>
              <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9.5, letterSpacing: 1, marginTop: 1 }}>
                Itajaí · SC
              </div>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8, padding: '4px 10px',
              color: 'rgba(255,255,255,0.4)', fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase',
            }}>
              Proposta
            </div>
          </div>

          {/* Title */}
          <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10.5, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 6 }}>
            Fluxo de Pagamento
          </div>
          <div style={{ color: '#FFFFFF', fontSize: 24, fontWeight: 800, lineHeight: 1.15, letterSpacing: -0.5 }}>
            {empreendimento || 'Empreendimento'}
          </div>
          {cliente && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <div style={{ width: 16, height: 1, background: GOLD, opacity: 0.7 }} />
              <div style={{ color: GOLD2, fontSize: 13 }}>Para {cliente}</div>
            </div>
          )}
        </div>

        {/* ── Gold divider ── */}
        <div style={{ height: 3, background: `linear-gradient(90deg, ${GOLD}, ${GOLD2} 50%, ${GOLD})` }} />

        {/* ── Hero: parcela (o número que vende, primeiro) ── */}
        <div style={{ padding: '22px 28px 4px' }}>
          <div style={{
            background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY2} 100%)`,
            borderRadius: 18,
            padding: '30px 24px 26px',
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* gold line top */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 3,
              background: `linear-gradient(90deg, transparent, ${GOLD}, ${GOLD2}, ${GOLD}, transparent)`,
            }} />
            {/* subtle circles */}
            <div style={{
              position: 'absolute', bottom: -40, right: -40, width: 140, height: 140,
              borderRadius: '50%', border: `1px solid rgba(228,178,60,0.12)`,
              pointerEvents: 'none',
            }} />
            <div style={{
              position: 'absolute', bottom: -20, right: -20, width: 80, height: 80,
              borderRadius: '50%', border: `1px solid rgba(228,178,60,0.08)`,
              pointerEvents: 'none',
            }} />

            <div style={{ color: GOLD2, fontSize: 15, fontWeight: 600, marginBottom: 10 }}>
              {input.parcelasQtd} parcelas mensais de
            </div>
            <div style={{ color: '#FFFFFF', fontSize: 44, fontWeight: 900, lineHeight: 1, letterSpacing: -1.5 }}>
              {fmt(result.parcelaValor)}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 10 }}>
              até a entrega das chaves
            </div>
          </div>
        </div>

        {/* ── Condições ── */}
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

        {/* ── Valores ── */}
        <div style={{ padding: '18px 28px' }}>
          <SectionLabel>Resumo de valores</SectionLabel>
          <ValueRow label="Valor Total" value={fmt(input.valorTotal)} />
          <ValueRow label={`Percentual até as chaves`} value={`${input.pctChaves.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`} />
          <ValueRow label="Valor até as chaves" value={fmt(result.valorAteChaves)} highlight />
        </div>

        {/* ── Saldo devedor ── */}
        <div style={{ padding: '0 28px 24px' }}>
          <div style={{
            background: '#F9F7F4',
            border: '1px solid #EDE9E2',
            borderRadius: 14,
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}>
            <div>
              <div style={{ color: '#9CA3AF', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 5 }}>
                Saldo devedor
              </div>
              <div style={{ color: NAVY, fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>
                {fmt(result.saldoDevedor)}
              </div>
            </div>
            <div style={{
              color: '#B0A99E', fontSize: 10.5, textAlign: 'right', maxWidth: 110, lineHeight: 1.5,
            }}>
              a ser financiado na entrega das chaves
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{
          borderTop: '1px solid #F0EDE8',
          padding: '12px 28px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{ color: '#B0A99E', fontSize: 10 }}>
            Gerado em {today}
          </div>
          <div style={{ color: '#C9C4BB', fontSize: 9.5 }}>
            * Valores sujeitos a confirmação
          </div>
        </div>
      </div>
    )
  }
)

ProposalCard.displayName = 'ProposalCard'

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ color: '#9CA3AF', fontSize: 9.5, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 14 }}>
      {children}
    </div>
  )
}

function ValueRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
      <span style={{ color: '#6B7280', fontSize: 13.5 }}>{label}</span>
      <span style={{
        fontSize: 13.5,
        fontWeight: highlight ? 700 : 500,
        color: highlight ? NAVY : '#374151',
        background: highlight ? 'rgba(228,178,60,0.10)' : 'transparent',
        padding: highlight ? '2px 10px' : '0',
        borderRadius: highlight ? 6 : 0,
      }}>
        {value}
      </span>
    </div>
  )
}

function CondRow({ qtd, label, valor, total, showTotal }: {
  qtd: number; label: string; valor: number; total: number; showTotal: boolean
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8,
          background: '#F3F0EB',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10.5, fontWeight: 800, color: NAVY, flexShrink: 0,
        }}>
          {qtd}×
        </div>
        <span style={{ color: '#374151', fontSize: 13.5 }}>{label}</span>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ color: NAVY, fontSize: 13.5, fontWeight: 600 }}>{fmt(valor)}</div>
        {showTotal && (
          <div style={{ color: '#9CA3AF', fontSize: 10.5, marginTop: 1 }}>= {fmt(total)}</div>
        )}
      </div>
    </div>
  )
}
