import { fmtBRL } from '../shared/components'
import { saudacao, fechamento, doEmpreendimento, montar } from '../shared/mensagem'
import type { ResultadoSimulacao, Sistema } from './calc'

/**
 * Texto de WhatsApp do Simulador de financiamento — a mesma leitura do
 * cartão, em tópicos, no tom dos outros simuladores (sem emoji, *negrito* do
 * próprio WhatsApp, assinatura do corretor).
 */
export function mensagemFinanciamento(p: {
  r: ResultadoSimulacao
  banco: string
  sistema: Sistema
  indexador: string
  valorImovel: number
  pagoAteChaves: number
  mesesAteEntrega: number
  indiceNome: string
  indiceAnual: number
  fgts: number
  cliente: string
  empreendimento: string
  corretor: string
}): string {
  const { r } = p
  if (!r.valido) return ''
  const pctA = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
  const corrigido = p.mesesAteEntrega > 0 && p.indiceAnual > 0
  const taxa = `${pctA(r.taxaAnual)} a.a.${p.indexador !== 'fixa' ? ` + ${p.indexador}` : ''}`
  return montar([
    saudacao(p.cliente),
    `Segue a simulação do financiamento ${doEmpreendimento(p.empreendimento)} no banco, na entrega das chaves:`,
    [
      `• Valor do imóvel: ${fmtBRL(p.valorImovel)}`,
      `• Pago até as chaves: ${fmtBRL(p.pagoAteChaves)}`,
      corrigido
        ? `• Saldo nas chaves: ${fmtBRL(r.saldoChaves)} _(corrigido pelo ${p.indiceNome} de ${pctA(p.indiceAnual)} a.a.)_`
        : `• Saldo a financiar: ${fmtBRL(r.saldoChaves)}`,
      p.fgts > 0 ? `• FGTS nas chaves: ${fmtBRL(p.fgts)}` : null,
      `• *Valor financiado: ${fmtBRL(r.financiado)}*`,
    ].filter(Boolean).join('\n'),
    [
      `*1ª parcela do banco: ${fmtBRL(r.parcelaTotal)}*`,
      `${p.banco} · ${p.sistema === 'sac' ? 'SAC' : 'Price'} em ${r.prazo} meses · ${taxa}`,
      '_já com seguros e tarifa do banco_',
    ].join('\n'),
    `*Renda bruta familiar necessária: ${fmtBRL(r.rendaNecessaria)}*`,
    '_Simulação de referência. Taxas, seguros e aprovação dependem da análise de crédito e da avaliação do banco na data da contratação._',
    fechamento(p.corretor),
  ])
}
