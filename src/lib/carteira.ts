import type { Development, DevelopmentUnit } from '../types'

/**
 * Leituras da carteira de lançamentos usadas por quem escolhe produto e
 * tipologia: campanha do Meta, campanha de ligação e transferência para o funil.
 */

/** Preço vigente da tipologia: o de tabela ou, sem ele, o piso da faixa. */
export function precoDaTipologia(u: Pick<DevelopmentUnit, 'price' | 'priceMin'>): number | undefined {
  return u.price ?? u.priceMin ?? undefined
}

/** Tipologias disponíveis e com tabela — as únicas que dão VGV a um lead. */
export function tipologiasComTabela(unidades: DevelopmentUnit[], devId: string): DevelopmentUnit[] {
  return unidades
    .filter(u => u.developmentId === devId && u.available && precoDaTipologia(u) != null)
    .sort((a, b) => a.displayOrder - b.displayOrder)
}

/** Lançamentos ativos, em ordem alfabética. */
export function lancamentosAtivos(developments: Development[]): Development[] {
  return developments.filter(d => d.active).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}
