/**
 * Conversão do funil — datas, taxas e o formato da RPC `lead_conversion_report`
 * (migração 088), que o Pulse usa. A aba Leads › Conversão usa o funil por
 * safra (`safra.ts`, migração 103) e reaproveita daqui o recorte de período,
 * os baldes e o formato das taxas. Tudo função pura.
 */

export type ModoConversao = 'atividade' | 'safra'
export type Balde = 'day' | 'week' | 'month'
export type EtapaRelatorio = 'atendimento' | 'visita' | 'proposta' | 'venda'

/** Etapas que o relatório mostra. Followup é cadência de contato, não conversão. */
export const ETAPAS_RELATORIO: EtapaRelatorio[] = ['atendimento', 'visita', 'proposta', 'venda']

export interface LinhaConversao {
  received:  number
  discarded: number
  stages:    Partial<Record<string, number>>
}
export interface RelatorioConversao {
  mode:      ModoConversao
  start:     string | null
  end:       string | null
  bucket:    Balde
  received:  number
  discarded: number
  funnel:    { stage: string; count: number }[]
  series:    { bucket: string; received: number; atendimento: number; visita: number; proposta: number; venda: number }[]
  byOrigin:  (LinhaConversao & { origin: string })[]
  byBroker:  (LinhaConversao & { brokerId: string | null; name: string })[]
  discardReasons:    { reason: string; count: number }[]
  medianDaysToVisit: number | null
  historySince:      string | null
}

// ── Datas (sempre YYYY-MM-DD, no calendário de quem está olhando) ─────────────

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const deIso = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }

export function hojeIso(agora: Date = new Date()): string { return iso(agora) }

export function somarDias(data: string, dias: number): string {
  const d = deIso(data)
  d.setDate(d.getDate() + dias)
  return iso(d)
}

export function diasEntre(inicio: string, fim: string): number {
  return Math.round((deIso(fim).getTime() - deIso(inicio).getTime()) / 86_400_000) + 1
}

export interface Recorte {
  /** null = desde o começo */
  inicio: string | null
  fim:    string | null
  /** mesmo número de dias, logo antes; null quando não há como comparar */
  anterior: { inicio: string; fim: string } | null
  dias:   number | null
  balde:  Balde
}

/**
 * Do período escolhido para o que vai à consulta.
 *
 * O fim nunca passa de hoje: "Este mês" termina no dia 30, mas comparar 15 dias
 * já vividos com 30 dias do mês passado faria todo mês parecer pior até o
 * último dia. A comparação é sempre com o mesmo número de dias, logo antes.
 */
export function montarRecorte(inicio: string, fim: string, acumulado: boolean, hoje: string = hojeIso()): Recorte {
  if (acumulado) return { inicio: null, fim: null, anterior: null, dias: null, balde: 'month' }
  const fimReal = fim > hoje ? hoje : fim
  if (inicio > fimReal) {
    // período inteiro no futuro: nada aconteceu ainda, e não há o que comparar
    return { inicio, fim, anterior: null, dias: diasEntre(inicio, fim), balde: 'day' }
  }
  const dias = diasEntre(inicio, fimReal)
  return {
    inicio,
    fim: fimReal,
    anterior: { inicio: somarDias(inicio, -dias), fim: somarDias(inicio, -1) },
    dias,
    balde: dias <= 31 ? 'day' : dias <= 185 ? 'week' : 'month',
  }
}

// ── Números ───────────────────────────────────────────────────────────────────

export function etapa(r: { funnel: { stage: string; count: number }[] } | null | undefined, stage: string): number {
  return r?.funnel.find(f => f.stage === stage)?.count ?? 0
}

/** Taxa em %. `null` quando não há base — a tela mostra "—", nunca 0%. */
export function taxa(parte: number, base: number): number | null {
  return base > 0 ? (parte / base) * 100 : null
}

/** 2,1% abaixo de 10; 34% acima. Sem base, travessão. */
export function fmtTaxa(t: number | null): string {
  if (t === null) return '—'
  if (t === 0) return '0%'
  return `${t < 10 ? t.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : Math.round(t).toLocaleString('pt-BR')}%`
}

export function fmtData(data: string): string {
  const [y, m, d] = data.split('-')
  return `${d}/${m}/${y}`
}

export function fmtDataCurta(data: string): string {
  const [, m, d] = data.split('-')
  return `${d}/${m}`
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** Rótulo do eixo do gráfico conforme o balde. */
export function rotuloBalde(data: string, balde: Balde): string {
  if (balde === 'month') {
    const [y, m] = data.split('-')
    return `${MESES[Number(m) - 1]}/${y.slice(2)}`
  }
  return fmtDataCurta(data)
}

/** Início do balde que contém a data: o dia, o domingo da semana ou o dia 1º do mês. */
export function inicioDoBalde(data: string, balde: Balde): string {
  if (balde === 'day') return data
  if (balde === 'month') return `${data.slice(0, 8)}01`
  return somarDias(data, -deIso(data).getDay())   // semana = domingo → sábado
}

export function proximoBalde(data: string, balde: Balde): string {
  if (balde === 'day') return somarDias(data, 1)
  if (balde === 'week') return somarDias(data, 7)
  const d = deIso(data)
  return iso(new Date(d.getFullYear(), d.getMonth() + 1, 1))
}

/** Passos do funil mostrado: de onde → para onde, com a base e quantos avançaram. */
export interface Passo { de: string; para: string; base: number; avancaram: number; taxa: number | null }

const NOME: Record<string, string> = {
  recebidos: 'Recebidos', atendimento: 'Atendimento', visita: 'Visita', proposta: 'Proposta', venda: 'Venda',
}

export function passos(r: RelatorioConversao): Passo[] {
  const seq: [string, number][] = [
    ['recebidos', r.received],
    ...ETAPAS_RELATORIO.map(e => [e, etapa(r, e)] as [string, number]),
  ]
  return seq.slice(1).map(([para, n], i) => {
    const [de, base] = seq[i]
    return { de: NOME[de], para: NOME[para], base, avancaram: n, taxa: taxa(n, base) }
  })
}

/** "sem_condicao" → "Sem condicao" — só quando a configuração não tem o rótulo. */
export function slugLegivel(slug: string): string {
  const s = slug.replace(/_/g, ' ').trim()
  return s ? s[0].toUpperCase() + s.slice(1) : '—'
}
