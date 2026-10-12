import { PagamentoBase, ReforcoAvulso } from './types'

// Regras dos reforços, iguais para Pós-chaves e Direto. O modo individual
// troca o "N × valor" por uma lista de reforços com valor e mês/ano próprios.

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export const MESES_NOME = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

export function ehIndividual(base: PagamentoBase): boolean {
  return base.reforcoModo === 'individual'
}

/** Reforços individuais em ordem de data; os de valor zero não contam. */
export function reforcosValidos(base: PagamentoBase): ReforcoAvulso[] {
  return (base.reforcosAvulsos ?? [])
    .filter(r => r.valor > 0)
    .slice()
    .sort((a, b) => a.ano - b.ano || a.mes - b.mes)
}

export function totalReforcos(base: PagamentoBase): number {
  if (ehIndividual(base)) return reforcosValidos(base).reduce((s, r) => s + r.valor, 0)
  return base.reforcoQtd * base.reforcoValor
}

/** "mar/2027" */
export function rotuloMesAno(r: Pick<ReforcoAvulso, 'mes' | 'ano'>): string {
  return `${MESES_ABREV[r.mes - 1] ?? '—'}/${r.ano}`
}

/** Próximo mês a partir de hoje — ponto de partida do primeiro reforço. */
export function novoReforco(anterior?: ReforcoAvulso): ReforcoAvulso {
  const id = Math.random().toString(36).slice(2, 10)
  if (anterior) {
    // Sugere seis meses depois do último, com o mesmo valor: o caso comum é
    // ajustar um ou outro, não digitar tudo de novo.
    const idx = anterior.ano * 12 + (anterior.mes - 1) + 6
    return { id, valor: anterior.valor, mes: (idx % 12) + 1, ano: Math.floor(idx / 12) }
  }
  const hoje = new Date()
  const idx = hoje.getFullYear() * 12 + hoje.getMonth() + 1
  return { id, valor: 0, mes: (idx % 12) + 1, ano: Math.floor(idx / 12) }
}
