/**
 * Clima da imobiliária — a leitura de 2 segundos do painel.
 *
 * Função pura, calculada 100% no cliente a partir de números que já estão na
 * memória. Zero consulta ao banco.
 *
 * Os pesos são uma calibragem inicial para um time de ~5 corretores; devem ser
 * reajustados depois de uma semana de operação real (a escala é o que dá
 * significado ao termômetro, não a fórmula em si).
 */

export type ClimateLevel = 'expediente_fechado' | 'frio' | 'normal' | 'aquecido' | 'pegando_fogo'

export interface ClimateInput {
  /** eventos de qualquer tipo nos últimos 30 min — o "ritmo agora" */
  atividade30min:     number
  leadsNovosHoje:     number
  corretoresOnline:   number
  visitasHoje:        number
  vendasHoje:         number
  semAtendimentoHoje: number
  /** momento da avaliação — define se estamos ou não em horário comercial */
  agora:              Date
}

export interface ClimateResult {
  level: ClimateLevel
  /** 0–100 */
  score: number
  label: string
}

const LABELS: Record<ClimateLevel, string> = {
  expediente_fechado: 'FORA DE EXPEDIENTE',
  frio:               'FRIO',
  normal:             'NORMAL',
  aquecido:           'AQUECIDO',
  pegando_fogo:       'PEGANDO FOGO',
}

/**
 * Horário comercial da Souza — o mesmo usado na regra de SLA dos leads Meta:
 * Seg–Sex 9h–18h, Sáb 9h–13h. Fora disso o termômetro não mede nada: às 21h
 * de um terça-feira "FRIO" não é diagnóstico, é ruído — e ruído recorrente é
 * exatamente o que faz alguém parar de olhar para um painel.
 */
export function isHorarioComercial(d: Date): boolean {
  const dia  = d.getDay()   // 0 = domingo
  const hora = d.getHours()
  if (dia === 0) return false
  if (dia === 6) return hora >= 9 && hora < 13
  return hora >= 9 && hora < 18
}

function cap(value: number, max: number): number {
  return Math.min(value, max)
}

export function calcClimate(input: ClimateInput): ClimateResult {
  if (!isHorarioComercial(input.agora)) {
    return { level: 'expediente_fechado', score: 0, label: LABELS.expediente_fechado }
  }

  const bruto =
      cap(input.atividade30min   * 4,  30)   // ritmo agora — o sinal mais forte
    + cap(input.leadsNovosHoje   * 2,  20)   // entrada de demanda
    + cap(input.corretoresOnline * 4,  16)   // time presente no iCRM
    + cap(input.visitasHoje      * 5,  15)   // avanço real de pipeline
    + cap(input.vendasHoje       * 10, 20)   // resultado

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
  expediente_fechado: 'var(--t4)',
  frio:               'var(--info)',
  normal:             'var(--t2)',
  aquecido:           'var(--warning)',
  pegando_fogo:       'var(--brand)',
}
