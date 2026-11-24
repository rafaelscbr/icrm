import type { PaymentPlan } from '../../../types'
import { idadeHoje, mesesAte, ParametrosBanco, ResultadoSimulacao, simular } from './calc'

/**
 * Renda do repasse na ficha do lead (24/11/2026) — automática, sem simular.
 *
 * O lead já está ligado a uma tipologia da carteira (migração 108). Dela saem
 * o preço, o % financiado na entrega (fluxo da tabela) e a previsão de entrega;
 * do perfil saem a renda declarada e a idade. A conta é a do Simulador de
 * financiamento, no PIOR CENÁRIO, como o Rafael pediu:
 *
 *   • renda do cliente = o PISO da faixa declarada ("R$ 5 a 10 mil" → R$ 5 mil);
 *   • SAC (a 1ª parcela é a maior e é a que o banco olha);
 *   • saldo corrigido pelo índice do lançamento até a entrega;
 *   • sem idade, prazo máximo do banco e o maior MIP da tabela.
 */

export interface EntradaRepasse {
  preco: number | null | undefined
  planos: PaymentPlan[] | null | undefined
  entrega: string | null | undefined
  /** % a.a. já resolvido (acumulado de 12 meses do índice do lançamento) */
  indiceAnual: number
  rendaPiso: number | null | undefined
  idade: number | null | undefined
  idadeInformadaEm?: string | null
  hoje?: Date
}

export interface Repasse {
  preco: number
  financiamentoPct: number
  pagoAteChaves: number
  meses: number
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
  const pagoAteChaves = preco * (1 - pct / 100)
  const meses = e.entrega ? mesesAte(e.entrega, e.hoje) : 0
  const idade = idadeHoje(e.idade ?? null, e.idadeInformadaEm ?? null, e.hoje)
  const r = simular({
    valorImovel: preco, pagoAteChaves, mesesAteEntrega: meses, indiceAnual: e.indiceAnual,
    idade, sistema: 'sac', prazo: null,
    rendaCliente: e.rendaPiso && e.rendaPiso > 0 ? e.rendaPiso : null,
  }, banco)
  return { preco, financiamentoPct: pct, pagoAteChaves, meses, idade, r }
}
