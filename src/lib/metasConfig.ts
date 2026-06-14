/**
 * Fonte única de verdade para os alvos operacionais da Souza Imobiliária.
 * Todos os arquivos que precisam de números de meta importam daqui —
 * nunca redefinir localmente em tela ou store.
 */

export const DAILY_TARGETS = {
  disparos:   50,
  interacoes: 100,
} as const

export const WEEKLY_TARGETS = {
  disparos:      250,  // 50 × 5 dias úteis
  atendimentos:  2,
  propostas:     1,
} as const

export const MONTHLY_TARGETS = {
  disparos:      1000, // 50 × 20 dias úteis
  atendimentos:  8,
  propostas:     4,
  vendas:        1,
} as const

/** Meta central da imobiliária: VGL bruto mensal em R$ */
export const VGL_MONTHLY_DEFAULT = 500_000
