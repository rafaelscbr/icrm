import { Development } from '../../types'

/**
 * Nomenclatura da qualificação — quatro palavras, nada mais.
 *
 * A versão anterior falava em "compatível com ajuste", "fora da régua
 * declarada", "sem dado ainda". Ninguém fala assim. Cada rótulo aqui tem UMA
 * palavra, é lido sem explicação e descreve o ENCAIXE, não a pessoa: "Difícil"
 * é o quanto vai dar trabalho, não um veredito sobre quem preencheu o formulário.
 *
 * Nenhum destes estados decide quem é atendido — todos são. O estado diz por
 * onde começar a conversa e o que levar para ela.
 */
export type Fit = 'ideal' | 'possivel' | 'dificil' | 'sem_dados'

export const FIT_LABEL: Record<Fit, string> = {
  ideal:     'Ideal',
  possivel:  'Possível',
  dificil:   'Difícil',
  sem_dados: 'Sem dados',
}

/** O que fazer com cada um — a frase que o corretor lê no card. */
export const FIT_ACTION: Record<Fit, string> = {
  ideal:     'Atender já sabendo o caminho',
  possivel:  'Simular o fluxo antes de falar de preço',
  dificil:   'Atender e testar outro produto',
  sem_dados: 'Descobrir só o que falta',
}

/**
 * Cores por token — nunca cor sozinha como indicador (WCAG 1.4.1): todo lugar
 * que usa isto mostra o rótulo em texto junto.
 */
export const FIT_STYLE: Record<Fit, { text: string; bg: string; border: string; dot: string }> = {
  ideal:     { text: 'text-success', bg: 'bg-success-bg', border: 'border-success-line', dot: 'bg-success' },
  possivel:  { text: 'text-brand-text', bg: 'bg-brand-tint', border: 'border-brand/25', dot: 'bg-brand' },
  dificil:   { text: 'text-warning', bg: 'bg-warning-bg', border: 'border-warning-line', dot: 'bg-warning' },
  sem_dados: { text: 'text-t3', bg: 'bg-s2', border: 'border-line', dot: 'bg-t4' },
}

// ─── Faixas ──────────────────────────────────────────────────────────────────

/**
 * O lead nunca informa um valor: informa uma faixa ("de R$ 8 a 15 mil").
 * `max: undefined` = faixa aberta para cima ("acima de R$ 50 mil").
 */
export interface Range {
  min: number
  max?: number
}

/**
 * Compara a faixa declarada com a régua do produto.
 *
 * O caso que importa é o terceiro: quando a faixa CRUZA o mínimo, o sistema não
 * tem como saber. Um lead que marcou "R$ 5 a 10 mil" contra uma régua de R$ 8
 * mil pode passar ou não. Chutar aqui seria inventar dado financeiro — devolve
 * 'possivel' e quem resolve é o corretor, perguntando.
 */
export function compareRange(faixa: Range | undefined, min?: number, ideal?: number): Fit {
  if (!faixa) return 'sem_dados'
  if (min === undefined && ideal === undefined) return 'sem_dados'

  const teto = faixa.max ?? Infinity
  const piso = faixa.min

  // A faixa inteira está abaixo do mínimo — não alcança de jeito nenhum.
  if (min !== undefined && teto < min) return 'dificil'

  // A faixa inteira está acima do ideal — alcança com folga.
  if (ideal !== undefined && piso >= ideal) return 'ideal'

  // Passa o mínimo com certeza, mas não chega ao ideal.
  if (min !== undefined && piso >= min) return 'possivel'

  // Cruza o mínimo: pode ou não. Não inventa.
  return 'possivel'
}

/** O pior estado manda — uma trava basta para o encaixe deixar de ser Ideal. */
export function combineFits(fits: Fit[]): Fit {
  const reais = fits.filter(f => f !== 'sem_dados')
  if (reais.length === 0) return 'sem_dados'
  if (reais.includes('dificil')) return 'dificil'
  if (reais.includes('possivel')) return 'possivel'
  return 'ideal'
}

// ─── Régua do produto ────────────────────────────────────────────────────────

/**
 * O FGTS é critério quando o produto diz que ele compõe a entrada — e só isso.
 *
 * Antes isto exigia `regime === 'associativo'`, e o Belíssimo mostrou o erro:
 * o financiamento dele é IMEDIATO na Caixa, então o saldo entra na conta hoje,
 * sem a obra ser associativa. Regime e FGTS descrevem coisas diferentes —
 * um diz como a obra é financiada, o outro se o saldo abate a entrada.
 *
 * Onde não compõe (Porto Velas, San Pellegrino), o sistema ignora por completo:
 * não pergunta e não marca o lead como incompleto por não ter respondido.
 */
export function fgtsIsCriterion(d: Development): boolean {
  return d.fgtsComposes
}

/** A régua está utilizável? Sem isso, nada pode classificar lead. */
export function reguaCompleta(d: Development): boolean {
  return d.confirmed && (d.incomeMin !== undefined || d.downPaymentMin !== undefined)
}

/** O que ainda falta preencher — vira a lista de pendências na tela. */
export function pendenciasDaRegua(d: Development): string[] {
  const faltando: string[] = []
  if (d.incomeMin === undefined)      faltando.push('renda mínima')
  if (d.downPaymentMin === undefined) faltando.push('entrada mínima')
  if (!d.region)                      faltando.push('região')
  if (d.valueMin === undefined && d.valueMax === undefined) faltando.push('faixa de valor')
  if (!d.confirmed)                   faltando.push('confirmação da régua')
  return faltando
}
