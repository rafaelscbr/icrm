export interface FluxoInput {
  valorTotal: number
  pctChaves: number
  entradaQtd: number
  entradaValor: number
  reforcoQtd: number
  reforcoValor: number
  parcelasQtd: number
}

export interface FluxoResult {
  valorAteChaves: number
  saldoDevedor: number
  entradaTotal: number
  reforcoTotal: number
  parcelaValor: number
  valido: boolean
  erro?: string
}

export function calcularFluxo(input: FluxoInput): FluxoResult {
  const { valorTotal, pctChaves, entradaQtd, entradaValor, reforcoQtd, reforcoValor, parcelasQtd } = input

  const valorAteChaves = valorTotal * (pctChaves / 100)
  const saldoDevedor   = valorTotal - valorAteChaves
  const entradaTotal   = entradaQtd * entradaValor
  const reforcoTotal   = reforcoQtd * reforcoValor
  const restoParcelas  = valorAteChaves - entradaTotal - reforcoTotal

  if (parcelasQtd <= 0) {
    return { valorAteChaves, saldoDevedor, entradaTotal, reforcoTotal, parcelaValor: 0, valido: false, erro: 'Número de parcelas deve ser maior que zero.' }
  }

  const parcelaValor = restoParcelas / parcelasQtd

  if (parcelaValor < 0) {
    return { valorAteChaves, saldoDevedor, entradaTotal, reforcoTotal, parcelaValor, valido: false, erro: 'Entrada + reforços superam o valor até as chaves.' }
  }

  return { valorAteChaves, saldoDevedor, entradaTotal, reforcoTotal, parcelaValor, valido: true }
}
