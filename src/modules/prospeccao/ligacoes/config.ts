import {
  PhoneOff, PhoneMissed, Flame, XCircle, BellOff, Ban, Phone,
  CalendarClock, CircleDashed, CheckCircle2, Archive,
  Voicemail, MessageSquareOff,
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

/**
 * Três grupos, e o grupo é que manda.
 *
 * Antes eram seis botões soltos numa grade 2×3, sem hierarquia: o corretor
 * relia os seis a cada ligação. Pior que o atrito, era a conta — "não atendeu"
 * e "número inválido" caíam no mesmo balde, então a taxa de atendimento
 * misturava *ninguém atendeu* com *esse número não existe*. Um é problema de
 * cadência, o outro é de base. Somados, não significam nada.
 *
 *   `falou`      houve conversa. É o numerador da taxa de contato.
 *   `naoFalou`   a tentativa foi legítima e o esforço conta; não houve conversa.
 *   `naoFoi`     a ligação não chegou a existir — fora da meta e fora da conta.
 */
export type OutcomeGrupo = 'falou' | 'naoFalou' | 'naoFoi'

export interface GrupoConfig {
  value:     OutcomeGrupo
  titulo:    string
  descricao: string
}

export const OUTCOME_GRUPOS: GrupoConfig[] = [
  {
    value: 'falou', titulo: 'Falou com a pessoa',
    descricao: 'Houve conversa — é daqui que sai interesse',
  },
  {
    value: 'naoFalou', titulo: 'Não conversou',
    descricao: 'A tentativa valeu, mas ninguém falou',
  },
  {
    value: 'naoFoi', titulo: 'Não foi possível ligar',
    descricao: 'A ligação não aconteceu — não conta para a meta do dia',
  },
]

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
  /** grupo na botoeira e nos relatórios */
  grupo:   OutcomeGrupo
  /** microcópia do que acontece com o lead ao escolher este desfecho */
  efeito?: string
}

export const CALL_OUTCOMES: OutcomeConfig[] = [
  // ── Falou com a pessoa ────────────────────────────────────────────────────
  {
    value: 'interessado', label: 'Demonstrou interesse', short: 'interessado', icon: Flame,
    tom: 'marca', noDiscador: true, falou: true, grupo: 'falou',
    efeito: 'sai da prospecção e vai para o funil comercial',
  },
  {
    value: 'pediu_retorno', label: 'Ligar em outro horário', short: 'pediu retorno', icon: CalendarClock,
    tom: 'info', noDiscador: true, falou: true, grupo: 'falou',
    efeito: 'volta ao topo da fila na hora que você marcar',
  },
  {
    value: 'sem_interesse', label: 'Não tem interesse', short: 'sem interesse', icon: XCircle,
    tom: 'neutro', noDiscador: true, falou: true, grupo: 'falou',
    efeito: 'encerra o lead nesta campanha',
  },
  {
    value: 'nao_perturbe', label: 'Pediu para não ligar mais', short: 'não perturbe', icon: BellOff,
    tom: 'risco', noDiscador: true, falou: true, grupo: 'falou',
    efeito: 'encerra e registra o pedido de não contato',
  },

  // ── Não conversou ─────────────────────────────────────────────────────────
  {
    value: 'nao_atendeu', label: 'Não atendeu', short: 'não atendeu', icon: PhoneMissed,
    tom: 'atencao', noDiscador: true, falou: false, grupo: 'naoFalou',
    efeito: 'volta para a fila na próxima janela da cadência',
  },
  {
    value: 'caixa_postal', label: 'Caixa postal', short: 'caixa postal', icon: Voicemail,
    tom: 'atencao', noDiscador: true, falou: false, grupo: 'naoFalou',
    efeito: 'volta para a fila na próxima janela da cadência',
  },
  {
    /* Alcançou a pessoa e ela recusou na hora. Sem este botão vira "não
       atendeu", e uma rejeição ativa passa a se parecer com telefone tocando
       no vazio — que é o oposto: uma é abordagem, a outra é disponibilidade. */
    value: 'atendeu_desligou', label: 'Atendeu e desligou', short: 'atendeu e desligou', icon: PhoneOff,
    tom: 'atencao', noDiscador: true, falou: false, grupo: 'naoFalou',
    efeito: 'conta como tentativa e volta pela cadência',
  },

  // ── Não foi possível ligar (fora da meta) ─────────────────────────────────
  {
    /* O único que queima o contato na base inteira — por isso continua sozinho
       nessa responsabilidade. */
    value: 'numero_invalido', label: 'Número inválido', short: 'número inválido', icon: Ban,
    tom: 'risco', noDiscador: true, falou: false, grupo: 'naoFoi',
    efeito: 'marca o contato como inválido em todo o sistema',
  },
  {
    /* A ligação deste módulo acontece dentro do WhatsApp. Sem este botão o
       corretor marcaria "número inválido" e queimaria na base um telefone que
       pode estar perfeitamente certo — só não serve para ESTE canal. */
    value: 'sem_whatsapp', label: 'Não tem WhatsApp', short: 'sem WhatsApp', icon: MessageSquareOff,
    tom: 'neutro', noDiscador: true, falou: false, grupo: 'naoFoi',
    efeito: 'encerra nesta campanha sem invalidar o contato',
  },
  {
    /* Condição temporária: desligado agora pode estar ligado amanhã. Não conta
       para a meta, mas continua na roda da cadência. */
    value: 'telefone_desligado', label: 'Telefone desligado', short: 'desligado', icon: PhoneOff,
    tom: 'neutro', noDiscador: true, falou: false, grupo: 'naoFoi',
    efeito: 'volta pela cadência, mas não conta para a meta',
  },

  // ── Estado intermediário, nunca um botão ──────────────────────────────────
  {
    value: 'discou', label: 'Tentativa sem desfecho', short: 'sem desfecho', icon: Phone,
    tom: 'neutro', noDiscador: false, falou: false, grupo: 'naoFalou',
  },
]

export const OUTCOME_BY_VALUE: Record<CallOutcome, OutcomeConfig> =
  Object.fromEntries(CALL_OUTCOMES.map(o => [o.value, o])) as Record<CallOutcome, OutcomeConfig>

/** Botoeira do discador, agrupada — a ordem dentro do grupo é a de uso real. */
export const OUTCOMES_DISCADOR = CALL_OUTCOMES.filter(o => o.noDiscador)

export const OUTCOMES_POR_GRUPO = OUTCOME_GRUPOS.map(g => ({
  ...g,
  opcoes: OUTCOMES_DISCADOR.filter(o => o.grupo === g.value),
}))

/**
 * Tentativa que não chegou a ser ligação não conta para a meta de 10/dia.
 * Espelha a coluna gerada `call_logs.conta_meta` (migração 072) — a regra vive
 * no banco; aqui é só para a tela poder explicar sem consultar.
 */
export function contaParaMeta(o: CallOutcome): boolean {
  return OUTCOME_BY_VALUE[o]?.grupo !== 'naoFoi'
}

export const CLOSE_REASON_LABEL: Record<string, string> = {
  sem_interesse:   'Sem interesse',
  nao_perturbe:    'Pediu para não ligar mais',
  numero_invalido: 'Número inválido',
  sem_whatsapp:    'Não tem WhatsApp',
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
