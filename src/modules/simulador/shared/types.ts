// Tipos compartilhados entre os modos do simulador.
// Cada modo (posChaves/, direto/, futuramente associativo/) define seu próprio
// Input/Result em calc.ts — aqui fica apenas o que é comum a todos.

export type ReforcoPeriodo = 'semestral' | 'anual'

/**
 * Como os reforços entram no fluxo:
 * - 'periodico': N reforços iguais, semestrais ou anuais (o padrão da tabela);
 * - 'individual': cada reforço com o próprio valor e mês/ano — o corretor monta
 *   o fluxo sob medida para o cliente (13º, PLR, venda de outro imóvel…).
 */
export type ReforcoModo = 'periodico' | 'individual'

export interface ReforcoAvulso {
  id: string
  valor: number
  /** 1–12 */
  mes: number
  ano: number
}

export type SimuladorModo = 'pos_chaves' | 'direto' | 'associativo'

/** Campos de pagamento comuns a todos os modos */
export interface PagamentoBase {
  entradaQtd: number
  entradaValor: number
  reforcoQtd: number
  reforcoValor: number
  reforcoPeriodo: ReforcoPeriodo
  /** ausente = 'periodico' */
  reforcoModo?: ReforcoModo
  /** usados só quando reforcoModo = 'individual' */
  reforcosAvulsos?: ReforcoAvulso[]
  parcelasQtd: number
}

/** Identificação compartilhada — vive no shell e sobrevive à troca de modo */
export interface SharedFields {
  empreendimento: string
  cliente: string
  /** só dígitos — com ele, o botão do WhatsApp abre a conversa do cliente */
  telefone: string
  valorTotal: number
}
