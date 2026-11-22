/**
 * Filtros do relatório de Performance do corretor (migração 098).
 *
 * Moram na URL para a visão poder ser compartilhada: quem abre o link vê o
 * mesmo recorte. Os nomes dos parâmetros começam com `pf_` para não colidir
 * com os da tela de Leads (`lead`, `tab`…).
 *
 * Datas são dias de São Paulo no formato AAAA-MM-DD. O banco converte para
 * instantes no mesmo fuso; aqui só se escolhe o dia.
 */

export type PresetPeriodo = 'hoje' | 'ontem' | '7d' | 'mes' | 'personalizado'
export type Situacao = 'todos' | 'ativos' | 'descartados'

export interface FiltrosPerf {
  corretores: string[]
  periodo: PresetPeriodo
  /** AAAA-MM-DD, sempre preenchido (resolvido a partir do preset) */
  de: string
  ate: string
  produtos: string[]
  origens: string[]
  anuncios: string[]
  etapas: string[]
  situacao: Situacao
  paradoDias: number
}

export const ROTULO_PERIODO: Record<PresetPeriodo, string> = {
  hoje: 'Hoje',
  ontem: 'Ontem',
  '7d': 'Últimos 7 dias',
  mes: 'Este mês',
  personalizado: 'Personalizado',
}

const FUSO = 'America/Sao_Paulo'
const DIA = /^\d{4}-\d{2}-\d{2}$/

/** O dia de São Paulo de um instante, em AAAA-MM-DD. */
export function diaSP(agora: Date = new Date()): string {
  // en-CA formata como AAAA-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora)
}

/** Soma dias a um AAAA-MM-DD sem passar por fuso (aritmética de calendário). */
export function somarDias(dia: string, n: number): string {
  const [a, m, d] = dia.split('-').map(Number)
  const t = new Date(Date.UTC(a, m - 1, d + n))
  return t.toISOString().slice(0, 10)
}

/** O intervalo de dias de um preset, contado a partir do dia de hoje em São Paulo. */
export function intervaloDoPreset(p: Exclude<PresetPeriodo, 'personalizado'>, agora: Date = new Date()): { de: string; ate: string } {
  const hoje = diaSP(agora)
  switch (p) {
    case 'hoje':  return { de: hoje, ate: hoje }
    case 'ontem': { const o = somarDias(hoje, -1); return { de: o, ate: o } }
    case '7d':    return { de: somarDias(hoje, -6), ate: hoje }
    case 'mes':   return { de: `${hoje.slice(0, 8)}01`, ate: hoje }
  }
}

export function filtrosPadrao(agora: Date = new Date()): FiltrosPerf {
  return {
    corretores: [], periodo: '7d', ...intervaloDoPreset('7d', agora),
    produtos: [], origens: [], anuncios: [], etapas: [],
    situacao: 'todos', paradoDias: 3,
  }
}

const PRESETS: PresetPeriodo[] = ['hoje', 'ontem', '7d', 'mes', 'personalizado']
const SITUACOES: Situacao[] = ['todos', 'ativos', 'descartados']

/** Lê os filtros da URL. O que vier inválido volta ao padrão, sem erro. */
export function lerFiltros(sp: URLSearchParams, agora: Date = new Date()): FiltrosPerf {
  const base = filtrosPadrao(agora)
  const preset = sp.get('pf_p') as PresetPeriodo | null
  const periodo: PresetPeriodo = preset && PRESETS.includes(preset) ? preset : base.periodo

  let de = base.de
  let ate = base.ate
  if (periodo === 'personalizado') {
    const pde = sp.get('pf_de') ?? ''
    const pate = sp.get('pf_ate') ?? ''
    if (DIA.test(pde) && DIA.test(pate) && pde <= pate) { de = pde; ate = pate }
    else if (DIA.test(pde)) { de = pde; ate = pde }
  } else {
    ({ de, ate } = intervaloDoPreset(periodo, agora))
  }

  const situacao = sp.get('pf_sit') as Situacao | null
  const parado = Number(sp.get('pf_par'))
  const lista = (k: string) => sp.getAll(k).map(v => v.trim()).filter(Boolean)

  return {
    corretores: lista('pf_c'),
    periodo, de, ate,
    produtos: lista('pf_prod'),
    origens: lista('pf_org'),
    anuncios: lista('pf_ad'),
    etapas: lista('pf_et'),
    situacao: situacao && SITUACOES.includes(situacao) ? situacao : 'todos',
    paradoDias: Number.isInteger(parado) && parado >= 1 && parado <= 365 ? parado : base.paradoDias,
  }
}

const CHAVES = ['pf_c', 'pf_p', 'pf_de', 'pf_ate', 'pf_prod', 'pf_org', 'pf_ad', 'pf_et', 'pf_sit', 'pf_par']

/** Escreve os filtros na URL, mantendo os outros parâmetros da tela. Padrões não sujam a URL. */
export function escreverFiltros(sp: URLSearchParams, f: FiltrosPerf): URLSearchParams {
  const next = new URLSearchParams(sp)
  for (const k of CHAVES) next.delete(k)
  for (const v of f.corretores) next.append('pf_c', v)
  if (f.periodo !== '7d') next.set('pf_p', f.periodo)
  if (f.periodo === 'personalizado') { next.set('pf_de', f.de); next.set('pf_ate', f.ate) }
  for (const v of f.produtos) next.append('pf_prod', v)
  for (const v of f.origens) next.append('pf_org', v)
  for (const v of f.anuncios) next.append('pf_ad', v)
  for (const v of f.etapas) next.append('pf_et', v)
  if (f.situacao !== 'todos') next.set('pf_sit', f.situacao)
  if (f.paradoDias !== 3) next.set('pf_par', String(f.paradoDias))
  return next
}

/** Tira os filtros do relatório da URL (ao sair da aba). */
export function limparFiltros(sp: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(sp)
  for (const k of CHAVES) next.delete(k)
  return next
}

/** O que vai para as funções do banco (p_filtros). */
export function paraBanco(f: FiltrosPerf, maxTentativas: number): Record<string, unknown> {
  return {
    corretores: f.corretores, de: f.de, ate: f.ate,
    produtos: f.produtos, origens: f.origens, anuncios: f.anuncios, etapas: f.etapas,
    situacao: f.situacao, parado_dias: f.paradoDias, max_tentativas: maxTentativas,
  }
}

/** Quantos filtros além de corretor e período estão ligados — para o contador do botão. */
export function contarRecortes(f: FiltrosPerf): number {
  return f.produtos.length + f.origens.length + f.anuncios.length + f.etapas.length
    + (f.situacao !== 'todos' ? 1 : 0)
}

/** "14/11 a 18/11/2026", "18/11/2026" */
export function rotuloDoPeriodo(f: Pick<FiltrosPerf, 'de' | 'ate'>): string {
  const fmt = (d: string, ano: boolean) => {
    const [a, m, dd] = d.split('-')
    return ano ? `${dd}/${m}/${a}` : `${dd}/${m}`
  }
  if (f.de === f.ate) return fmt(f.de, true)
  const mesmoAno = f.de.slice(0, 4) === f.ate.slice(0, 4)
  return `${fmt(f.de, !mesmoAno)} a ${fmt(f.ate, true)}`
}
