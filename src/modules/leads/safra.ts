/**
 * Funil por safra — a parte que pensa da aba Leads › Conversão (22/11/2026).
 *
 * O banco (`funil_por_safra`, migração 103) devolve um cubo pequeno:
 * corretor × produto × balde de chegada × etapa mais alta × descartado. Tudo o
 * que a tela mostra sai daqui, recortando esse cubo — trocar de corretor ou de
 * produto não vai ao banco. Funções puras: é o que os testes cobrem.
 *
 * Safra = os leads que CHEGARAM no período, e até onde foram até hoje.
 * Lead descartado conta. Crédito para o dono atual do lead.
 */

import { fmtTaxa, inicioDoBalde, proximoBalde, taxa } from './conversao'
import type { Balde } from './conversao'

/** Sem corretor / sem produto viram uma chave de texto: o filtro não lida com null. */
export const SEM = '__sem__'

/** Ordem das etapas no cubo. 0 lead e 1 followup = ainda no primeiro contato. */
export const ORD = { atendimento: 2, visita: 3, proposta: 4, venda: 5 } as const
export type EtapaSafra = keyof typeof ORD
export const ETAPAS_SAFRA: EtapaSafra[] = ['atendimento', 'visita', 'proposta', 'venda']
export const NOME_ETAPA: Record<EtapaSafra | 'chegada', string> = {
  chegada: 'Chegaram', atendimento: 'Atendimento', visita: 'Visita', proposta: 'Proposta', venda: 'Venda',
}

/** O que a RPC devolve. */
export interface FunilSafraBruto {
  start: string | null
  end: string | null
  bucket: Balde
  corretores: { id: string | null; nome: string }[]
  produtos: { chave: string | null; nome: string }[]
  /** [corretor, produto, balde, etapa mais alta 0–5, descartado 0/1, leads] */
  cubo: [number, number, string, number, number, number][]
  /** [corretor, produto, motivo, leads] */
  motivos: [number, number, string, number][]
  /** [corretor, produto, dias da chegada até a 1ª visita] */
  visitas: [number, number, number][]
  historySince: string | null
}

export interface Item { chave: string; nome: string }
export interface FunilSafra extends Omit<FunilSafraBruto, 'corretores' | 'produtos'> {
  corretores: Item[]
  produtos: Item[]
}

export function normalizar(b: FunilSafraBruto): FunilSafra {
  return {
    ...b,
    corretores: b.corretores.map(c => ({ chave: c.id ?? SEM, nome: c.nome })),
    produtos:   b.produtos.map(p => ({ chave: p.chave ?? SEM, nome: p.nome })),
  }
}

/** Recorte: chave do corretor e/ou do produto. `null` = todos. */
export interface Filtro { corretor: string | null; produto: string | null }
export const SEM_FILTRO: Filtro = { corretor: null, produto: null }

function indice(itens: Item[], chave: string | null): number | null | -1 {
  if (chave === null) return null
  return itens.findIndex(i => i.chave === chave)   // -1: escolhido, mas sem lead na safra
}

/** Predicado sobre (corretor, produto) do cubo. */
function passa(f: FunilSafra, filtro: Filtro) {
  const ci = indice(f.corretores, filtro.corretor)
  const pi = indice(f.produtos, filtro.produto)
  return (c: number, p: number) => (ci === null || ci === c) && (pi === null || pi === p)
}

// ── Contagem ──────────────────────────────────────────────────────────────────

export interface Parada { ativos: number; descartados: number }
export interface Contagem {
  recebidos: number
  atendimento: number
  visita: number
  proposta: number
  venda: number
  descartados: number
  /** ainda vivos e sem venda */
  emAndamento: number
  /** onde cada lead parou (etapa mais alta alcançada), separado em vivo e descartado */
  parouEm: Record<'chegada' | 'atendimento' | 'visita' | 'proposta', Parada>
}

export function contagemVazia(): Contagem {
  const p = () => ({ ativos: 0, descartados: 0 })
  return {
    recebidos: 0, atendimento: 0, visita: 0, proposta: 0, venda: 0, descartados: 0, emAndamento: 0,
    parouEm: { chegada: p(), atendimento: p(), visita: p(), proposta: p() },
  }
}

function somar(c: Contagem, alc: number, desc: number, n: number) {
  c.recebidos += n
  if (alc >= 2) c.atendimento += n
  if (alc >= 3) c.visita += n
  if (alc >= 4) c.proposta += n
  if (alc >= 5) c.venda += n
  if (desc) c.descartados += n
  if (alc < 5) {
    if (!desc) c.emAndamento += n
    const onde = alc <= 1 ? 'chegada' : alc === 2 ? 'atendimento' : alc === 3 ? 'visita' : 'proposta'
    c.parouEm[onde][desc ? 'descartados' : 'ativos'] += n
  }
}

export function contar(f: FunilSafra, filtro: Filtro = SEM_FILTRO): Contagem {
  const ok = passa(f, filtro)
  const c = contagemVazia()
  for (const [ci, pi, , alc, d, n] of f.cubo) if (ok(ci, pi)) somar(c, alc, d, n)
  return c
}

export function alcancou(c: Contagem, e: EtapaSafra | 'chegada'): number {
  return e === 'chegada' ? c.recebidos : c[e]
}

/** Passo a passo: de onde → para onde, com a taxa do passo e a acumulada. */
export interface PassoSafra {
  etapa: EtapaSafra
  anterior: EtapaSafra | 'chegada'
  n: number
  base: number
  /** do passo anterior para este */
  taxaPasso: number | null
  /** dos leads que chegaram, quantos alcançaram esta etapa */
  taxaTotal: number | null
}

export function passosSafra(c: Contagem): PassoSafra[] {
  const seq: (EtapaSafra | 'chegada')[] = ['chegada', ...ETAPAS_SAFRA]
  return ETAPAS_SAFRA.map((e, i) => {
    const anterior = seq[i]
    const base = alcancou(c, anterior)
    return { etapa: e, anterior, n: c[e], base, taxaPasso: taxa(c[e], base), taxaTotal: taxa(c[e], c.recebidos) }
  })
}

// ── Lado a lado ───────────────────────────────────────────────────────────────

export interface Fatia { chave: string; nome: string; c: Contagem }

/**
 * Um funil por corretor ou por produto, respeitando o outro filtro.
 * Ex.: dimensão 'produto' com corretor = Ana → o funil da Ana em cada produto.
 * Ordem: mais leads primeiro; empate, pelo nome.
 */
export function ladoALado(f: FunilSafra, dim: 'corretor' | 'produto', filtro: Filtro): Fatia[] {
  const itens = dim === 'corretor' ? f.corretores : f.produtos
  const fixo = dim === 'corretor' ? indice(f.produtos, filtro.produto) : indice(f.corretores, filtro.corretor)
  const acc = itens.map(() => contagemVazia())
  for (const [ci, pi, , alc, d, n] of f.cubo) {
    const [meu, outro] = dim === 'corretor' ? [ci, pi] : [pi, ci]
    if (fixo !== null && fixo !== outro) continue
    somar(acc[meu], alc, d, n)
  }
  return itens
    .map((it, i) => ({ chave: it.chave, nome: it.nome, c: acc[i] }))
    .filter(x => x.c.recebidos > 0)
    .sort((a, b) => b.c.recebidos - a.c.recebidos || a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** Corretor × produto: a contagem de cada cruzamento, mais os totais. */
export interface Matriz {
  linhas: Item[]
  colunas: Item[]
  celula: (linha: string, coluna: string) => Contagem
  totalLinha: (linha: string) => Contagem
  totalColuna: (coluna: string) => Contagem
}

export function matriz(f: FunilSafra): Matriz {
  const nc = f.corretores.length, np = f.produtos.length
  const cel = Array.from({ length: nc * np }, contagemVazia)
  const lin = Array.from({ length: nc }, contagemVazia)
  const col = Array.from({ length: np }, contagemVazia)
  for (const [ci, pi, , alc, d, n] of f.cubo) {
    somar(cel[ci * np + pi], alc, d, n)
    somar(lin[ci], alc, d, n)
    somar(col[pi], alc, d, n)
  }
  const ic = new Map(f.corretores.map((c, i) => [c.chave, i]))
  const ip = new Map(f.produtos.map((p, i) => [p.chave, i]))
  const ordem = (xs: Item[], tot: Contagem[], idx: Map<string, number>) =>
    xs.filter(x => tot[idx.get(x.chave)!].recebidos > 0)
      .sort((a, b) => tot[idx.get(b.chave)!].recebidos - tot[idx.get(a.chave)!].recebidos)
  return {
    linhas:  ordem(f.corretores, lin, ic),
    colunas: ordem(f.produtos, col, ip),
    celula:  (l, c) => cel[(ic.get(l) ?? 0) * np + (ip.get(c) ?? 0)],
    totalLinha:  l => lin[ic.get(l) ?? 0],
    totalColuna: c => col[ip.get(c) ?? 0],
  }
}

// ── No tempo ──────────────────────────────────────────────────────────────────

export interface PontoSafra { bucket: string; recebidos: number; atendimento: number; visita: number; venda: number; descartados: number }

/** Uma safra por balde de chegada, sem buracos: balde sem lead entra com zero. */
export function serieSafra(f: FunilSafra, filtro: Filtro, inicio: string | null, fim: string | null): PontoSafra[] {
  const ok = passa(f, filtro)
  const por = new Map<string, PontoSafra>()
  for (const [ci, pi, b, alc, d, n] of f.cubo) {
    if (!ok(ci, pi)) continue
    const p = por.get(b) ?? { bucket: b, recebidos: 0, atendimento: 0, visita: 0, venda: 0, descartados: 0 }
    p.recebidos += n
    if (alc >= 2) p.atendimento += n
    if (alc >= 3) p.visita += n
    if (alc >= 5) p.venda += n
    if (d) p.descartados += n
    por.set(b, p)
  }
  const chaves = [...por.keys()].sort()
  if (chaves.length === 0 && (!inicio || !fim)) return []
  const de  = inicioDoBalde(inicio ?? chaves[0], f.bucket)
  const ate = inicioDoBalde(fim ?? chaves[chaves.length - 1], f.bucket)
  const out: PontoSafra[] = []
  for (let b = de, i = 0; b <= ate && i < 800; b = proximoBalde(b, f.bucket), i++) {
    out.push(por.get(b) ?? { bucket: b, recebidos: 0, atendimento: 0, visita: 0, venda: 0, descartados: 0 })
  }
  return out
}

// ── Saídas e tempo ────────────────────────────────────────────────────────────

export function motivosSafra(f: FunilSafra, filtro: Filtro, limite = 6): { motivo: string; n: number }[] {
  const ok = passa(f, filtro)
  const por = new Map<string, number>()
  for (const [ci, pi, m, n] of f.motivos) if (ok(ci, pi)) por.set(m, (por.get(m) ?? 0) + n)
  return [...por.entries()].map(([motivo, n]) => ({ motivo, n }))
    .sort((a, b) => b.n - a.n || a.motivo.localeCompare(b.motivo)).slice(0, limite)
}

export const FAIXAS_VISITA = [
  { rotulo: 'No mesmo dia', ate: 1 },
  { rotulo: '1 a 3 dias',   ate: 4 },
  { rotulo: '4 a 7 dias',   ate: 8 },
  { rotulo: '8 a 14 dias',  ate: 15 },
  { rotulo: '15 dias ou mais', ate: Infinity },
] as const

export interface TempoVisita { total: number; mediana: number | null; faixas: { rotulo: string; n: number }[] }

export function tempoAteVisita(f: FunilSafra, filtro: Filtro): TempoVisita {
  const ok = passa(f, filtro)
  const dias = f.visitas.filter(([c, p]) => ok(c, p)).map(v => v[2]).sort((a, b) => a - b)
  const faixas = FAIXAS_VISITA.map(x => ({ rotulo: x.rotulo, n: 0 }))
  for (const d of dias) faixas[FAIXAS_VISITA.findIndex(x => d < x.ate)].n++
  const m = dias.length
  const mediana = m === 0 ? null : m % 2 ? dias[(m - 1) / 2] : (dias[m / 2 - 1] + dias[m / 2]) / 2
  return { total: m, mediana: mediana === null ? null : Math.round(mediana * 10) / 10, faixas }
}

// ── Leituras ──────────────────────────────────────────────────────────────────

export type TomLeitura = 'sucesso' | 'atencao' | 'info' | 'neutro'
export interface Leitura { tom: TomLeitura; texto: string }

const n = (x: number) => x.toLocaleString('pt-BR')

/**
 * O que os números dizem, em frases. Regra da casa: nunca afirmar mais do que
 * se observou — toda leitura carrega os números que a sustentam, nenhuma sai de
 * base menor que 5, e comparação entre corretores ou produtos pede 10 leads.
 */
export function leiturasSafra(
  f: FunilSafra, filtro: Filtro, hoje: string,
  nomeMotivo: (slug: string) => string,
): Leitura[] {
  const out: Leitura[] = []
  const c = contar(f, filtro)
  if (c.recebidos === 0) return out

  // 1. Onde o funil mais perde
  const ps = passosSafra(c).filter(p => p.base >= 5 && p.taxaPasso !== null)
  if (ps.length > 0) {
    const pior = ps.reduce((a, b) => (b.taxaPasso! < a.taxaPasso! ? b : a))
    out.push({
      tom: 'atencao',
      texto: `A maior perda está entre ${NOME_ETAPA[pior.anterior]} e ${NOME_ETAPA[pior.etapa]}: de ${n(pior.base)}, ` +
             `${pior.n === 0 ? 'nenhum avançou' : `${n(pior.n)} ${pior.n === 1 ? 'avançou' : 'avançaram'}`} (${fmtTaxa(pior.taxaPasso)}).`,
    })
  }

  // 2. Produto e corretor que mais levam a visita — só com base de 10 leads
  const melhor = (fs: Fatia[]) => {
    const com = fs.filter(x => x.c.recebidos >= 10)
    if (com.length < 2) return null
    const m = com.reduce((a, b) => (b.c.visita / b.c.recebidos > a.c.visita / a.c.recebidos ? b : a))
    return m.c.visita > 0 ? m : null
  }
  if (filtro.produto === null) {
    const p = melhor(ladoALado(f, 'produto', filtro))
    if (p) out.push({ tom: 'info', texto: `${p.nome} é o produto que mais leva a visita: ${n(p.c.visita)} de ${n(p.c.recebidos)} leads (${fmtTaxa(taxa(p.c.visita, p.c.recebidos))}).` })
  }
  if (filtro.corretor === null) {
    const k = melhor(ladoALado(f, 'corretor', filtro))
    if (k) out.push({ tom: 'sucesso', texto: `${k.nome} é quem mais leva lead a visita: ${n(k.c.visita)} de ${n(k.c.recebidos)} (${fmtTaxa(taxa(k.c.visita, k.c.recebidos))}).` })
  }

  // 3. Descartes
  if (c.descartados > 0) {
    const [principal] = motivosSafra(f, filtro, 1)
    const parte = `${fmtTaxa(taxa(c.descartados, c.recebidos))} da safra foi descartada (${n(c.descartados)} de ${n(c.recebidos)})`
    out.push({ tom: 'neutro', texto: principal ? `${parte}. Motivo mais comum: ${nomeMotivo(principal.motivo)} (${n(principal.n)}).` : `${parte}.` })
  }

  // 4. Tempo até a visita
  const t = tempoAteVisita(f, filtro)
  if (t.mediana !== null && t.total >= 3) {
    out.push({
      tom: 'neutro',
      texto: t.mediana < 1
        ? 'Metade das visitas acontece no mesmo dia em que o lead chega.'
        : `Metade das visitas acontece em até ${t.mediana.toLocaleString('pt-BR')} ${t.mediana === 1 ? 'dia' : 'dias'} depois da chegada do lead.`,
    })
  }

  // 5. Safra ainda nova: a taxa dos últimos dias ainda vai subir
  if (f.end && f.end >= hoje && c.emAndamento > 0) {
    out.push({ tom: 'info', texto: `${n(c.emAndamento)} ${c.emAndamento === 1 ? 'lead segue' : 'leads seguem'} em andamento. Os que chegaram nos últimos dias ainda estão no começo do funil, então as taxas desta safra ainda podem subir.` })
  }

  // 6. Limite do histórico
  if (f.historySince && (f.start === null || f.start < f.historySince)) {
    const [y, m, d] = f.historySince.split('-')
    out.push({ tom: 'info', texto: `As mudanças de etapa só são registradas desde ${d}/${m}/${y}. Para leads anteriores, vale a etapa em que estão hoje.` })
  }

  return out
}
