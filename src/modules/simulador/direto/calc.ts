import { PagamentoBase } from '../shared/types'

// Modo Direto com a Construtora: sem financiamento bancário.
// O cliente paga 100% do valor à construtora — entrada + reforços + parcelas
// mensais cobrem o valor total. Não existe saldo devedor.

export interface DiretoInput extends PagamentoBase {
  valorTotal: number
}

export interface DiretoResult {
  entradaTotal: number
  reforcoTotal: number
  totalParcelado: number   // valor total − entradas − reforços (vira parcelas)
  parcelaValor: number
  valido: boolean
  erro?: string
}

export function calcularDireto(input: DiretoInput): DiretoResult {
  const { valorTotal, entradaQtd, entradaValor, reforcoQtd, reforcoValor, parcelasQtd } = input

  const entradaTotal   = entradaQtd * entradaValor
  const reforcoTotal   = reforcoQtd * reforcoValor
  const totalParcelado = valorTotal - entradaTotal - reforcoTotal

  if (parcelasQtd <= 0) {
    return { entradaTotal, reforcoTotal, totalParcelado, parcelaValor: 0, valido: false, erro: 'Número de parcelas deve ser maior que zero.' }
  }

  const parcelaValor = totalParcelado / parcelasQtd

  if (parcelaValor < 0) {
    return { entradaTotal, reforcoTotal, totalParcelado, parcelaValor, valido: false, erro: 'Entrada + reforços superam o valor total do imóvel.' }
  }

  return { entradaTotal, reforcoTotal, totalParcelado, parcelaValor, valido: true }
}
