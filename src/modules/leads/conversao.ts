/**
 * Relatório de conversão do funil — a parte que pensa, sem tela.
 *
 * Os números vêm prontos da RPC `lead_conversion_report` (migração 088). Aqui
 * ficam o recorte de período, a comparação com o período anterior, as taxas e
 * as leituras escritas. Tudo função pura: é o que os testes cobrem.
 *
 * Dois modos, duas perguntas:
 *   atividade → o que ACONTECEU no período (mede o trabalho do corretor)
 *   safra     → dos leads que CHEGARAM no período, até onde foram (mede o lead)
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

type PontoSerie = RelatorioConversao['series'][number]

/** Início do balde que contém a data: o dia, o domingo da semana ou o dia 1º do mês. */
export function inicioDoBalde(data: string, balde: Balde): string {
  if (balde === 'day') return data
  if (balde === 'month') return `${data.slice(0, 8)}01`
  return somarDias(data, -deIso(data).getDay())   // semana = domingo → sábado
}

function proximoBalde(data: string, balde: Balde): string {
  if (balde === 'day') return somarDias(data, 1)
  if (balde === 'week') return somarDias(data, 7)
  const d = deIso(data)
  return iso(new Date(d.getFullYear(), d.getMonth() + 1, 1))
}

/**
 * Série contínua: o banco só devolve os baldes em que algo aconteceu, e um
 * gráfico que pula do dia 6 para o dia 9 esconde justamente os dias parados.
 * Aqui os buracos entram com zero. Sem período (acumulado), vai do primeiro ao
 * último balde que existe.
 */
export function preencherSerie(serie: PontoSerie[], inicio: string | null, fim: string | null, balde: Balde): PontoSerie[] {
  if (serie.length === 0 && (!inicio || !fim)) return []
  const porBalde = new Map(serie.map(p => [p.bucket, p]))
  const de  = inicioDoBalde(inicio ?? serie[0].bucket, balde)
  const ate = inicioDoBalde(fim ?? serie[serie.length - 1].bucket, balde)
  const out: PontoSerie[] = []
  for (let b = de, i = 0; b <= ate && i < 800; b = proximoBalde(b, balde), i++) {
    out.push(porBalde.get(b) ?? { bucket: b, received: 0, atendimento: 0, visita: 0, proposta: 0, venda: 0 })
  }
  return out
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

// ── Leituras ──────────────────────────────────────────────────────────────────

export type TomLeitura = 'sucesso' | 'atencao' | 'info' | 'neutro'
export interface Leitura { tom: TomLeitura; texto: string }

const plural = (n: number, um: string, varios: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`

/**
 * O que os números dizem, em frases.
 *
 * Regra da casa: nunca afirmar mais do que se observou. Por isso toda leitura
 * carrega os números que a sustentam, nenhuma sai com base menor que 5, e a
 * comparação entre origens só existe na safra — no modo atividade os leads
 * que visitaram não são necessariamente os que chegaram no período.
 */
export function gerarLeituras(
  atual: RelatorioConversao,
  anterior: RelatorioConversao | null,
  recorte: Recorte,
  nomes: { origem: (slug: string) => string; motivo: (slug: string) => string },
): Leitura[] {
  const out: Leitura[] = []
  const ps = passos(atual)

  // 1. Onde o funil mais perde
  const comBase = ps.filter(p => p.base >= 5 && p.taxa !== null && p.avancaram <= p.base)
  if (comBase.length > 0) {
    const pior = comBase.reduce((a, b) => (b.taxa! < a.taxa! ? b : a))
    out.push({
      tom: 'atencao',
      texto: `A maior perda está entre ${pior.de} e ${pior.para}: de ${pior.base.toLocaleString('pt-BR')}, ` +
             `${pior.avancaram === 0 ? 'nenhum avançou' : `${pior.avancaram.toLocaleString('pt-BR')} ${pior.avancaram === 1 ? 'avançou' : 'avançaram'}`} (${fmtTaxa(pior.taxa)}).`,
    })
  }

  // 2. Contra o período anterior
  if (anterior && recorte.dias) {
    const antes = `nos ${recorte.dias} dias anteriores`
    for (const [rotulo, a, b] of [
      ['Visitas', etapa(atual, 'visita'), etapa(anterior, 'visita')],
      ['Leads recebidos', atual.received, anterior.received],
    ] as [string, number, number][]) {
      if (a === 0 && b === 0) continue
      out.push({
        tom: a > b ? 'sucesso' : a < b ? 'atencao' : 'neutro',
        texto: a === b
          ? `${rotulo}: ${a.toLocaleString('pt-BR')}, o mesmo número ${antes}.`
          : `${rotulo}: ${a.toLocaleString('pt-BR')} neste período, contra ${b.toLocaleString('pt-BR')} ${antes}.`,
      })
    }
  }

  // 3. Origem que mais leva a visita — só na safra, onde são os mesmos leads
  if (atual.mode === 'safra') {
    const origens = atual.byOrigin.filter(o => o.received >= 10)
    if (origens.length >= 2) {
      const melhor = origens.reduce((a, b) =>
        ((b.stages.visita ?? 0) / b.received > (a.stages.visita ?? 0) / a.received ? b : a))
      const v = melhor.stages.visita ?? 0
      if (v > 0) {
        out.push({
          tom: 'info',
          texto: `${nomes.origem(melhor.origin)} é a origem que mais leva a visita: ${v.toLocaleString('pt-BR')} de ` +
                 `${melhor.received.toLocaleString('pt-BR')} leads (${fmtTaxa(taxa(v, melhor.received))}).`,
        })
      }
    }
  }

  // 4. Descartes
  if (atual.discarded > 0) {
    const principal = atual.discardReasons[0]
    const parte = atual.mode === 'safra'
      ? `${plural(atual.discarded, 'lead da safra foi descartado', 'leads da safra foram descartados')} (${fmtTaxa(taxa(atual.discarded, atual.received))})`
      : `${plural(atual.discarded, 'lead foi descartado', 'leads foram descartados')} no período`
    out.push({
      tom: 'neutro',
      texto: principal
        ? `${parte}. Motivo mais comum: ${nomes.motivo(principal.reason)} (${principal.count.toLocaleString('pt-BR')}).`
        : `${parte}.`,
    })
  }

  // 5. Tempo até a visita
  if (atual.medianDaysToVisit !== null && etapa(atual, 'visita') >= 3) {
    const d = atual.medianDaysToVisit
    out.push({
      tom: 'neutro',
      texto: d < 1
        ? 'Metade das visitas foi marcada no mesmo dia em que o lead chegou.'
        : `Metade das visitas acontece em até ${d.toLocaleString('pt-BR')} ${d === 1 ? 'dia' : 'dias'} depois da chegada do lead.`,
    })
  }

  // 6. Mais gente na etapa seguinte do que na anterior — só acontece na atividade
  const estouro = ps.find(p => p.avancaram > p.base && p.avancaram > 0)
  if (atual.mode === 'atividade' && estouro) {
    out.push({
      tom: 'info',
      texto: `Há mais leads em ${estouro.para} (${estouro.avancaram}) do que em ${estouro.de} (${estouro.base}) porque parte deles ` +
             `entrou no funil antes deste período. Para acompanhar os mesmos leads do começo ao fim, use "Por safra".`,
    })
  }

  // 7. Limite do histórico
  if (atual.historySince && (recorte.inicio === null || recorte.inicio < atual.historySince)) {
    out.push({
      tom: 'info',
      texto: `As mudanças de etapa só são registradas desde ${fmtData(atual.historySince)}. Antes dessa data o relatório ` +
             `só conhece a etapa em que o lead está hoje.`,
    })
  }

  return out
}

/** Variação contra o período anterior, para a nota da faixa de números. */
export function variacao(atual: number, anterior: number | null | undefined): string | null {
  if (anterior === null || anterior === undefined) return null
  const d = atual - anterior
  if (d === 0) return 'igual ao anterior'
  return `${d > 0 ? '+' : '−'}${Math.abs(d).toLocaleString('pt-BR')} vs. anterior`
}

/** "sem_condicao" → "Sem condicao" — só quando a configuração não tem o rótulo. */
export function slugLegivel(slug: string): string {
  const s = slug.replace(/_/g, ' ').trim()
  return s ? s[0].toUpperCase() + s.slice(1) : '—'
}
