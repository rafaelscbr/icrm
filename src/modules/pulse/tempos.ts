/**
 * Tempos de resposta — formatação e classificação.
 *
 * Tudo aqui está em MINUTOS ÚTEIS (business_minutes no banco). Um lead do Meta
 * que cai às 3h da manhã e é atendido às 9h07 demorou 7 minutos, não 6 horas —
 * medir em tempo corrido produziria números que ninguém consegue cobrar.
 */

/** Minutos de um dia útil cheio (Seg–Sex, 09:00–18:00). Sábado tem 240. */
export const MINUTOS_DIA_UTIL = 540

/** Meta de 1º contato do iCRM: 5 minutos úteis (regra de SLA dos leads Meta). */
export const SLA_PRIMEIRO_CONTATO_MIN = 5

export type NivelTempo = 'bom' | 'atencao' | 'ruim' | 'sem_dados'

/**
 * "45 min" · "1h31" · "4,6 d".
 * Acima de um dia útil passa a contar em DIAS ÚTEIS — dizer "2484 min" ou
 * "41h" para um followup não ajuda ninguém a decidir nada.
 */
export function formatarDuracaoUtil(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return '—'

  if (min < 60) return `${Math.round(min)} min`

  if (min < MINUTOS_DIA_UTIL) {
    const h = Math.floor(min / 60)
    const m = Math.round(min % 60)
    return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
  }

  const dias = min / MINUTOS_DIA_UTIL
  return `${dias.toFixed(1).replace('.', ',')} d`
}

/**
 * Limiares de 1º contato. A meta é 5 min, mas classificar tudo acima disso
 * como "ruim" deixaria o painel vermelho para sempre e ensinaria a ignorá-lo:
 * até 15 min ainda é uma resposta rápida de verdade.
 */
export function nivelPrimeiroContato(min: number, amostra: number): NivelTempo {
  if (amostra === 0) return 'sem_dados'
  if (min <= 15) return 'bom'
  if (min <= 60) return 'atencao'
  return 'ruim'
}

/**
 * Limiares da 2ª tentativa. Não existe meta oficial no iCRM — estes valores
 * são um ponto de partida (1 dia útil = bom, até 3 = atenção) para calibrar
 * depois com a operação real.
 */
export function nivelSegundaTentativa(min: number, amostra: number): NivelTempo {
  if (amostra === 0) return 'sem_dados'
  if (min <= MINUTOS_DIA_UTIL)     return 'bom'
  if (min <= MINUTOS_DIA_UTIL * 3) return 'atencao'
  return 'ruim'
}

/** % de leads atendidos dentro do SLA. */
export function nivelSla(pct: number, amostra: number): NivelTempo {
  if (amostra === 0) return 'sem_dados'
  if (pct >= 80) return 'bom'
  if (pct >= 50) return 'atencao'
  return 'ruim'
}

export const COR_NIVEL: Record<NivelTempo, string> = {
  bom:       'var(--success)',
  atencao:   'var(--warning)',
  ruim:      'var(--error)',
  sem_dados: 'var(--t4)',
}
