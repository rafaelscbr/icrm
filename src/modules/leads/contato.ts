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

/**
 * Janela do followup atrasado: passou de 24h sem contato, atrasou. Era 2 dias
 * até 24/11/2026; o Rafael alinhou com a cor do cartão no Kanban (24h,
 * DESTAQUE_HORAS) para a aba Followup, o filtro e o cartão contarem igual.
 */
export const ESFRIANDO_DIAS = 1
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
  // Entre 24 e 48 h, em horas: "ontem" escondia que já passou de um dia.
  if (d === 1) return `Último contato há ${Math.floor(msSemContato(lead, agora) / 3_600_000)} h`
  return `Último contato ${haQuantoTempo(d)}`
}

/**
 * As cores do contato no cartão (Rafael, 26/11/2026). O ideal é o corretor
 * passar por TODOS os leads TODO dia, sem esperar o ciclo de 24 h:
 *
 *   azul      falou hoje (contato registrado desde a meia-noite)
 *   amarelo   ainda não passou hoje — à meia-noite, quem foi contatado ontem
 *             vira amarelo
 *   laranja   24 h sem contato
 *   vermelho  48 h sem contato — gritante
 *
 * Só em Followup e Atendimento; as outras etapas ficam brancas. O relógio
 * corre todo dia, fim de semana inclusive. "Contato" é o de sempre:
 * leads.last_contact_at (WhatsApp, ligação, tarefa concluída — migração 074);
 * sem contato nenhum, conta desde a entrada no funil (e não fica azul).
 * Antes (24/11) era uma cor só: o rosado de "followup atrasado" passadas 24 h.
 */
export const DESTAQUE_HORAS = 24
export const GRITANTE_HORAS = 48

/** As etapas que ganham cor. */
export const ETAPAS_COM_COR = ['followup', 'atendimento'] as const

export type TomContato = 'hoje' | 'pendente' | 'h24' | 'h48'

export const TOM_CONTATO: Record<TomContato, { rotulo: string; dica: string; classe: string }> = {
  hoje: {
    rotulo: 'Em dia',
    dica: 'Contato registrado hoje (WhatsApp, ligação ou tarefa concluída)',
    classe: 'kanban-tom kanban-tom-hoje',
  },
  pendente: {
    rotulo: 'Falta passar hoje',
    dica: `Ainda sem contato hoje, menos de ${DESTAQUE_HORAS} h desde o último`,
    classe: 'kanban-tom kanban-tom-pendente',
  },
  h24: {
    rotulo: `${DESTAQUE_HORAS} h sem contato`,
    dica: `De ${DESTAQUE_HORAS} a ${GRITANTE_HORAS} h sem contato`,
    classe: 'kanban-tom kanban-tom-24h',
  },
  h48: {
    rotulo: `${GRITANTE_HORAS} h sem contato`,
    dica: `Mais de ${GRITANTE_HORAS} h sem contato`,
    classe: 'kanban-tom kanban-tom-48h',
  },
}

/** Followup atrasado = laranja ou vermelho (mais de 24 h). É o que o filtro e o risco da coluna contam. */
export function estaAtrasado(tom: TomContato | null): boolean {
  return tom === 'h24' || tom === 'h48'
}

function mesmoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function tomDoContato(
  lead: { lastContactAt?: string | null; createdAt: string; funnelStage: string; closedAt?: string | null; discardReason?: unknown },
  agora = Date.now(),
): TomContato | null {
  if (!(ETAPAS_COM_COR as readonly string[]).includes(lead.funnelStage) || lead.closedAt || lead.discardReason) return null
  const ref = new Date(lead.lastContactAt ?? lead.createdAt)
  const horas = (agora - ref.getTime()) / 3_600_000
  if (horas > GRITANTE_HORAS) return 'h48'
  if (horas > DESTAQUE_HORAS) return 'h24'
  if (lead.lastContactAt && mesmoDia(ref, new Date(agora))) return 'hoje'
  return 'pendente'
}
