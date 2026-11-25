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
 *
 * Produto = o de ENTRADA (o anúncio que trouxe o lead — migração 113). Quem
 * chegou a Venda traz também o produto FECHADO: a venda se divide em própria
 * (fechou o produto de entrada) e cruzada (fechou outro), e o produto que
 * recebeu a venda cruzada a vê como "vinda de outra campanha" — fora do
 * funil dele, porque esse lead nunca passou pelo topo.
 */

import { inicioDoBalde, proximoBalde, taxa } from './conversao'
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
  /**
   * [corretor, produto de entrada, balde, etapa mais alta 0–5, descartado 0/1,
   *  leads, produto fechado (-1 = não chegou a Venda)]
   */
  cubo: [number, number, string, number, number, number, number?][]
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
  /** vendas que fecharam o próprio produto de entrada (ou sem produto fechado conhecido) */
  vendaPropria: number
  /** vendas que fecharam OUTRO produto */
  vendaCruzada: number
  /**
   * Só com filtro de produto: vendas DESTE produto que vieram de leads de
   * outras campanhas — a entrada lateral, fora do funil.
   */
  vindas: number
  descartados: number
  /** ainda vivos e sem venda */
  emAndamento: number
  /** onde cada lead parou (etapa mais alta alcançada), separado em vivo e descartado */
  parouEm: Record<'chegada' | 'atendimento' | 'visita' | 'proposta', Parada>
}

export function contagemVazia(): Contagem {
  const p = () => ({ ativos: 0, descartados: 0 })
  return {
    recebidos: 0, atendimento: 0, visita: 0, proposta: 0, venda: 0,
    vendaPropria: 0, vendaCruzada: 0, vindas: 0, descartados: 0, emAndamento: 0,
    parouEm: { chegada: p(), atendimento: p(), visita: p(), proposta: p() },
  }
}

/** A venda desta linha do cubo fechou outro produto que não o de entrada? */
function cruzada(pi: number, alc: number, fi: number | undefined): boolean {
  return alc >= 5 && fi !== undefined && fi >= 0 && fi !== pi
}

function somar(c: Contagem, alc: number, desc: number, n: number, cruz = false) {
  c.recebidos += n
  if (alc >= 2) c.atendimento += n
  if (alc >= 3) c.visita += n
  if (alc >= 4) c.proposta += n
  if (alc >= 5) {
    c.venda += n
    if (cruz) c.vendaCruzada += n
    else c.vendaPropria += n
  }
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
  for (const [ci, pi, , alc, d, n, fi] of f.cubo) if (ok(ci, pi)) somar(c, alc, d, n, cruzada(pi, alc, fi))
  // Entrada lateral: leads de outras campanhas que fecharam este produto.
  const p = indice(f.produtos, filtro.produto)
  if (p !== null && p >= 0) {
    const doCorretor = passa(f, { corretor: filtro.corretor, produto: null })
    for (const [ci, pi, , alc, , n, fi] of f.cubo) {
      if (alc >= 5 && fi === p && pi !== p && doCorretor(ci, pi)) c.vindas += n
    }
  }
  return c
}

/** Um produto e quantas vendas, para o "fecharam outro produto" e o "vindas de". */
export interface Cruzamento { chave: string; nome: string; n: number }

/**
 * As vendas cruzadas do recorte, por produto:
 *   para — os produtos que os leads DESTE recorte fecharam no lugar do de entrada;
 *   de   — com filtro de produto, as campanhas de onde vieram as vendas laterais.
 * Mais vendas primeiro.
 */
export function cruzamentos(f: FunilSafra, filtro: Filtro = SEM_FILTRO): { para: Cruzamento[]; de: Cruzamento[] } {
  const ok = passa(f, filtro)
  const para = new Map<number, number>()
  const de = new Map<number, number>()
  for (const [ci, pi, , alc, , n, fi] of f.cubo) {
    if (ok(ci, pi) && cruzada(pi, alc, fi)) para.set(fi!, (para.get(fi!) ?? 0) + n)
  }
  const p = indice(f.produtos, filtro.produto)
  if (p !== null && p >= 0) {
    const doCorretor = passa(f, { corretor: filtro.corretor, produto: null })
    for (const [ci, pi, , alc, , n, fi] of f.cubo) {
      if (alc >= 5 && fi === p && pi !== p && doCorretor(ci, pi)) de.set(pi, (de.get(pi) ?? 0) + n)
    }
  }
  const lista = (m: Map<number, number>) => [...m.entries()]
    .map(([i, n]) => ({ chave: f.produtos[i]?.chave ?? SEM, nome: f.produtos[i]?.nome ?? 'Sem produto', n }))
    .sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome, 'pt-BR'))
  return { para: lista(para), de: lista(de) }
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
  for (const [ci, pi, , alc, d, n, fi] of f.cubo) {
    const [meu, outro] = dim === 'corretor' ? [ci, pi] : [pi, ci]
    if (fixo !== null && fixo !== outro) continue
    somar(acc[meu], alc, d, n, cruzada(pi, alc, fi))
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
  for (const [ci, pi, , alc, d, n, fi] of f.cubo) {
    const cruz = cruzada(pi, alc, fi)
    somar(cel[ci * np + pi], alc, d, n, cruz)
    somar(lin[ci], alc, d, n, cruz)
    somar(col[pi], alc, d, n, cruz)
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
