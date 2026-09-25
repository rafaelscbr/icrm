import { Lead } from '../../types'

/**
 * Tempo sem contato — a régua única do funil.
 *
 * Kanban (cabeçalho da coluna e linha de próxima ação), lista e filtros leem
 * daqui. Antes cada um calculava do seu jeito, a partir da última linha de
 * `lead_interactions` de QUALQUER tipo: a nota automática "Transferido
 * automaticamente" contava como contato, e o lead que ninguém atendeu parecia
 * recém-contatado. Agora a data vem de `leads.last_contact_at`, que o banco
 * mantém só com o que o corretor fez em direção ao cliente — WhatsApp,
 * ligação, tarefa concluída (migração 074).
 *
 * O sistema sabe que a conversa foi ABERTA, não que o cliente respondeu. Por
 * isso a tela escreve "último contato", nunca "última conversa".
 */

const DIA = 86_400_000

/** Janela em que o lead começa a esfriar — o âmbar do funil. */
export const ESFRIANDO_DIAS = 2
/** Janela em que o silêncio vira risco — o vermelho do funil. */
export const PARADO_DIAS = 7

/** Referência do relógio: último contato ou, sem nenhum, a entrada no funil. */
export function referenciaContato(lead: Lead): string {
  return lead.lastContactAt ?? lead.createdAt
}

export function msSemContato(lead: Lead, agora = Date.now()): number {
  return Math.max(0, agora - new Date(referenciaContato(lead)).getTime())
}

/** Dias inteiros sem contato (0 = hoje). */
export function diasSemContato(lead: Lead, agora = Date.now()): number {
  return Math.floor(msSemContato(lead, agora) / DIA)
}

/** Mais de `dias` dias sem contato — "há +2d" significa mais de 48 horas. */
export function semContatoHaMaisDe(lead: Lead, dias: number, agora = Date.now()): boolean {
  return msSemContato(lead, agora) > dias * DIA
}

export type NivelContato = 'em_dia' | 'esfriando' | 'parado'

export function nivelContato(lead: Lead, agora = Date.now()): NivelContato {
  if (semContatoHaMaisDe(lead, PARADO_DIAS, agora)) return 'parado'
  if (semContatoHaMaisDe(lead, ESFRIANDO_DIAS, agora)) return 'esfriando'
  return 'em_dia'
}

/** "hoje", "ontem", "há 5 dias" — sem inventar precisão que não existe. */
export function haQuantoTempo(dias: number): string {
  if (dias <= 0) return 'hoje'
  if (dias === 1) return 'ontem'
  return `há ${dias} dias`
}

/**
 * Frase do último contato para a tela. Sem contato registrado, o relógio
 * conta desde a entrada — e a frase diz isso, em vez de fingir um contato.
 */
export function fraseContato(lead: Lead, agora = Date.now()): string {
  const d = diasSemContato(lead, agora)
  if (!lead.lastContactAt) {
    return d <= 0 ? 'Sem contato ainda · entrou hoje' : `Nenhum contato em ${d} ${d === 1 ? 'dia' : 'dias'}`
  }
  return `Último contato ${haQuantoTempo(d)}`
}
