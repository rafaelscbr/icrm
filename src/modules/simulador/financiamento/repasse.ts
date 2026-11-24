import type { PaymentPlan } from '../../../types'
import { idadeHoje, ParametrosBanco, ResultadoSimulacao, simular } from './calc'

/**
 * Renda do repasse na ficha do lead (24/11/2026) — automática, sem simular.
 *
 * O lead já está ligado a uma tipologia da carteira (migração 108). Dela saem
 * o preço e o % financiado (fluxo da tabela); do perfil saem a renda declarada
 * e a idade. A conta é a do Simulador de financiamento — como se o imóvel
 * estivesse pronto, em valores de hoje, sem correção da obra — no PIOR
 * CENÁRIO, como o Rafael pediu:
 *
 *   • renda do cliente = o PISO da faixa declarada ("R$ 5 a 10 mil" → R$ 5 mil);
 *   • SAC (a 1ª parcela é a maior e é a que o banco olha);
 *   • sem idade, prazo máximo do banco e o maior MIP da tabela.
 */

export interface EntradaRepasse {
  preco: number | null | undefined
  planos: PaymentPlan[] | null | undefined
  rendaPiso: number | null | undefined
  idade: number | null | undefined
  idadeInformadaEm?: string | null
  hoje?: Date
}

export interface Repasse {
  preco: number
  financiamentoPct: number
  entrada: number
  idade: number | null
  r: ResultadoSimulacao
}

/** O % financiado na entrega: o do primeiro fluxo da tabela que informa. */
export function pctFinanciado(planos: PaymentPlan[] | null | undefined): number | null {
  const p = (planos ?? []).find(x => x?.financingPct != null && x.financingPct > 0)
  return p?.financingPct ?? null
}

export function calcularRepasse(e: EntradaRepasse, banco: ParametrosBanco): Repasse | null {
  const preco = e.preco ?? 0
  const pct = pctFinanciado(e.planos)
  if (!(preco > 0) || pct == null) return null
  const entrada = preco * (1 - pct / 100)
  const idade = idadeHoje(e.idade ?? null, e.idadeInformadaEm ?? null, e.hoje)
  const r = simular({
    valorImovel: preco, entrada,
    idade, sistema: 'sac', prazo: null,
    rendaCliente: e.rendaPiso && e.rendaPiso > 0 ? e.rendaPiso : null,
  }, banco)
  return { preco, financiamentoPct: pct, entrada, idade, r }
}
