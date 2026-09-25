import { fmtBRL } from '../shared/components'
import {
  saudacao, fechamento, doEmpreendimento, linhaEntrada, linhaParcelas, pct, montar,
} from '../shared/mensagem'
import {
  AssociativoInput, AssociativoResult, INDICE_LABELS, SISTEMA_LABELS, mesAnoLabel,
} from './calc'

/**
 * Texto de WhatsApp do Associativo — a mesma linguagem do card resumo: o que
 * se paga na obra, as datas que importam, a taxa de obra dita sem susto (cresce,
 * tem pico, tem data para acabar) e o financiamento como ESTIMATIVA, nunca
 * como promessa.
 */
export function mensagemAssociativo(
  input: AssociativoInput,
  result: AssociativoResult,
  ids: { empreendimento: string; cliente: string; corretor: string },
): string {
  const indice = INDICE_LABELS[input.indice]

  const obra = [
    `*Durante a obra — pago ao empreendimento (${pct(result.pagoNaObraPct)}: ${fmtBRL(result.pagoNaObra)})*`,
    linhaEntrada(input.entradaQtd, input.entradaValor),
    linhaParcelas(input.parcelasQtd, input.parcelaValor, `, reajustadas pelo ${indice}`),
    input.balaoQtd > 0 && input.balaoValor > 0
      ? input.balaoQtd === 1
        ? `• 1 balão anual de ${fmtBRL(input.balaoValor)}`
        : `• ${input.balaoQtd} balões anuais de ${fmtBRL(input.balaoValor)} (total ${fmtBRL(result.balaoTotal)})`
      : null,
  ].filter(Boolean).join('\n')

  const correcao = input.aplicarCorrecao
    ? `Com ${indice} projetado de ${input.taxaIndiceAnual.toLocaleString('pt-BR')}% ao ano, a última parcela fica em torno de ${fmtBRL(result.ultimaParcelaCorrigida)}.`
    : null

  const datas = [
    '*Datas importantes*',
    `• 1ª parcela: ${mesAnoLabel(input.inicioParcelas)}`,
    `• Assinatura do financiamento: ${mesAnoLabel(input.financiamento)}`,
    `• Entrega das chaves: ${mesAnoLabel(input.entrega)}`,
  ].join('\n')

  const taxaObra = [
    '*Taxa de obra — paga ao banco durante a construção*',
    `Começa em torno de ${fmtBRL(result.taxaObraPrimeira)} e chega a ${fmtBRL(result.taxaObraUltima)} na entrega, ` +
    `acompanhando a evolução da obra. Dura ${result.mesesTaxaObra} ${result.mesesTaxaObra === 1 ? 'mês' : 'meses'}, ` +
    'termina na entrega das chaves e não abate o saldo financiado.',
  ].join('\n')

  const financiamento = [
    `*Saldo a financiar na entrega:* ${fmtBRL(result.saldoFinanciar)} (${pct(result.saldoFinanciarPct)})`,
    `Parcela estimada: em torno de ${fmtBRL(result.parcelaFinanciamento)} por mês ` +
    `(${SISTEMA_LABELS[input.sistema]}, ${input.prazoMeses} meses, ${input.taxaBancoAnual.toLocaleString('pt-BR')}% ao ano` +
    `${input.sistema === 'sac' ? ', 1ª parcela, depois diminui' : ''})`,
    '_Estimativa sobre o saldo de hoje; o valor final depende da análise de crédito e das condições do banco na assinatura._',
  ].join('\n')

  return montar([
    saudacao(ids.cliente),
    `Segue a simulação de pagamento ${doEmpreendimento(ids.empreendimento)}, no modelo associativo:`,
    `*Valor do imóvel:* ${fmtBRL(input.valorTotal)}`,
    obra,
    correcao,
    datas,
    taxaObra,
    financiamento,
    fechamento(ids.corretor),
  ])
}
