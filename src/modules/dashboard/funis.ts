/**
 * Funis da dashboard principal (23/11/2026) — geral, por produto e por corretor.
 *
 * Três fontes, cada uma com o seu tempo, e a tela diz qual é qual:
 *
 *   • Conversão — por SAFRA (`funil_por_safra`, migração 103): dos leads que
 *     chegaram no período, até onde foram. A mesma conta da aba Conversão e do
 *     Pulse, então os números batem entre as telas.
 *   • Em andamento — os leads em aberto AGORA (sem descarte, sem venda
 *     concluída), com o VGV do Kanban (preço da tipologia) e a comissão pela
 *     regra de comissao.ts. Não depende do período: pipeline é o que está vivo.
 *   • Vendido — as vendas registradas no período (tabela sales), com a comissão
 *     gravada em cada venda (% sobre o valor e a parte do corretor). Vai para
 *     o produto VENDIDO (o lançamento da venda, migração 113) — a conversão,
 *     ao contrário, é do produto de ENTRADA, com a venda cruzada separada.
 *
 * Funções puras: é o que os testes cobrem.
 */

import type { Lead, Sale } from '../../types'
import { calcSaleCommissions } from '../../types'
import { divisao, ISS, PCT_PADRAO, SIMPLES } from '../leads/comissao'
import { contagemVazia, contar, cruzamentos, SEM } from '../leads/safra'
import type { Contagem, Cruzamento, FunilSafra } from '../leads/safra'

// ── Período ───────────────────────────────────────────────────────────────────

export type Periodo = 'mes' | '3m' | '12m' | 'tudo'

export const PERIODOS: { value: Periodo; label: string; descricao: string }[] = [
  { value: 'mes',  label: 'Mês',      descricao: 'neste mês' },
  { value: '3m',   label: '3 meses',  descricao: 'nos últimos 3 meses' },
  { value: '12m',  label: '12 meses', descricao: 'nos últimos 12 meses' },
  { value: 'tudo', label: 'Tudo',     descricao: 'desde o início' },
]

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Primeiro dia do período (AAAA-MM-DD), na data local; `null` = desde sempre. */
export function inicioDoPeriodo(p: Periodo, hoje: Date = new Date()): string | null {
  if (p === 'tudo') return null
  if (p === 'mes') return iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1))
  const meses = p === '3m' ? 3 : 12
  return iso(new Date(hoje.getFullYear(), hoje.getMonth() - meses, hoje.getDate() + 1))
}

// ── Dinheiro ──────────────────────────────────────────────────────────────────

/** VGV e a comissão dele, já dividida. bruta = impostos + corretor + souza. */
export interface Dinheiro {
  vgv: number
  bruta: number
  /** ISS e Simples */
  impostos: number
  corretor: number
  souza: number
}

export function dinheiroVazio(): Dinheiro {
  return { vgv: 0, bruta: 0, impostos: 0, corretor: 0, souza: 0 }
}

function somarDinheiro(a: Dinheiro, b: Dinheiro) {
  a.vgv += b.vgv; a.bruta += b.bruta; a.impostos += b.impostos; a.corretor += b.corretor; a.souza += b.souza
}

/** Fração da bruta que sobra depois do ISS e do Simples (0,97 × 0,94). */
const SOBRA = (1 - ISS) * (1 - SIMPLES)

/**
 * Comissão de uma venda registrada. A bruta é a gravada na venda (% sobre o
 * valor ou valor fixo). A parte do corretor também é a gravada (broker_pct) —
 * mas só para quem tem parte no perfil: venda do próprio dono da imobiliária
 * fica toda com a Souza, como no Kanban.
 */
export function dinheiroDaVenda(s: Sale, temParte: boolean): Dinheiro {
  const { totalCommission, brokerCommission } = calcSaleCommissions(s)
  const bruta = totalCommission
  const impostos = bruta * (1 - SOBRA)
  const corretor = temParte ? brokerCommission : 0
  return { vgv: s.value, bruta, impostos, corretor, souza: bruta - impostos - corretor }
}

/** Comissão estimada de um lead em aberto — a conta do Kanban (comissao.ts). */
export function dinheiroDoLead(vgv: number, share: number | null, pct: number = PCT_PADRAO): Dinheiro {
  const d = divisao(vgv, share, pct)
  return { vgv, bruta: d.bruta, impostos: d.bruta - d.liquida, corretor: d.corretor, souza: d.souza }
}

// ── Produto ───────────────────────────────────────────────────────────────────

/** A chave de produto do cubo do banco: o nome em minúsculas, sem espaço nas pontas. */
export function chaveProduto(nome: string | null | undefined): string {
  const n = (nome ?? '').trim().toLowerCase()
  return n || SEM
}

/** Para comparar grafias: sem acento, sem símbolo e sem letra dobrada ("Pelegrino" = "Pellegrino"). */
export function comparavel(nome: string): string {
  return nome
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/(.)\1+/g, '$1')
}

export const OUTROS = '__outros__'

export interface CandidatoProduto {
  chave: string
  /** grafias que identificam o produto: o nome e, se houver, apelidos (o id do lançamento) */
  nomes: string[]
}

/**
 * O produto de uma venda lançada direto no módulo Vendas, sem lead: o nome
 * digitado ("Porto Velas - Torre C 605", "San Pelegrino", "Rogga") contra os
 * produtos conhecidos. O nome mais longo que couber ganha. Sem nenhum, a venda
 * vai para "Outros imóveis".
 */
export function produtoDaVenda(nomeVenda: string, candidatos: CandidatoProduto[]): string {
  const v = comparavel(nomeVenda)
  if (!v) return OUTROS
  let melhor: { chave: string; tam: number } | null = null
  for (const c of candidatos) {
    for (const nome of c.nomes) {
      const n = comparavel(nome)
      if (n.length < 4) continue
      if (v.includes(n) || n.includes(v)) {
        const tam = Math.min(n.length, v.length)
        if (!melhor || tam > melhor.tam) melhor = { chave: c.chave, tam }
      }
    }
  }
  return melhor?.chave ?? OUTROS
}

// ── Recortes ──────────────────────────────────────────────────────────────────

/** Etapas do pipeline aberto, na régua da safra: lead e followup = 1º contato. */
export type EtapaAberta = 'chegada' | 'atendimento' | 'visita' | 'proposta'
export const ETAPAS_ABERTAS: EtapaAberta[] = ['chegada', 'atendimento', 'visita', 'proposta']

export function etapaAberta(stage: Lead['funnelStage']): EtapaAberta | null {
  if (stage === 'lead' || stage === 'followup') return 'chegada'
  if (stage === 'venda') return null
  return stage
}

export interface Recorte {
  chave: string
  nome: string
  /** conversão por safra no período (pelo produto de entrada) */
  safra: Contagem
  /** vendas cruzadas: para onde foram os leads deste recorte, de onde vieram as laterais */
  cruzadas: { para: Cruzamento[]; de: Cruzamento[] }
  /** leads em aberto agora, por etapa */
  aberto: Record<EtapaAberta, { n: number; vgv: number }>
  pipeline: Dinheiro & { n: number }
  vendido: Dinheiro & { n: number }
}

function recorteVazio(chave: string, nome: string): Recorte {
  const e = () => ({ n: 0, vgv: 0 })
  return {
    chave, nome, safra: contagemVazia(), cruzadas: { para: [], de: [] },
    aberto: { chegada: e(), atendimento: e(), visita: e(), proposta: e() },
    pipeline: { ...dinheiroVazio(), n: 0 },
    vendido: { ...dinheiroVazio(), n: 0 },
  }
}

/** Há o que mostrar neste recorte? */
export function temMovimento(r: Recorte): boolean {
  return r.safra.recebidos > 0 || r.pipeline.n > 0 || r.vendido.n > 0
}

export interface EntradaFunis {
  safra: FunilSafra | null
  leads: Lead[]
  sales: Sale[]
  /** início do período (inclusive), AAAA-MM-DD; null = tudo */
  inicio: string | null
  /** corretor da visão; null = imobiliária inteira */
  corretor: string | null
  /** % de comissão por lançamento (developments.commission_pct) */
  pctDoLancamento: Map<string, number>
  /** nomes dos lançamentos da carteira, por id */
  lancamentos: { id: string; nome: string }[]
  /** parte do corretor na líquida (profiles.commission_share) */
  shareDe: (brokerId: string | null | undefined) => number | null
  nomeDoCorretor: (brokerId: string) => string
}

export interface Funis {
  geral: Recorte
  porProduto: Recorte[]
  porCorretor: Recorte[]
}

/** Recortes com tão pouco que viram uma linha só: menos de 5 leads, nada aberto, nada vendido. */
const PISO_PRODUTO = 5

export function montarFunis(e: EntradaFunis): Funis {
  const naVisao = (brokerId: string | null | undefined) => e.corretor === null || brokerId === e.corretor

  const geral = recorteVazio('geral', 'Imobiliária')
  const produtos = new Map<string, Recorte>()
  const corretores = new Map<string, Recorte>()

  const doProduto = (chave: string, nome: string) => {
    let r = produtos.get(chave)
    if (!r) { r = recorteVazio(chave, nome); produtos.set(chave, r) }
    return r
  }
  const doCorretor = (id: string | null | undefined) => {
    const chave = id ?? SEM
    let r = corretores.get(chave)
    if (!r) { r = recorteVazio(chave, id ? e.nomeDoCorretor(id) : 'Sem corretor'); corretores.set(chave, r) }
    return r
  }

  // 1. Conversão por safra — o cubo, recortado como a aba Conversão recorta.
  if (e.safra) {
    const filtroCorretor = e.corretor
    geral.safra = contar(e.safra, { corretor: filtroCorretor, produto: null })
    geral.cruzadas = cruzamentos(e.safra, { corretor: filtroCorretor, produto: null })
    for (const p of e.safra.produtos) {
      const r = doProduto(p.chave, p.nome)
      r.safra = contar(e.safra, { corretor: filtroCorretor, produto: p.chave })
      r.cruzadas = cruzamentos(e.safra, { corretor: filtroCorretor, produto: p.chave })
    }
    for (const c of e.safra.corretores) {
      if (filtroCorretor !== null && c.chave !== filtroCorretor) continue
      const r = doCorretor(c.chave === SEM ? null : c.chave)
      r.nome = c.chave === SEM ? 'Sem corretor' : e.nomeDoCorretor(c.chave)
      r.safra = contar(e.safra, { corretor: c.chave, produto: null })
      r.cruzadas = cruzamentos(e.safra, { corretor: c.chave, produto: null })
    }
  }

  // 2. Em andamento — leads em aberto agora.
  for (const l of e.leads) {
    if (l.discardReason || l.closedAt || !naVisao(l.brokerId)) continue
    const etapa = etapaAberta(l.funnelStage)
    if (!etapa) continue
    const vgv = l.averageTicket ?? 0
    const pct = (l.developmentId && e.pctDoLancamento.get(l.developmentId)) || PCT_PADRAO
    const d = dinheiroDoLead(vgv, e.shareDe(l.brokerId), pct)
    const chave = chaveProduto(l.propertyName)
    for (const r of [geral, doProduto(chave, l.propertyName?.trim() || 'Sem produto'), doCorretor(l.brokerId)]) {
      r.aberto[etapa].n += 1
      r.aberto[etapa].vgv += vgv
      r.pipeline.n += 1
      somarDinheiro(r.pipeline, d)
    }
  }

  // 3. Vendido — vendas registradas no período, no produto VENDIDO: o
  //    lançamento gravado na venda; sem ele, o produto do lead; sem lead, o
  //    nome digitado contra os produtos conhecidos.
  const chaveDoLancamento = new Map(e.lancamentos.map(d => [d.id, chaveProduto(d.nome)]))
  const produtoDoLeadDaVenda = new Map<string, string>()
  for (const l of e.leads) if (l.saleId) produtoDoLeadDaVenda.set(l.saleId, chaveProduto(l.propertyName))
  const candidatos: CandidatoProduto[] = [
    ...e.lancamentos.map(d => ({ chave: chaveProduto(d.nome), nomes: [d.nome, d.id.replace(/^dev-/, '')] })),
    ...[...produtos.values()].filter(r => r.chave !== SEM).map(r => ({ chave: r.chave, nomes: [r.nome] })),
  ]
  const nomeDoLancamento = new Map(e.lancamentos.map(d => [chaveProduto(d.nome), d.nome]))

  for (const s of e.sales) {
    if (e.inicio && s.date < e.inicio) continue
    if (!naVisao(s.brokerId)) continue
    const share = e.shareDe(s.brokerId)
    const d = dinheiroDaVenda(s, share != null && share > 0)
    const chave = (s.developmentId && chaveDoLancamento.get(s.developmentId))
      || produtoDoLeadDaVenda.get(s.id) || produtoDaVenda(s.propertyName, candidatos)
    const nome = chave === OUTROS ? 'Outros imóveis' : produtos.get(chave)?.nome ?? nomeDoLancamento.get(chave) ?? s.propertyName
    for (const r of [geral, doProduto(chave, nome), doCorretor(s.brokerId)]) {
      r.vendido.n += 1
      somarDinheiro(r.vendido, d)
    }
  }

  // Produtos miúdos (e os sem produto) viram "Outros", para a grade não virar lista.
  const porProduto: Recorte[] = []
  const outros = recorteVazio(OUTROS, 'Outros imóveis')
  for (const r of produtos.values()) {
    if (!temMovimento(r)) continue
    const miudo = r.chave === OUTROS || r.chave === SEM ||
      (r.safra.recebidos < PISO_PRODUTO && r.pipeline.n === 0 && r.vendido.n === 0)
    if (miudo) juntar(outros, r)
    else porProduto.push(r)
  }
  if (temMovimento(outros)) porProduto.push(outros)

  return {
    geral,
    porProduto: ordenar(porProduto, OUTROS),
    porCorretor: ordenar([...corretores.values()].filter(temMovimento), SEM),
  }
}

/** Soma um recorte no outro (para "Outros"). */
function juntar(a: Recorte, b: Recorte) {
  const s = a.safra, t = b.safra
  s.recebidos += t.recebidos; s.atendimento += t.atendimento; s.visita += t.visita
  s.proposta += t.proposta; s.venda += t.venda; s.descartados += t.descartados; s.emAndamento += t.emAndamento
  s.vendaPropria += t.vendaPropria; s.vendaCruzada += t.vendaCruzada; s.vindas += t.vindas
  a.cruzadas = { para: somarCruz(a.cruzadas.para, b.cruzadas.para), de: somarCruz(a.cruzadas.de, b.cruzadas.de) }
  for (const k of Object.keys(s.parouEm) as (keyof Contagem['parouEm'])[]) {
    s.parouEm[k].ativos += t.parouEm[k].ativos
    s.parouEm[k].descartados += t.parouEm[k].descartados
  }
  for (const k of ETAPAS_ABERTAS) { a.aberto[k].n += b.aberto[k].n; a.aberto[k].vgv += b.aberto[k].vgv }
  a.pipeline.n += b.pipeline.n; somarDinheiro(a.pipeline, b.pipeline)
  a.vendido.n += b.vendido.n; somarDinheiro(a.vendido, b.vendido)
}

function somarCruz(a: Cruzamento[], b: Cruzamento[]): Cruzamento[] {
  const m = new Map(a.map(x => [x.chave, { ...x }]))
  for (const x of b) {
    const y = m.get(x.chave)
    if (y) y.n += x.n
    else m.set(x.chave, { ...x })
  }
  return [...m.values()].sort((p, q) => q.n - p.n || p.nome.localeCompare(q.nome, 'pt-BR'))
}

/** Mais dinheiro primeiro (vendido + em andamento), depois mais leads; o resto por último. */
function ordenar(rs: Recorte[], ultimo: string): Recorte[] {
  return rs.sort((a, b) =>
    Number(a.chave === ultimo) - Number(b.chave === ultimo) ||
    (b.vendido.vgv + b.pipeline.vgv) - (a.vendido.vgv + a.pipeline.vgv) ||
    b.safra.recebidos - a.safra.recebidos ||
    a.nome.localeCompare(b.nome, 'pt-BR'))
}
