import { forwardRef, ReactNode } from 'react'
import type { ResultadoSimulacao, Sistema } from './calc'

/**
 * "Resumo pro cliente" — o cartão que vira PNG para o WhatsApp, desenhado ao
 * vivo na coluna da direita, como o cartão do Simulador de fluxo.
 *
 * Estilos em linha de propósito: vira imagem (html-to-image) e não pode
 * depender do tema da tela. Identidade Folha Clara: o azul do ícone no topo,
 * Marinho na tinta e o Champanhe só no número que decide (a renda).
 */

const MARINHO = '#0F2759'
const AZUL = '#1F4AA3'
const CHAMPANHE = '#D6B26E'
const TINTA = '#0B1A3A'
const FRACO = '#5B6785'
const FOLHA = '#F3F6FB'
const LINHA = '#E3E9F3'
const FONTE = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif'

export const AVISO_LEGAL =
  'Simulação de referência. Taxas, seguros e aprovação dependem da análise de crédito e da avaliação do banco na data da contratação.'

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`

function Celula({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${LINHA}`, borderRadius: 14, padding: '11px 13px' }}>
      <div style={{ color: FRACO, fontSize: 11 }}>{rotulo}</div>
      <div style={{ color: TINTA, fontSize: 15, fontWeight: 800, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{valor}</div>
      {nota && <div style={{ color: FRACO, fontSize: 10.5, marginTop: 1 }}>{nota}</div>}
    </div>
  )
}

function Linha({ rotulo, valor }: { rotulo: ReactNode; valor: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: `1px solid ${LINHA}` }}>
      <span style={{ color: FRACO, fontSize: 12.5 }}>{rotulo}</span>
      <span style={{ color: TINTA, fontSize: 12.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{valor}</span>
    </div>
  )
}

export const ResumoCliente = forwardRef<HTMLDivElement, {
  r: ResultadoSimulacao | null
  banco: string
  sistema: Sistema
  indexador: string
  valorImovel: number
  entrada: number
  fgts: number
  cliente?: string
  empreendimento?: string
  corretor?: string
}>(function ResumoCliente(p, ref) {
  const hoje = new Date().toLocaleDateString('pt-BR')
  const ok = !!p.r?.valido
  const r = p.r
  const inv = ok ? r!.inverso : null

  return (
    <div ref={ref} style={{ width: 420, background: '#fff', borderRadius: 26, overflow: 'hidden', fontFamily: FONTE,
                            boxShadow: '0 28px 56px rgba(15,39,89,0.20), 0 6px 18px rgba(15,39,89,0.10)' }}>
      {/* Topo */}
      <div style={{ background: `linear-gradient(150deg, ${AZUL} 0%, ${MARINHO} 72%)`, padding: '22px 24px 24px', color: '#fff', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -70, right: -70, width: 220, height: 220, borderRadius: '50%',
                      background: 'radial-gradient(circle, rgba(214,178,110,0.28) 0%, rgba(214,178,110,0) 70%)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
          <img src="/icon.svg" alt="" width={28} height={28} style={{ borderRadius: 8 }} />
          <div style={{ fontSize: 13.5, fontWeight: 800 }}>Souza Imobiliária</div>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 10.5, opacity: 0.6 }}>{hoje}</div>
        </div>
        <div style={{ marginTop: 18, fontSize: 10.5, letterSpacing: 2.2, textTransform: 'uppercase', opacity: 0.6, position: 'relative' }}>Simulação de financiamento</div>
        <div style={{ marginTop: 4, fontSize: 21, fontWeight: 800, lineHeight: 1.2, position: 'relative' }}>{p.empreendimento || 'Seu imóvel'}</div>
        {p.cliente && <div style={{ marginTop: 3, fontSize: 12.5, opacity: 0.75, position: 'relative' }}>para {p.cliente}</div>}

        <div style={{ marginTop: 18, position: 'relative' }}>
          <div style={{ fontSize: 12, opacity: 0.75 }}>Renda bruta familiar necessária</div>
          <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: -0.6, color: CHAMPANHE, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
            {ok ? brl(r!.rendaNecessaria) : 'R$ —'}
          </div>
          {inv && (
            <div style={{ display: 'inline-block', marginTop: 8, borderRadius: 999, padding: '4px 10px', fontSize: 11.5, fontWeight: 700,
                          background: inv.passa ? 'rgba(31,138,98,0.22)' : 'rgba(199,71,79,0.25)', color: '#fff' }}>
              {inv.passa ? 'Renda informada atende' : `Renda informada: falta ${brl(r!.rendaNecessaria - inv.rendaCliente)}`}
            </div>
          )}
        </div>
      </div>

      {/* Números */}
      <div style={{ background: FOLHA, padding: '16px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Celula rotulo="1ª parcela do banco" valor={ok ? brl(r!.parcelaTotal) : '—'} nota={ok ? `${p.sistema === 'sac' ? 'SAC' : 'Price'} · ${r!.prazo} meses` : undefined} />
        <Celula rotulo="Valor financiado" valor={ok ? brl(r!.financiado) : '—'} nota={ok ? `${pct(r!.financiado / p.valorImovel * 100)} do imóvel` : undefined} />
      </div>

      {/* Detalhe */}
      <div style={{ padding: '6px 24px 4px' }}>
        <Linha rotulo="Valor do imóvel" valor={brl(p.valorImovel)} />
        <Linha rotulo="Entrada" valor={`− ${brl(p.entrada)}`} />
        {p.fgts > 0 && <Linha rotulo="FGTS" valor={`− ${brl(p.fgts)}`} />}
        {ok && <Linha rotulo="Banco" valor={`${p.banco} · ${pct(r!.taxaAnual)} a.a.${p.indexador !== 'fixa' ? ` + ${p.indexador}` : ''}`} />}
        {ok && <Linha rotulo="Juros + amortização" valor={brl(r!.parcela1)} />}
        {ok && <Linha rotulo="Seguros e tarifa" valor={brl(r!.mip + r!.dfi + r!.tarifa)} />}
      </div>

      <div style={{ padding: '12px 24px 20px' }}>
        <div style={{ fontSize: 10, color: FRACO, lineHeight: 1.45 }}>{AVISO_LEGAL}</div>
        {p.corretor && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 4, height: 14, borderRadius: 4, background: CHAMPANHE }} />
            <div style={{ fontSize: 12, color: TINTA, fontWeight: 700 }}>{p.corretor} · Souza Imobiliária</div>
          </div>
        )}
      </div>
    </div>
  )
})
