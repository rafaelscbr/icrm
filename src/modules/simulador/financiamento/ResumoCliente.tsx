import { forwardRef } from 'react'
import type { ResultadoSimulacao, Sistema } from './calc'

/**
 * "Resumo pro cliente" — a imagem limpa que vai no WhatsApp.
 *
 * Estilos em linha de propósito: é desenhada para virar PNG (html-to-image) e
 * não pode depender do tema da tela. Cores da identidade Folha Clara: Marinho
 * no topo, o azul mais claro do ícone e o Champanhe só no número que decide.
 */

const MARINHO = '#0F2759'
const AZUL = '#1F4AA3'
const CHAMPANHE = '#D6B26E'
const TINTA = '#0B1A3A'
const FRACO = '#5B6785'
const FOLHA = '#F3F6FB'
const FONTE = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif'

export const AVISO_LEGAL =
  'Simulação de referência. Taxas, seguros e aprovação dependem da análise de crédito e da avaliação do banco na data da contratação.'

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`

function Linha({ rotulo, valor, forte = false }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: '1px solid #E3E9F3' }}>
      <span style={{ color: FRACO, fontSize: 13 }}>{rotulo}</span>
      <span style={{ color: TINTA, fontSize: 13.5, fontWeight: forte ? 800 : 600, fontVariantNumeric: 'tabular-nums' }}>{valor}</span>
    </div>
  )
}

export const ResumoCliente = forwardRef<HTMLDivElement, {
  r: ResultadoSimulacao
  banco: string
  sistema: Sistema
  valorImovel: number
  pagoAteChaves: number
  mesesAteEntrega: number
  indiceNome: string
  indiceAnual: number
  cliente?: string
  empreendimento?: string
  corretor?: string
}>(function ResumoCliente(p, ref) {
  const hoje = new Date().toLocaleDateString('pt-BR')
  return (
    <div ref={ref} style={{ width: 420, background: '#fff', borderRadius: 24, overflow: 'hidden', fontFamily: FONTE }}>
      <div style={{ background: `linear-gradient(150deg, ${AZUL} 0%, ${MARINHO} 70%)`, padding: '24px 26px 22px', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/icon.svg" alt="" width={30} height={30} style={{ borderRadius: 8 }} />
          <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 0.2 }}>Souza Imobiliária</div>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 10.5, opacity: 0.6 }}>{hoje}</div>
        </div>
        <div style={{ marginTop: 18, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.6 }}>Simulação de financiamento</div>
        <div style={{ marginTop: 4, fontSize: 21, fontWeight: 800, lineHeight: 1.2 }}>{p.empreendimento || 'Seu imóvel'}</div>
        {p.cliente && <div style={{ marginTop: 3, fontSize: 13, opacity: 0.75 }}>para {p.cliente}</div>}
      </div>

      <div style={{ padding: '20px 26px 6px', background: FOLHA }}>
        <div style={{ color: FRACO, fontSize: 12.5 }}>Renda bruta familiar necessária</div>
        <div style={{ color: TINTA, fontSize: 32, fontWeight: 800, letterSpacing: -0.5, fontVariantNumeric: 'tabular-nums', borderBottom: `3px solid ${CHAMPANHE}`, display: 'inline-block', paddingBottom: 2 }}>
          {brl(p.r.rendaNecessaria)}
        </div>
        <div style={{ color: FRACO, fontSize: 13, margin: '8px 0 16px' }}>
          1ª parcela do banco: <strong style={{ color: TINTA }}>{brl(p.r.parcelaTotal)}</strong> · {p.sistema === 'sac' ? 'SAC' : 'Price'} em {p.r.prazo} meses
        </div>
      </div>

      <div style={{ padding: '10px 26px 4px' }}>
        <Linha rotulo="Valor do imóvel" valor={brl(p.valorImovel)} />
        <Linha rotulo="Pago até as chaves" valor={brl(p.pagoAteChaves)} />
        {p.mesesAteEntrega > 0 && p.indiceAnual > 0 && (
          <Linha rotulo={`Saldo nas chaves (${p.indiceNome} ${pct(p.indiceAnual)} a.a.)`} valor={brl(p.r.saldoChaves)} />
        )}
        <Linha rotulo="Valor financiado" valor={brl(p.r.financiado)} forte />
        <Linha rotulo={`Banco · taxa ${p.r.sfi ? 'SFI' : 'SFH'}`} valor={`${p.banco} · ${pct(p.r.taxaAnual)} a.a.`} />
        <Linha rotulo="Parcela (juros + amortização)" valor={brl(p.r.parcela1)} />
        <Linha rotulo="Seguros e tarifa" valor={brl(p.r.mip + p.r.dfi + p.r.tarifa)} />
      </div>

      <div style={{ padding: '14px 26px 22px' }}>
        <div style={{ fontSize: 10.5, color: FRACO, lineHeight: 1.45 }}>{AVISO_LEGAL}</div>
        {p.corretor && <div style={{ marginTop: 10, fontSize: 12, color: TINTA, fontWeight: 700 }}>{p.corretor} · Souza Imobiliária</div>}
      </div>
    </div>
  )
})
