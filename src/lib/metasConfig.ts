/**
 * Fonte única de verdade para os alvos operacionais da Souza Imobiliária.
 * Todos os arquivos que precisam de números de meta importam daqui —
 * nunca redefinir localmente em tela ou store.
 */

export const DAILY_TARGETS = {
  disparos:   50,
  interacoes: 100,
  // Prospecção ativa por ligação. O piso é 10/dia por corretor — combinado
  // como MÍNIMO, não como teto. Uma "ligação" é um clique em "Ligar pelo
  // WhatsApp": não existe URL que inicie chamada, então o clique é o único
  // evento observável. Quem abriu a conversa e não ligou responde por isso.
  ligacoes:   10,
} as const

export const WEEKLY_TARGETS = {
  disparos:      250,  // 50 × 5 dias úteis
  interacoes:    500,  // 100 × 5 dias úteis
  ligacoes:       50,  // 10 × 5 dias úteis
  atendimentos:  2,
  propostas:     1,
} as const

export const MONTHLY_TARGETS = {
  disparos:      1000, // 50 × 20 dias úteis
  interacoes:    2000, // 100 × 20 dias úteis
  ligacoes:       200, // 10 × 20 dias úteis
  atendimentos:  8,
  propostas:     4,
  vendas:        1,
} as const

/** Meta de VGL bruto mensal em R$ */
export const VGL_COMPANY_DEFAULT = 1_000_000  // empresa (≈ 2 vendas)
export const VGL_BROKER_DEFAULT  = 500_000    // por corretor (≈ 1 venda)
