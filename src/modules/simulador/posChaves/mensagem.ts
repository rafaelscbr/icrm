import { fmtBRL } from '../shared/components'
import {
  saudacao, fechamento, doEmpreendimento, linhaEntrada, linhaReforco, linhaParcelas, pct, montar,
} from '../shared/mensagem'
import { PosChavesInput, PosChavesResult } from './calc'

/** Texto de WhatsApp do Pós-chaves — a mesma leitura do card, em tópicos. */
export function mensagemPosChaves(
  input: PosChavesInput,
  result: PosChavesResult,
  ids: { empreendimento: string; cliente: string; corretor: string },
): string {
  return montar([
    saudacao(ids.cliente),
    `Segue a simulação de pagamento ${doEmpreendimento(ids.empreendimento)}, na condição pós-chaves:`,
    `*Valor do imóvel:* ${fmtBRL(input.valorTotal)}`,
    [
      `*Até as chaves — ${pct(input.pctChaves)} (${fmtBRL(result.valorAteChaves)})*`,
      linhaEntrada(input.entradaQtd, input.entradaValor),
      linhaReforco(input.reforcoQtd, input.reforcoValor, input.reforcoPeriodo),
      linhaParcelas(input.parcelasQtd, result.parcelaValor),
    ].filter(Boolean).join('\n'),
    [
      `*Saldo na entrega das chaves:* ${fmtBRL(result.saldoDevedor)}`,
      '_financiado no banco na entrega, sujeito à aprovação de crédito_',
    ].join('\n'),
    fechamento(ids.corretor),
  ])
}
