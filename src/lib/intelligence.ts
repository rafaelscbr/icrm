/**
 * Inteligência comercial do lead — as duas notas que o sistema calcula sozinho.
 *
 * Temperatura mede o que o LEAD faz (respondeu, aceitou agendar, compareceu,
 * preencheu de novo). O que o corretor faz — mover card, ligar, registrar o
 * primeiro contato — não esquenta ninguém, senão o número vira termômetro de
 * esforço em vez de interesse.
 *
 * Encaixe é por produto, não do lead: o mesmo perfil pode ser Ideal num
 * empreendimento e Difícil em outro. Nenhum dos dois decide QUEM é atendido —
 * decidem por onde começar a conversa e o que levar para ela.
 */

export type Temperature = 'novo' | 'morno' | 'quente' | 'frio' | 'reaquecendo' | 'ganho'
export type Fit = 'ideal' | 'possivel' | 'dificil' | 'sem_dados'

export interface IntelReason { sign: '+' | '-' | '='; text: string }

export interface FitResult {
  developmentId: string
  name: string
  isOrigin: boolean
  fit: Fit
  reasons: { field: string; fit: Fit | 'info'; text: string }[]
}

export interface LeadIntel {
  temperature: Temperature
  tempScore: number
  tempReasons: IntelReason[]
  fits: FitResult[]
  /** Encaixe com o produto que trouxe o lead. */
  fitOrigin?: FitResult
  /** Melhor alternativa quando o de origem não serve. */
  fitBest?: FitResult
}

export const TEMPERATURE_LABEL: Record<Temperature, string> = {
  novo:        'Novo',
  morno:       'Morno',
  quente:      'Quente',
  frio:        'Frio',
  reaquecendo: 'Reaquecendo',
  ganho:       'Ganho',
}

/**
 * Cor por estado. Ouro só no que pede ação hoje (quente); azul no reaquecendo,
 * que é raro e o mais valioso do funil; cinza no resto, para o Kanban não virar
 * árvore de Natal.
 */
export const TEMPERATURE_COLOR: Record<Temperature, string> = {
  quente:      'var(--brand)',
  reaquecendo: 'var(--info)',
  morno:       'var(--t3)',
  novo:        'var(--t4)',
  frio:        'var(--line-strong)',
  ganho:       'var(--success)',
}

export const TEMPERATURE_TEXT: Record<Temperature, string> = {
  quente:      'text-brand-text',
  reaquecendo: 'text-info',
  morno:       'text-t2',
  novo:        'text-t3',
  frio:        'text-t4',
  ganho:       'text-success',
}

export const FIT_LABEL: Record<Fit, string> = {
  ideal:     'Ideal',
  possivel:  'Possível',
  dificil:   'Difícil',
  sem_dados: 'Sem dados',
}

export const FIT_COLOR: Record<Fit, string> = {
  ideal:     'var(--success)',
  possivel:  'var(--brand)',
  dificil:   'var(--warning)',
  sem_dados: 'var(--t4)',
}

export const FIT_TEXT: Record<Fit, string> = {
  ideal:     'text-success',
  possivel:  'text-brand-text',
  dificil:   'text-warning',
  sem_dados: 'text-t4',
}

/**
 * Vale destacar no card? Ideal e Difícil mudam a jogada — Ideal é por onde
 * começar, Difícil avisa que a conversa tem trava. Possível e Sem dados são a
 * maioria e não decidem nada: mostrá-los seria ruído em todo card do funil.
 */
export function fitDeserveBadge(fit?: Fit): boolean {
  return fit === 'ideal' || fit === 'dificil'
}

/** Prioridade P1–P5 do cruzamento temperatura × encaixe. */
export function priority(t: Temperature, f?: Fit): 1 | 2 | 3 | 4 | 5 | null {
  if (t === 'ganho') return null
  const ativo = t === 'quente' || t === 'reaquecendo'
  const morno = t === 'morno' || t === 'novo'
  if (f === 'ideal')     return ativo ? 1 : morno ? 2 : 3
  if (f === 'possivel')  return ativo ? 1 : morno ? 3 : 4
  if (f === 'dificil')   return ativo ? 2 : 4
  return ativo ? 2 : morno ? 4 : 5
}
