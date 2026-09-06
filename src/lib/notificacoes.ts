import type { AppNotification } from '../types'

/**
 * Agrupamento de notificações iguais.
 *
 * Cem avisos "Lead transferido para você — Dionata não registrou o 1º contato
 * em 5 min úteis" são UMA informação, não cem. O princípio 7 do sistema já diz
 * que evento agrupado vira uma linha; aqui é onde isso acontece para o sino,
 * o popover e a página.
 *
 * A chave é tipo + título + corpo + dia: o que se repete no mesmo dia vira
 * grupo; dois dias diferentes são dois grupos, porque "há 9h" e "há 3 dias"
 * pedem reações diferentes. Um item sozinho continua sendo um item.
 */

export interface GrupoNotificacao {
  chave: string
  tipo: AppNotification['type']
  titulo: string
  corpo?: string
  itens: AppNotification[]
  naoLidas: number
  /** ISO do item mais recente */
  maisRecente: string
  /** ISO do item mais antigo */
  maisAntigo: string
}

function diaLocal(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export function agruparNotificacoes(notificacoes: AppNotification[]): GrupoNotificacao[] {
  const grupos = new Map<string, GrupoNotificacao>()
  for (const n of notificacoes) {
    const chave = `${n.type}|${n.title}|${n.body ?? ''}|${diaLocal(n.createdAt)}`
    const g = grupos.get(chave)
    if (g) {
      g.itens.push(n)
      if (!n.read) g.naoLidas++
      if (n.createdAt > g.maisRecente) g.maisRecente = n.createdAt
      if (n.createdAt < g.maisAntigo)  g.maisAntigo  = n.createdAt
    } else {
      grupos.set(chave, {
        chave, tipo: n.type, titulo: n.title, corpo: n.body,
        itens: [n], naoLidas: n.read ? 0 : 1,
        maisRecente: n.createdAt, maisAntigo: n.createdAt,
      })
    }
  }
  // ordem: mais recente primeiro — a mesma da lista original
  return [...grupos.values()].sort((a, b) => b.maisRecente.localeCompare(a.maisRecente))
}

/** Rótulo do grupo em linguagem de gente: "21 leads transferidos para você". */
export function tituloDoGrupo(g: GrupoNotificacao): string {
  const n = g.itens.length
  if (n === 1) return g.titulo
  switch (g.tipo) {
    case 'lead_assigned':         return `${n} leads atribuídos a você`
    case 'lead_recaptured':       return `${n} leads transferidos para você`
    case 'lead_reentry':          return `${n} leads voltaram ao funil`
    case 'lead_returning_client': return `${n} clientes antigos voltaram`
    default:                      return `${n}× ${g.titulo}`
  }
}
