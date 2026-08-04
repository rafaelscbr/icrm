/**
 * Clima da imobiliária — a TEMPERATURA DO DIA, 24 horas por dia.
 *
 * Função pura, calculada 100% no cliente a partir de números que já estão na
 * memória. Zero consulta ao banco.
 *
 * Mede o dia ACUMULADO, não o instante: atendimentos, leads, visitas e vendas
 * do dia pesam mais que o ritmo dos últimos 30 minutos. Sem isso o termômetro
 * despencava toda vez que o time parava para almoçar e zerava à noite — o
 * painel deixava de responder "como foi o dia" justamente quando o dia acabou.
 * Os contadores só reiniciam na virada do dia (ver bootstrap 'virada_dia').
 *
 * Os pesos são uma calibragem inicial para um time de ~5 corretores; devem ser
 * reajustados depois de uma semana de operação real (a escala é o que dá
 * significado ao termômetro, não a fórmula em si).
 */

export type ClimateLevel = 'frio' | 'normal' | 'aquecido' | 'pegando_fogo'

export interface ClimateInput {
  /** eventos de qualquer tipo nos últimos 30 min — o "ritmo agora" */
  atividade30min:     number
  /** atendimentos acumulados no dia — o corpo da temperatura */
  interacoesHoje:     number
  leadsNovosHoje:     number
  corretoresOnline:   number
  visitasHoje:        number
  vendasHoje:         number
  semAtendimentoHoje: number
}

export interface ClimateResult {
  level: ClimateLevel
  /** 0–100 */
  score: number
  label: string
}

const LABELS: Record<ClimateLevel, string> = {
  frio:         'FRIO',
  normal:       'NORMAL',
  aquecido:     'AQUECIDO',
  pegando_fogo: 'PEGANDO FOGO',
}

function cap(value: number, max: number): number {
  return Math.min(value, max)
}

export function calcClimate(input: ClimateInput): ClimateResult {
  const bruto =
      cap(input.interacoesHoje   * 1.5, 27)  // volume do dia — o maior peso
    + cap(input.atividade30min   * 3,   18)  // ritmo dos últimos 30 min
    + cap(input.leadsNovosHoje   * 2,   16)  // entrada de demanda
    + cap(input.corretoresOnline * 3,   12)  // time presente no iCRM
    + cap(input.visitasHoje      * 5,   15)  // avanço real de pipeline
    + cap(input.vendasHoje       * 10,  20)  // resultado

  // Gargalo pesa contra: muita atividade com fila parada não é um dia bom.
  const penalidade = input.semAtendimentoHoje > 10 ? 10 : 0
  const score = Math.max(0, Math.min(100, Math.round(bruto - penalidade)))

  const level: ClimateLevel =
      score >= 75 ? 'pegando_fogo'
    : score >= 50 ? 'aquecido'
    : score >= 25 ? 'normal'
    :               'frio'

  return { level, score, label: LABELS[level] }
}

/** Cor semântica do nível — usada no medidor e na borda do cartão. */
export const CLIMATE_COLOR: Record<ClimateLevel, string> = {
  frio:         'var(--info)',
  normal:       'var(--t2)',
  aquecido:     'var(--warning)',
  pegando_fogo: 'var(--brand)',
}
