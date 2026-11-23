import type { LeadFunnelStage } from '../../types'
import { FUNNEL_STAGES } from '../../lib/stageTheme'
import { divisao, PCT_PADRAO } from '../leads/comissao'

/**
 * O Kanban da imobiliária inteira, na segunda tela do Pulse (23/11/2026).
 * Funções puras — o store aplica, a tela desenha.
 *
 * CUSTO (pedido do Rafael: "sem gastar requisições"):
 *   • UMA leitura dos leads em aberto (+ os vendidos do mês), junto com o
 *     snapshot da sala: ~150 linhas, 10 colunas, dezenas de kB. Refeita só
 *     quando o snapshot é refeito (abertura, virada do dia, reconexão fria).
 *   • Depois, NENHUMA consulta: os cartões andam com os eventos que o canal do
 *     Pulse já recebe (INSERT em leads, lead_interactions e lead_assignments).
 *     Nenhum binding novo no canal — nenhuma mensagem de realtime a mais.
 *
 * O que NÃO chega ao vivo (é UPDATE, e o Pulse só escuta INSERT de propósito):
 * troca de tipologia/valor de um lead e lead descartado que volta. Aparecem na
 * próxima leitura (no máximo, a virada do dia).
 */

export interface CartaoSala {
  id: string
  nome: string
  etapa: LeadFunnelStage
  brokerId: string | null
  vgv: number
  produto: string | null
  devId: string | null
  /** desde quando está na etapa (ISO) — ordena a coluna, mais recente em cima */
  desde: string
  /** mexeu ao vivo nesta sessão (ms) — o cartão acende por alguns segundos */
  vivoAt?: number
}

const ETAPAS = new Set<string>(FUNNEL_STAGES)

/** Linha do banco (select da leitura ou payload do INSERT) → cartão. */
export function cartaoDaLinha(r: Record<string, unknown>): CartaoSala | null {
  const etapa = r.funnel_stage as string
  if (!ETAPAS.has(etapa)) return null
  return {
    id:       r.id as string,
    nome:     (r.name as string | null) ?? 'Lead',
    etapa:    etapa as LeadFunnelStage,
    brokerId: (r.broker_id as string | null) ?? null,
    vgv:      Number(r.average_ticket ?? 0) || 0,
    produto:  (r.property_name as string | null) ?? null,
    devId:    (r.development_id as string | null) ?? null,
    desde:    ((r.stage_changed_at ?? r.created_at) as string | null) ?? new Date().toISOString(),
  }
}

/** Lead novo: entra no quadro (se ainda não estiver). */
export function entrar(cartoes: CartaoSala[], c: CartaoSala, agora = Date.now()): CartaoSala[] {
  if (cartoes.some(x => x.id === c.id)) return cartoes
  return [...cartoes, { ...c, vivoAt: agora }]
}

/** Mudança de etapa (interação stage_change). Lead fora do quadro é ignorado. */
export function mover(cartoes: CartaoSala[], id: string, para: string | undefined, at: string, agora = Date.now()): CartaoSala[] {
  if (!para || !ETAPAS.has(para)) return cartoes
  let mudou = false
  const out = cartoes.map(c => {
    if (c.id !== id || c.etapa === para) return c
    mudou = true
    return { ...c, etapa: para as LeadFunnelStage, desde: at, vivoAt: agora }
  })
  return mudou ? out : cartoes
}

/** Descarte: sai do quadro. */
export function tirar(cartoes: CartaoSala[], id: string): CartaoSala[] {
  return cartoes.some(c => c.id === id) ? cartoes.filter(c => c.id !== id) : cartoes
}

/** O lead mudou de mão (roleta, rodízio, transferência). */
export function trocarDono(cartoes: CartaoSala[], id: string, brokerId: string | null, agora = Date.now()): CartaoSala[] {
  let mudou = false
  const out = cartoes.map(c => {
    if (c.id !== id || c.brokerId === brokerId) return c
    mudou = true
    return { ...c, brokerId, vivoAt: agora }
  })
  return mudou ? out : cartoes
}

export interface DinheiroSala { vgv: number; bruta: number; corretor: number; souza: number }

export const DINHEIRO_ZERO: DinheiroSala = { vgv: 0, bruta: 0, corretor: 0, souza: 0 }

/** A conta da casa (comissao.ts): % do produto, −3% ISS, −6% Simples, parte do corretor. */
export function dinheiroDoCartao(
  c: CartaoSala,
  shareDe: (brokerId: string | null) => number | null,
  pctDe: (devId: string | null) => number | undefined,
): DinheiroSala {
  if (!c.vgv) return DINHEIRO_ZERO
  const d = divisao(c.vgv, shareDe(c.brokerId), pctDe(c.devId) || PCT_PADRAO)
  return { vgv: c.vgv, bruta: d.bruta, corretor: d.corretor, souza: d.souza }
}

export function somar(a: DinheiroSala, b: DinheiroSala): DinheiroSala {
  return { vgv: a.vgv + b.vgv, bruta: a.bruta + b.bruta, corretor: a.corretor + b.corretor, souza: a.souza + b.souza }
}

export interface ColunaSala {
  etapa: LeadFunnelStage
  cartoes: CartaoSala[]
  dinheiro: DinheiroSala
}

/** As seis colunas, cada uma com o mais recente em cima e o dinheiro somado. */
export function colunasDaSala(
  cartoes: CartaoSala[],
  shareDe: (brokerId: string | null) => number | null,
  pctDe: (devId: string | null) => number | undefined,
): ColunaSala[] {
  return FUNNEL_STAGES.map(etapa => {
    const daEtapa = cartoes
      .filter(c => c.etapa === etapa)
      .sort((a, b) => (b.vivoAt ?? 0) - (a.vivoAt ?? 0) || b.desde.localeCompare(a.desde))
    return {
      etapa,
      cartoes: daEtapa,
      dinheiro: daEtapa.reduce((t, c) => somar(t, dinheiroDoCartao(c, shareDe, pctDe)), DINHEIRO_ZERO),
    }
  })
}
