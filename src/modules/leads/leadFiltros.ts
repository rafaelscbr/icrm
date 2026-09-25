import { Lead, LeadFunnelStage, LeadOrigin } from '../../types'
import type { Fit, LeadIntel, Temperature } from '../../lib/intelligence'
import type { KanbanSort } from '../../store/useKanbanPrefs'
import { slaActive } from './SlaBadge'
import { avisoReentrada, reentradaPrimeiro } from './reentrada'
import { msSemContato, semContatoHaMaisDe } from './contato'

/**
 * Filtros do funil — a regra, sem tela.
 *
 * Lista e Kanban aplicam exatamente a mesma função, e as contagens dos atalhos
 * e do painel saem dela também. É o que garante que o "12" ao lado de um filtro
 * seja o número de cards que aparecem ao clicar nele — contagem que promete
 * uma coisa e entrega outra ensina a desconfiar da tela inteira.
 *
 * Facetas diferentes se somam (E); valores dentro da mesma faceta se alternam
 * (OU): "Visita ou Proposta, de Meta Ads, sem contato há mais de 7 dias".
 */

export type PeriodoEntrada =
  | 'hoje' | 'ontem' | 'semana' | '7d' | 'mes' | '30d' | 'mais30' | 'personalizado'

/** Mais de N dias sem contato, ou nenhum contato registrado desde a entrada. */
export type JanelaContato = '2' | '7' | '15' | '30' | 'nunca'

export interface FiltrosLead {
  busca: string
  etapas: LeadFunnelStage[]
  origens: LeadOrigin[]
  temperaturas: Temperature[]
  encaixes: Fit[]
  /** '' = leads sem corretor */
  corretores: string[]
  /** chave de `chaveProduto` */
  produtos: string[]
  prioridade: boolean
  /** SLA de 1º contato correndo (lead Meta ainda não atendido) */
  sla: boolean
  /** voltou a se cadastrar e o dono ainda não viu */
  voltou: boolean
  semContato: JanelaContato | null
  entrada: PeriodoEntrada | null
  /** YYYY-MM-DD — só no período personalizado */
  entradaDe: string
  entradaAte: string
}

export const FILTROS_VAZIOS: FiltrosLead = {
  busca: '', etapas: [], origens: [], temperaturas: [], encaixes: [], corretores: [], produtos: [],
  prioridade: false, sla: false, voltou: false, semContato: null,
  entrada: null, entradaDe: '', entradaAte: '',
}

export type Faceta = Exclude<keyof FiltrosLead, 'entradaDe' | 'entradaAte'>

export const PERIODO_LABEL: Record<PeriodoEntrada, string> = {
  hoje:          'Hoje',
  ontem:         'Ontem',
  semana:        'Esta semana',
  '7d':          'Últimos 7 dias',
  mes:           'Este mês',
  '30d':         'Últimos 30 dias',
  mais30:        'Há mais de 30 dias',
  personalizado: 'Escolher datas',
}

export const JANELA_LABEL: Record<JanelaContato, string> = {
  '2':   'Mais de 2 dias',
  '7':   'Mais de 7 dias',
  '15':  'Mais de 15 dias',
  '30':  'Mais de 30 dias',
  nunca: 'Nunca contatado',
}

export interface ContextoFiltro {
  intel: Record<string, LeadIntel | undefined>
  /** relógio injetável — os testes fixam o "agora" */
  agora?: number
  /** Kanban: as colunas já são as etapas, o filtro de etapa não se aplica. */
  ignorarEtapa?: boolean
  /** nome que a tela mostra (o do contato do CRM, quando vinculado) */
  nomeExibido?: (l: Lead) => string
  /** nome do produto de interesse, cadastrado ou livre */
  nomeProduto?: (l: Lead) => string | undefined
}

// ── Produto ──────────────────────────────────────────────────────────────────

/** Chave única do produto de interesse: imóvel cadastrado (id:) ou nome livre (name:). */
export function chaveProduto(lead: Lead): string | null {
  if (lead.propertyId)   return `id:${lead.propertyId}`
  if (lead.propertyName) return `name:${lead.propertyName.trim().toLowerCase()}`
  return null
}

// ── Período de entrada ───────────────────────────────────────────────────────

function inicioDoDia(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Soma dias no calendário local — resiste a mudança de horário de verão. */
function somaDias(ms: number, n: number): number {
  const d = new Date(ms)
  d.setDate(d.getDate() + n)
  return d.getTime()
}

/**
 * Intervalo [de, ate) em ms, no fuso de quem usa. `null` = sem restrição.
 *
 * Semana vai de domingo a sábado — convenção do sistema desde 14/06/2026.
 * "Há mais de 30 dias" é o complemento exato de "Últimos 30 dias": os dois
 * juntos cobrem o funil inteiro, sem lead em dois lugares nem em nenhum.
 */
export function intervaloEntrada(
  f: Pick<FiltrosLead, 'entrada' | 'entradaDe' | 'entradaAte'>,
  agora = Date.now(),
): { de: number; ate: number } | null {
  const hoje = inicioDoDia(agora)
  switch (f.entrada) {
    case null:     return null
    case 'hoje':   return { de: hoje, ate: somaDias(hoje, 1) }
    case 'ontem':  return { de: somaDias(hoje, -1), ate: hoje }
    case 'semana': {
      const ini = somaDias(hoje, -new Date(hoje).getDay())
      return { de: ini, ate: somaDias(ini, 7) }
    }
    case '7d':     return { de: somaDias(hoje, -6), ate: somaDias(hoje, 1) }
    case 'mes': {
      const d = new Date(hoje)
      d.setDate(1)
      const ini = d.getTime()
      d.setMonth(d.getMonth() + 1)
      return { de: ini, ate: d.getTime() }
    }
    case '30d':    return { de: somaDias(hoje, -29), ate: somaDias(hoje, 1) }
    case 'mais30': return { de: -Infinity, ate: somaDias(hoje, -29) }
    case 'personalizado': {
      const de  = f.entradaDe  ? new Date(`${f.entradaDe}T00:00:00`).getTime() : -Infinity
      const ate = f.entradaAte ? somaDias(new Date(`${f.entradaAte}T00:00:00`).getTime(), 1) : Infinity
      return { de, ate }
    }
  }
}

// ── Busca ────────────────────────────────────────────────────────────────────

/** Minúsculas e sem acento: "João" e "joao" são a mesma pessoa. */
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function casaBusca(l: Lead, busca: string, ctx: ContextoFiltro): boolean {
  const q = normalizar(busca.trim())
  if (!q) return true
  const nome = ctx.nomeExibido?.(l) ?? l.name
  if (normalizar(nome).includes(q)) return true
  if (nome !== l.name && normalizar(l.name).includes(q)) return true
  if (l.email && normalizar(l.email).includes(q)) return true
  const produto = ctx.nomeProduto?.(l) ?? l.propertyName
  if (produto && normalizar(produto).includes(q)) return true
  // Telefone por dígitos: "(47) 99912" encontra "5547999123456".
  const digitos = q.replace(/\D/g, '')
  return digitos.length >= 3 && l.phone.replace(/\D/g, '').includes(digitos)
}

// ── Aplicação ────────────────────────────────────────────────────────────────

/**
 * O lead passa nos filtros? `exceto` ignora uma faceta — é assim que se conta
 * "quantos aparecem se eu escolher esta opção" sem a própria faceta zerar a
 * conta das irmãs.
 */
export function passa(l: Lead, f: FiltrosLead, ctx: ContextoFiltro, exceto?: Faceta): boolean {
  const agora = ctx.agora ?? Date.now()
  const usa = (fa: Faceta) => fa !== exceto

  if (usa('busca') && f.busca.trim() && !casaBusca(l, f.busca, ctx)) return false
  if (usa('etapas') && !ctx.ignorarEtapa && f.etapas.length > 0 && !f.etapas.includes(l.funnelStage)) return false
  if (usa('origens') && f.origens.length > 0 && !f.origens.includes(l.origin)) return false
  if (usa('temperaturas') && f.temperaturas.length > 0) {
    const t = ctx.intel[l.id]?.temperature
    if (!t || !f.temperaturas.includes(t)) return false
  }
  if (usa('encaixes') && f.encaixes.length > 0
      && !f.encaixes.includes(ctx.intel[l.id]?.fitOrigin?.fit ?? 'sem_dados')) return false
  if (usa('corretores') && f.corretores.length > 0 && !f.corretores.includes(l.brokerId ?? '')) return false
  if (usa('produtos') && f.produtos.length > 0) {
    const k = chaveProduto(l)
    if (!k || !f.produtos.includes(k)) return false
  }
  if (usa('prioridade') && f.prioridade && !l.flagged) return false
  if (usa('sla') && f.sla && !slaActive(l)) return false
  if (usa('voltou') && f.voltou && !avisoReentrada(l)) return false
  if (usa('semContato') && f.semContato) {
    if (f.semContato === 'nunca') {
      if (l.lastContactAt) return false
    } else if (!semContatoHaMaisDe(l, Number(f.semContato), agora)) {
      return false
    }
  }
  if (usa('entrada') && f.entrada) {
    const iv = intervaloEntrada(f, agora)
    if (iv) {
      const t = new Date(l.createdAt).getTime()
      if (t < iv.de || t >= iv.ate) return false
    }
  }
  return true
}

export function aplicarFiltros(leads: Lead[], f: FiltrosLead, ctx: ContextoFiltro, exceto?: Faceta): Lead[] {
  return leads.filter(l => passa(l, f, ctx, exceto))
}

/** Quantas facetas estão restringindo — a busca fica de fora, ela tem a própria caixa. */
export function contarFiltros(f: FiltrosLead, ctx: Pick<ContextoFiltro, 'ignorarEtapa'> = {}): number {
  return (!ctx.ignorarEtapa && f.etapas.length > 0 ? 1 : 0)
    + (f.origens.length > 0 ? 1 : 0)
    + (f.temperaturas.length > 0 ? 1 : 0)
    + (f.encaixes.length > 0 ? 1 : 0)
    + (f.corretores.length > 0 ? 1 : 0)
    + (f.produtos.length > 0 ? 1 : 0)
    + (f.prioridade ? 1 : 0)
    + (f.sla ? 1 : 0)
    + (f.voltou ? 1 : 0)
    + (f.semContato ? 1 : 0)
    + (f.entrada ? 1 : 0)
}

// ── Ordenação ────────────────────────────────────────────────────────────────

/** Ordem manual do Kanban: `kanbanOrder` arrastado, ou a última alteração. */
export function ordemEfetiva(lead: Lead): number {
  return lead.kanbanOrder ?? new Date(lead.updatedAt).getTime()
}

const ms = (iso?: string) => (iso ? new Date(iso).getTime() : 0)

export function comparador(ordem: KanbanSort, agora = Date.now()): (a: Lead, b: Lead) => number {
  switch (ordem) {
    case 'sem_contato': return (a, b) => msSemContato(b, agora) - msSemContato(a, agora)
    case 'prioridade':  return (a, b) => Number(!!b.flagged) - Number(!!a.flagged) || ordemEfetiva(b) - ordemEfetiva(a)
    case 'valor':       return (a, b) => (b.averageTicket ?? 0) - (a.averageTicket ?? 0)
    case 'etapa':       return (a, b) => ms(a.stageChangedAt ?? a.createdAt) - ms(b.stageChangedAt ?? b.createdAt)
    case 'criacao':     return (a, b) => ms(b.createdAt) - ms(a.createdAt)
    case 'antigos':     return (a, b) => ms(a.createdAt) - ms(b.createdAt)
    case 'manual':
    default:            return (a, b) => ordemEfetiva(b) - ordemEfetiva(a)
  }
}

/**
 * Ordena sem mexer no original. Reentrada não vista vem antes de qualquer
 * critério — destaque que aparece na quinta rolagem não é destaque (ver
 * reentrada.ts).
 */
export function ordenar(leads: Lead[], ordem: KanbanSort, agora = Date.now()): Lead[] {
  const cmp = comparador(ordem, agora)
  return [...leads].sort((a, b) => reentradaPrimeiro(a, b) || cmp(a, b))
}
