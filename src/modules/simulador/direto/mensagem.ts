import { fmtBRL } from '../shared/components'
import {
  saudacao, fechamento, doEmpreendimento, linhaEntrada, linhaReforco, linhaParcelas, montar,
} from '../shared/mensagem'
import { DiretoInput, DiretoResult } from './calc'

/** Texto de WhatsApp do Direto com a construtora — sem banco, 100% no fluxo. */
export function mensagemDireto(
  input: DiretoInput,
  result: DiretoResult,
  ids: { empreendimento: string; cliente: string; corretor: string },
): string {
  return montar([
    saudacao(ids.cliente),
    `Segue a simulação de pagamento ${doEmpreendimento(ids.empreendimento)}, direto com a construtora:`,
    `*Valor do imóvel:* ${fmtBRL(input.valorTotal)}`,
    [
      '*Condição de pagamento*',
      linhaEntrada(input.entradaQtd, input.entradaValor),
      linhaReforco(input.reforcoQtd, input.reforcoValor, input.reforcoPeriodo),
      linhaParcelas(input.parcelasQtd, result.parcelaValor),
    ].filter(Boolean).join('\n'),
    '100% pago direto à construtora, sem financiamento bancário.',
    fechamento(ids.corretor),
  ])
}
