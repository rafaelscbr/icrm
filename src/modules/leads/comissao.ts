/**
 * Comissão do Kanban — a conta da Souza (Rafael, 22/11/2026). Função pura.
 *
 *   bruta   = % do produto sobre o VGV — 5% nos lançamentos, produto pronto
 *             pode ser 6% (developments.commission_pct, migração 108)
 *   líquida = bruta − 3% de ISS e, do que sobra, − 6% do Simples
 *             (um depois do outro: bruta × 0,97 × 0,94)
 *   parte   = líquida × a parte do corretor (no perfil, migração 104:
 *             Ryan 40%, Dionata 50%). Sem parte, a líquida é toda da Souza.
 *
 * É estimativa de pipeline: o VGV do lead é o preço da tipologia na tabela
 * vigente (`averageTicket`, mantido pelo banco), não o valor fechado. A venda
 * de verdade continua sendo registrada e calculada no formulário de venda.
 */

/** % padrão quando o lead não está ligado a um produto da carteira. */
export const PCT_PADRAO = 5
export const ISS = 0.03
export const SIMPLES = 0.06

export function comissaoBruta(vgv: number, pct: number = PCT_PADRAO): number {
  return vgv * (pct / 100)
}

export function comissaoLiquida(vgv: number, pct: number = PCT_PADRAO): number {
  return comissaoBruta(vgv, pct) * (1 - ISS) * (1 - SIMPLES)
}

/** Parte do corretor; `share` em % da líquida. Sem share, zero. */
export function parteDoCorretor(vgv: number, share: number | null | undefined, pct: number = PCT_PADRAO): number {
  return share ? comissaoLiquida(vgv, pct) * (share / 100) : 0
}

/** Divisão de um VGV: a bruta, a líquida, a parte do corretor e o que fica com a Souza. */
export function divisao(
  vgv: number, share: number | null | undefined, pct: number = PCT_PADRAO,
): { bruta: number; liquida: number; corretor: number; souza: number } {
  const liquida = comissaoLiquida(vgv, pct)
  const corretor = parteDoCorretor(vgv, share, pct)
  return { bruta: comissaoBruta(vgv, pct), liquida, corretor, souza: liquida - corretor }
}

export interface TotaisComissao {
  vgv: number
  bruta: number
  liquida: number
  /** soma das partes dos corretores */
  corretores: number
  /** o que fica com a Souza */
  souza: number
}

/**
 * Totais de uma lista de leads; `shareDe` diz a parte do dono de cada lead e
 * `pctDe`, o % do produto (sem ele, 5%).
 */
export function totaisComissao<L extends { averageTicket?: number; brokerId?: string | null }>(
  leads: L[],
  shareDe: (brokerId: string | null | undefined) => number | null,
  pctDe: (lead: L) => number = () => PCT_PADRAO,
): TotaisComissao {
  const t: TotaisComissao = { vgv: 0, bruta: 0, liquida: 0, corretores: 0, souza: 0 }
  for (const l of leads) {
    const v = l.averageTicket ?? 0
    if (!v) continue
    const d = divisao(v, shareDe(l.brokerId), pctDe(l))
    t.vgv += v; t.bruta += d.bruta; t.liquida += d.liquida
    t.corretores += d.corretor; t.souza += d.souza
  }
  return t
}
