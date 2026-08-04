import { Lead } from '../../types'

/**
 * Reentrada — a pessoa voltou a se cadastrar por conta própria.
 *
 * É o sinal mais forte que um lead emite sem que ninguém peça, e até agora ele
 * chegava calado: virava uma nota na timeline que só se lê abrindo o card. Aqui
 * está a regra única de quando isso vira destaque na tela, para Kanban, lista e
 * painel do lead dizerem exatamente a mesma coisa.
 *
 * Dois casos, com peso comercial diferente:
 *
 *   `voltou`  — o lead JÁ estava no funil e preencheu outro formulário.
 *   `cliente` — quem já comprou voltou pelo anúncio. Lead novo, no funil de
 *               quem vendeu (o banco decide isso em process_meta_lead).
 *
 * O destaque é temporário de propósito: acende quando o banco registra a
 * reentrada e apaga quando o dono abre o lead. O fato em si não se perde — fica
 * na timeline, na notificação e em `reentryCount`. O que apaga é o "olha isto
 * agora", que não pode virar mais um enfeite permanente no funil.
 *
 * Cor: AZUL, não ouro. Ouro neste sistema significa dinheiro e meta, e é
 * racionado a um por tela (docs/principios-visuais.md). Reentrada é
 * informação/oportunidade — o mesmo tom de `reaquecendo` na régua de
 * temperatura, que é exatamente o que uma reentrada produz.
 */

export type TipoReentrada = 'voltou' | 'cliente'

export interface AvisoReentrada {
  tipo: TipoReentrada
  /** Frase curta do card — cabe em uma linha. */
  texto: string
  /** Explicação completa, para `title` e leitor de tela. */
  detalhe: string
}

/** Quando houver, o card deve destacar. `null` = nada a mostrar. */
export function avisoReentrada(lead: Lead): AvisoReentrada | null {
  if (!lead.reentryAt) return null
  // Visto depois de acontecer = já foi tratado.
  if (lead.reentrySeenAt && new Date(lead.reentrySeenAt) >= new Date(lead.reentryAt)) return null

  if (lead.returningFromLeadId) {
    return {
      tipo: 'cliente',
      texto: 'Já comprou · voltou a se cadastrar',
      detalhe:
        'Este cliente já fechou negócio com você e voltou a se cadastrar por um anúncio. ' +
        'O lead entrou direto no seu funil, sem rodízio e sem relógio de SLA.',
    }
  }

  const n = lead.reentryCount ?? 1
  return {
    tipo: 'voltou',
    texto: n > 1 ? `Voltou · ${n}º cadastro` : 'Voltou · preencheu de novo',
    detalhe:
      n > 1
        ? `Este lead já preencheu ${n} vezes o formulário estando no seu funil. Insistência é interesse — ligue.`
        : 'Este lead já estava no seu funil e preencheu o formulário de novo. Partiu dele, não de você.',
  }
}

/**
 * Ordenação: card com reentrada não vista sobe ao topo da coluna, seja qual for
 * o critério escolhido.
 *
 * Sem isto o destaque mentiria em metade dos casos — o corretor que ordena por
 * valor ou por tempo em etapa veria o aviso na quinta rolagem, quando o sentido
 * dele é ser a primeira coisa da coluna. É teto de dois ou três cards no dia
 * mais movimentado, não uma reordenação geral do funil.
 */
export function reentradaPrimeiro(a: Lead, b: Lead): number {
  return Number(!!avisoReentrada(b)) - Number(!!avisoReentrada(a))
}
