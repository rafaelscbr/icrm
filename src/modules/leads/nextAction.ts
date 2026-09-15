import { AlertTriangle, Clock, CalendarClock, CircleDashed } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Lead, Task, LeadInteraction } from '../../types'
import { slaActive } from './SlaBadge'

/**
 * Próxima ação do lead — a informação que decide o dia do corretor.
 *
 * O card do Kanban dava destaque ao telefone, que é dado de contato, não de
 * decisão. Aqui a pergunta respondida é outra: "o que eu faço com este lead
 * agora?". Tudo é derivado de dado real, em ordem de urgência:
 *
 *   1. SLA de 1º contato vencido / vencendo   (leads.sla_due_at, trigger no banco)
 *   2. Tarefa vencida / de hoje / agendada    (tasks, via contato do lead)
 *   3. Silêncio prolongado                    (lead_interactions)
 *   4. Nenhuma ação definida                  (estado que precisa aparecer)
 *
 * O vínculo tarefa↔lead é direto desde a migração 058 (`tasks.lead_id`). Para
 * tarefas anteriores que o backfill não conseguiu desambiguar — mesmo contato
 * apontando para mais de um lead — o chamador ainda casa por `contactId`.
 */

export type ActionUrgency = 'critical' | 'attention' | 'neutral' | 'none'

export interface NextAction {
  /** Frase pronta para leitura — "Ligar hoje às 14h", "Sem interação há 3 dias". */
  text: string
  urgency: ActionUrgency
  /** Detalhe para tooltip/leitor de tela, quando houver. */
  hint?: string
}

const DAY = 86_400_000

function daysBetween(fromISO: string): number {
  return Math.floor((Date.now() - new Date(fromISO).getTime()) / DAY)
}

/** Diferença em dias entre hoje e uma data YYYY-MM-DD (negativo = passado). */
function daysUntilDate(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr + 'T00:00:00')
  return Math.round((target.getTime() - today.getTime()) / DAY)
}

function formatTaskWhen(t: Task): string {
  const diff = daysUntilDate(t.dueDate!)
  const hora = t.dueTime ? ` às ${t.dueTime}` : ''
  if (diff < 0)  return `venceu há ${Math.abs(diff)} ${Math.abs(diff) === 1 ? 'dia' : 'dias'}`
  if (diff === 0) return `hoje${hora}`
  if (diff === 1) return `amanhã${hora}`
  return `em ${diff} dias`
}

export function computeNextAction(
  lead: Lead,
  tasks: Task[],
  lastInteraction: LeadInteraction | null,
): NextAction {
  // ── 1. SLA de primeiro contato ────────────────────────────────────────────
  if (slaActive(lead)) {
    const msLeft = new Date(lead.slaDueAt!).getTime() - Date.now()
    if (msLeft <= 0) {
      return { text: 'SLA de 1º contato vencido', urgency: 'critical', hint: 'O lead pode ser transferido para outro corretor.' }
    }
    const min = Math.ceil(msLeft / 60_000)
    if (min <= 60) {
      return { text: `Retorno vence em ${min} min`, urgency: 'critical' }
    }
    const due = new Date(lead.slaDueAt!)
    const sameDay = due.toDateString() === new Date().toDateString()
    const quando = sameDay
      ? due.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : due.toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
    return { text: `1º contato até ${quando}`, urgency: 'attention' }
  }

  // ── 2. Tarefa vinculada (mais urgente primeiro) ───────────────────────────
  const abertas = tasks
    .filter(t => t.status !== 'done' && t.dueDate)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))

  if (abertas.length > 0) {
    const t = abertas[0]
    const diff = daysUntilDate(t.dueDate!)
    const urgency: ActionUrgency = diff < 0 ? 'critical' : diff === 0 ? 'attention' : 'neutral'
    return {
      text: `${t.title} · ${formatTaskWhen(t)}`,
      urgency,
      hint: abertas.length > 1 ? `${abertas.length} tarefas abertas neste lead` : undefined,
    }
  }

  // ── 3. Silêncio prolongado ────────────────────────────────────────────────
  const ref = lastInteraction?.interactedAt ?? lead.createdAt
  if (ref) {
    const d = daysBetween(ref)
    if (d > 7) return { text: `Sem interação há ${d} dias`, urgency: 'critical' }
    if (d > 2) return { text: `Sem interação há ${d} dias`, urgency: 'attention' }
  }

  // ── 4. Nada agendado ──────────────────────────────────────────────────────
  // Estado deliberadamente visível: a regra do produto é que nenhum lead ativo
  // fique sem próxima ação. Esconder isto seria esconder o problema.
  return { text: 'Sem próxima ação definida', urgency: 'none' }
}

/**
 * Estilo por urgência — cor NUNCA é o único indicador: frase + ícone próprio.
 *
 * `chip` só existe onde há risco ou prazo. Faixa tingida em todo card viraria
 * o mesmo paredão que o destaque tentava evitar; em dia, a linha fica limpa.
 *
 * Dentro da faixa o texto é t1 e o tom fica no ícone, no fundo e na borda:
 * âmbar e vermelho como COR DE TEXTO sobre o próprio fundo tingido ficavam em
 * 3.1:1 e 4.1:1 no tema claro — reprovados no AA para 12px.
 */
export const URGENCY_STYLE: Record<ActionUrgency, { text: string; iconColor: string; icon: LucideIcon; chip: string }> = {
  critical:  { text: 'text-t1', iconColor: 'text-error',   icon: AlertTriangle, chip: 'bg-error-bg border-error-line'     },
  attention: { text: 'text-t1', iconColor: 'text-warning', icon: Clock,         chip: 'bg-warning-bg border-warning-line' },
  neutral:   { text: 'text-t2', iconColor: 'text-t3',      icon: CalendarClock, chip: ''                                  },
  none:      { text: 'text-t3', iconColor: 'text-t3',      icon: CircleDashed,  chip: ''                                  },
}

/**
 * CTA primário por etapa. O verbo muda; a ação é sempre "abrir WhatsApp e
 * registrar o contato", que é como a operação de fato avança o lead.
 * Etapa `venda` não entra aqui — lá o CTA é concluir a venda.
 */
export const STAGE_CTA: Record<string, string> = {
  lead:        'Registrar contato',
  followup:    'Retomar conversa',
  atendimento: 'Dar sequência',
  visita:      'Confirmar visita',
  proposta:    'Cobrar retorno',
  venda:       'Registrar contato',
}
