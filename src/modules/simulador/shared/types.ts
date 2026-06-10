// Tipos compartilhados entre os modos do simulador.
// Cada modo (posChaves/, direto/, futuramente associativo/) define seu próprio
// Input/Result em calc.ts — aqui fica apenas o que é comum a todos.

export type ReforcoPeriodo = 'semestral' | 'anual'

export type SimuladorModo = 'pos_chaves' | 'direto' | 'associativo'

/** Campos de pagamento comuns a todos os modos */
export interface PagamentoBase {
  entradaQtd: number
  entradaValor: number
  reforcoQtd: number
  reforcoValor: number
  reforcoPeriodo: ReforcoPeriodo
  parcelasQtd: number
}

/** Identificação compartilhada — vive no shell e sobrevive à troca de modo */
export interface SharedFields {
  empreendimento: string
  cliente: string
  valorTotal: number
}
