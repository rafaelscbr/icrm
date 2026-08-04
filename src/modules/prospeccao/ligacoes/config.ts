import {
  PhoneOff, PhoneMissed, Flame, XCircle, BellOff, Ban, Phone,
  CalendarClock, CircleDashed, CheckCircle2, Archive,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { CallOutcome, CallQueueStatus, CallCampaignStatus } from '../../../types'
import type { Tom } from './Primitivas'

/**
 * O funil de ligação.
 *
 * "Ligação feita" NÃO é coluna aqui, de propósito: é evento, não estado. Uma
 * coluna assim só engorda e nunca diz o que fazer em seguida. O que existe
 * depois de ligar é o que ACONTECEU — e cada desfecho tem um destino diferente.
 */

export interface CallStageConfig {
  value:     CallQueueStatus
  label:     string
  short:     string
  descricao: string
  /** ícone da coluna — cor sozinha nunca comunica status */
  icon:      LucideIcon
  /** tom semântico; as classes saem de Primitivas.TOM */
  tom:       Tom
}

/** Colunas do kanban, na ordem em que o lead as percorre. */
export const CALL_STAGES: CallStageConfig[] = [
  {
    value: 'fila', label: 'A ligar', short: 'A ligar',
    descricao: 'Nunca foi tocado nesta campanha',
    icon: CircleDashed, tom: 'neutro',
  },
  {
    value: 'tentativa', label: 'Tentando contato', short: 'Tentativa',
    descricao: 'Ligou e não falou — volta sozinho pela cadência',
    icon: PhoneMissed, tom: 'atencao',
  },
  {
    value: 'retorno_agendado', label: 'Retorno agendado', short: 'Retorno',
    descricao: 'Pediu para ligar depois, com hora marcada',
    icon: CalendarClock, tom: 'info',
  },
  {
    value: 'interessado', label: 'Demonstrou interesse', short: 'Interesse',
    descricao: 'Pronto para entrar no funil — transfira por aqui',
    icon: Flame, tom: 'marca',
  },
  {
    value: 'transferido', label: 'Transferido', short: 'Transferido',
    descricao: 'Virou lead no funil principal',
    icon: CheckCircle2, tom: 'sucesso',
  },
  {
    value: 'encerrado', label: 'Encerrado', short: 'Encerrado',
    descricao: 'Sem interesse, não perturbe, inválido ou não localizado',
    icon: Archive, tom: 'neutro',
  },
]

export const CALL_STAGE_BY_VALUE: Record<CallQueueStatus, CallStageConfig> =
  Object.fromEntries(CALL_STAGES.map(s => [s.value, s])) as Record<CallQueueStatus, CallStageConfig>

// ─── Desfechos ────────────────────────────────────────────────────────────────

export interface OutcomeConfig {
  value:   CallOutcome
  label:   string
  /** rótulo curto para o card e o histórico */
  short:   string
  icon:    LucideIcon
  tom:     Tom
  /** aparece na botoeira do discador (na ordem) */
  noDiscador: boolean
  /** true quando o desfecho só existe se houve conversa de verdade */
  falou:   boolean
  /** microcópia do que acontece com o lead ao escolher este desfecho */
  efeito?: string
}

export const CALL_OUTCOMES: OutcomeConfig[] = [
  {
    value: 'nao_atendeu', label: 'Não atendeu', short: 'não atendeu', icon: PhoneMissed,
    tom: 'atencao', noDiscador: true, falou: false,
    efeito: 'volta para a fila na próxima janela da cadência',
  },
  {
    value: 'pediu_retorno', label: 'Ligar depois', short: 'pediu retorno', icon: CalendarClock,
    tom: 'info', noDiscador: true, falou: true,
    efeito: 'volta ao topo da fila na hora que você marcar',
  },
  {
    value: 'interessado', label: 'Demonstrou interesse', short: 'interessado', icon: Flame,
    tom: 'marca', noDiscador: true, falou: true,
    efeito: 'sai da prospecção e vai para o funil comercial',
  },
  {
    value: 'sem_interesse', label: 'Sem interesse', short: 'sem interesse', icon: XCircle,
    tom: 'neutro', noDiscador: true, falou: true,
    efeito: 'encerra o lead nesta campanha',
  },
  {
    value: 'nao_perturbe', label: 'Não perturbe', short: 'não perturbe', icon: BellOff,
    tom: 'risco', noDiscador: true, falou: true,
    efeito: 'encerra e registra o pedido de não contato',
  },
  {
    value: 'numero_invalido', label: 'Número inválido', short: 'número inválido', icon: Ban,
    tom: 'risco', noDiscador: true, falou: false,
    efeito: 'marca o contato como inválido em todo o sistema',
  },
  {
    value: 'caixa_postal', label: 'Caixa postal', short: 'caixa postal', icon: PhoneOff,
    tom: 'atencao', noDiscador: false, falou: false,
    efeito: 'volta para a fila na próxima janela da cadência',
  },
  {
    value: 'discou', label: 'Ligação feita', short: 'ligação feita', icon: Phone,
    tom: 'neutro', noDiscador: false, falou: false,
  },
]

export const OUTCOME_BY_VALUE: Record<CallOutcome, OutcomeConfig> =
  Object.fromEntries(CALL_OUTCOMES.map(o => [o.value, o])) as Record<CallOutcome, OutcomeConfig>

/** Botoeira do discador, na ordem de frequência real de uso. */
export const OUTCOMES_DISCADOR = CALL_OUTCOMES.filter(o => o.noDiscador)

export const CLOSE_REASON_LABEL: Record<string, string> = {
  sem_interesse:   'Sem interesse',
  nao_perturbe:    'Pediu para não receber',
  numero_invalido: 'Número inválido',
  nao_localizado:  'Não localizado',
}

export const CALL_STATUS_CONFIG: Record<CallCampaignStatus, { label: string; tom: Tom }> = {
  active:   { label: 'Ativa',      tom: 'sucesso' },
  paused:   { label: 'Pausada',    tom: 'atencao' },
  finished: { label: 'Finalizada', tom: 'neutro'  },
}

/** Cadência padrão em horas, por número da tentativa. */
export const CADENCIA_PADRAO = [4, 24, 72, 168]

export function descreveCadencia(horas: number[]): string {
  return horas.map(h =>
    h < 24 ? `${h}h` : h === 24 ? '1 dia' : h % 168 === 0 ? `${h / 168} sem` : `${Math.round(h / 24)} dias`
  ).join(' · ')
}

/** "há 3 min", "há 2 h", "há 4 dias" — sem dependência de biblioteca de datas. */
export function tempoRelativo(iso?: string): string {
  if (!iso) return '—'
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1)     return 'agora'
  if (min < 60)    return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24)      return `há ${h} h`
  const d = Math.floor(h / 24)
  return d === 1 ? 'ontem' : `há ${d} dias`
}

/** "em 4 h", "amanhã 9h" — para o próximo toque agendado. */
export function quandoVolta(iso?: string): string {
  if (!iso) return '—'
  const alvo = new Date(iso)
  const min  = Math.round((alvo.getTime() - Date.now()) / 60000)
  if (min <= 0)  return 'disponível agora'
  if (min < 60)  return `em ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24)    return `em ${h} h`
  return alvo.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
