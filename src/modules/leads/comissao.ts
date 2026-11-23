/**
 * Comissão do Kanban — a conta da Souza (Rafael, 22/11/2026). Função pura.
 *
 *   bruta   = 5% do VGV
 *   líquida = bruta − 3% de ISS e, do que sobra, − 6% do Simples
 *             (um depois do outro: bruta × 0,97 × 0,94 ≈ 4,56% do VGV)
 *   parte   = líquida × a parte do corretor (no perfil, migração 104:
 *             Ryan 40%, Dionata 50%). Sem parte, a líquida é toda da Souza.
 *
 * É estimativa de pipeline: o VGV do lead é o ticket do produto
 * (`averageTicket`), não o valor fechado. A venda de verdade continua sendo
 * registrada e calculada no formulário de venda.
 */

export const TAXA_BRUTA = 0.05
export const ISS = 0.03
export const SIMPLES = 0.06

export function comissaoBruta(vgv: number): number {
  return vgv * TAXA_BRUTA
}

export function comissaoLiquida(vgv: number): number {
  return comissaoBruta(vgv) * (1 - ISS) * (1 - SIMPLES)
}

/** Parte do corretor; `share` em % da líquida. Sem share, zero. */
export function parteDoCorretor(vgv: number, share: number | null | undefined): number {
  return share ? comissaoLiquida(vgv) * (share / 100) : 0
}

export interface TotaisComissao {
  vgv: number
  liquida: number
  /** soma das partes dos corretores */
  corretores: number
  /** o que fica com a Souza */
  souza: number
}

/** Totais de uma lista de leads; `shareDe` diz a parte do dono de cada lead. */
export function totaisComissao(
  leads: { averageTicket?: number; brokerId?: string | null }[],
  shareDe: (brokerId: string | null | undefined) => number | null,
): TotaisComissao {
  let vgv = 0, corretores = 0
  for (const l of leads) {
    const v = l.averageTicket ?? 0
    if (!v) continue
    vgv += v
    corretores += parteDoCorretor(v, shareDe(l.brokerId))
  }
  const liquida = comissaoLiquida(vgv)
  return { vgv, liquida, corretores, souza: liquida - corretores }
}
