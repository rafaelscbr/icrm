import type { LeadFunnelStage } from '../types'

/**
 * Paleta "joia" das etapas (22/11/2026) — nasce do card Meta de VGV do
 * Dashboard (--hero-bg), que o Rafael elegeu como o padrão do sistema:
 *
 *   linear-gradient(140deg, #1A3F8F 0%, #12306E 48%, #0C2153 100%)
 *   + um brilho champanhe no canto de cima (radial, ~20%).
 *
 * Cada etapa é essa mesma receita num tom próprio, com a mesma profundidade
 * (claro → médio → fundo): o funil continua colorido, mas todas as cores
 * parecem da mesma família — e a família é a da marca (Marinho + Champanhe).
 *
 *   claro / medio / fundo — os três pontos do degradê (texto branco em cima)
 *   medio                  — a etapa sobre fundo branco: barras, pontos,
 *                             linhas, números coloridos (contraste ≥ 4,5:1)
 *
 * Usado no Kanban (setas, placar, progresso), no Pulse (funil) e no funil da
 * aba Conversão. Fonte única: mudar aqui muda nos três.
 */
export interface Joia { claro: string; medio: string; fundo: string }

export const JOIA: Record<LeadFunnelStage, Joia> = {
  // Um degrau mais claro que o card da meta (Rafael, 22/11/2026: "um pouco
  // mais claro, o azul da meta é bem claro") — mesma receita, mais luz.
  lead:        { claro: '#2A57B5', medio: '#1D4396', fundo: '#143275' },   // o azul da meta
  followup:    { claro: '#5B3DB0', medio: '#472D92', fundo: '#352072' },   // ametista
  atendimento: { claro: '#1C78B0', medio: '#155F91', fundo: '#0F4772' },   // oceano
  visita:      { claro: '#148A82', medio: '#0F6E68', fundo: '#0B534F' },   // petróleo
  proposta:    { claro: '#B07F33', medio: '#8F6627', fundo: '#6E4D1C' },   // bronze champanhe
  venda:       { claro: '#23955E', medio: '#1A7849', fundo: '#135B37' },   // esmeralda
}

/** O brilho champanhe do canto — a assinatura do card da meta. */
export const BRILHO_CHAMPANHE = 'radial-gradient(120% 140% at 100% 0%, rgba(214, 178, 110, 0.24) 0%, transparent 55%)'

/** O degradê da etapa, a 140°, como o card da meta. */
export function degradeJoia(etapa: LeadFunnelStage, angulo = 140): string {
  const j = JOIA[etapa]
  return `linear-gradient(${angulo}deg, ${j.claro} 0%, ${j.medio} 48%, ${j.fundo} 100%)`
}

/** Degradê + brilho champanhe, prontos para `background-image`. */
export function fundoJoia(etapa: LeadFunnelStage, angulo = 140): string {
  return `${BRILHO_CHAMPANHE}, ${degradeJoia(etapa, angulo)}`
}
