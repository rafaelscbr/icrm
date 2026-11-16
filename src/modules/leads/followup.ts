/**
 * Leads › Followup — a parte que calcula, sem tela.
 *
 * A pergunta da aba: onde o funil está em silêncio? Quais leads estão há dias
 * sem um contato nosso, em que etapa, e com qual corretor.
 *
 * A régua é a mesma do resto do funil (`contato.ts`): o relógio conta desde
 * `leads.last_contact_at` — WhatsApp, ligação ou tarefa concluída, mantido pelo
 * banco (migração 074) — ou, sem nenhum contato, desde a entrada do lead.
 * O sistema sabe que o corretor ABRIU a conversa, não que o cliente respondeu:
 * por isso tudo aqui fala em "contato", nunca em "conversa".
 *
 * Nada toca a rede: os leads já estão em memória no `useLeadsStore`.
 */
import type { Lead, LeadFunnelStage } from '../../types'
import { diasSemContato, nivelContato, msSemContato, ESFRIANDO_DIAS, PARADO_DIAS } from './contato'
import type { NivelContato } from './contato'

/** Etapas acompanhadas. Venda fechada não espera followup. */
export const ETAPAS_FOLLOWUP: LeadFunnelStage[] = ['lead', 'followup', 'atendimento', 'visita', 'proposta']

/**
 * Faixas de dias sem contato. Os cortes acompanham os níveis do funil:
 * até 1 dia = em dia · 2 a 6 = esfriando · 7 ou mais = parado.
 */
export const FAIXAS = [
  { id: 'hoje',  curto: 'Hoje',   rotulo: 'contato hoje',            min: 0,  max: 0,        nivel: 'em_dia'    },
  { id: '1',     curto: '1d',     rotulo: '1 dia sem contato',       min: 1,  max: 1,        nivel: 'em_dia'    },
  { id: '2-3',   curto: '2–3d',   rotulo: '2 a 3 dias sem contato',  min: 2,  max: 3,        nivel: 'esfriando' },
  { id: '4-6',   curto: '4–6d',   rotulo: '4 a 6 dias sem contato',  min: 4,  max: 6,        nivel: 'esfriando' },
  { id: '7-14',  curto: '7–14d',  rotulo: '7 a 14 dias sem contato', min: 7,  max: 14,       nivel: 'parado'    },
  { id: '15-30', curto: '15–30d', rotulo: '15 a 30 dias sem contato', min: 15, max: 30,      nivel: 'parado'    },
  { id: '30+',   curto: '30d+',   rotulo: 'mais de 30 dias sem contato', min: 31, max: Infinity, nivel: 'parado' },
] as const satisfies readonly { id: string; curto: string; rotulo: string; min: number; max: number; nivel: NivelContato }[]

export type FaixaId = typeof FAIXAS[number]['id']

export function faixaDe(dias: number): FaixaId {
  return (FAIXAS.find(f => dias >= f.min && dias <= f.max) ?? FAIXAS[FAIXAS.length - 1]).id
}

/** Só o que ainda está no funil: descartado e encerrado não esperam contato. */
export function ativosParaFollowup<T extends Pick<Lead, 'discardReason' | 'closedAt' | 'funnelStage'>>(leads: T[]): T[] {
  return leads.filter(l => !l.discardReason && !l.closedAt && l.funnelStage !== 'venda')
}

export interface ResumoFollowup {
  total: number
  emDia: number
  esfriando: number
  parado: number
  /** nenhum contato registrado desde que entrou */
  nunca: number
  /** % da carteira com contato nos últimos ESFRIANDO_DIAS dias; null sem carteira */
  pctEmDia: number | null
  /** soma do ticket dos leads parados em atendimento, visita ou proposta */
  valorParado: number
  /** mediana de dias sem contato */
  medianaDias: number | null
  maiorSilencio: number
}

const QUENTES = new Set<LeadFunnelStage>(['atendimento', 'visita', 'proposta'])

export function resumoFollowup(leads: Lead[], agora = Date.now()): ResumoFollowup {
  const r: ResumoFollowup = {
    total: leads.length, emDia: 0, esfriando: 0, parado: 0, nunca: 0,
    pctEmDia: null, valorParado: 0, medianaDias: null, maiorSilencio: 0,
  }
  const dias: number[] = []
  for (const l of leads) {
    const nivel = nivelContato(l, agora)
    if (nivel === 'em_dia') r.emDia++
    else if (nivel === 'esfriando') r.esfriando++
    else {
      r.parado++
      if (QUENTES.has(l.funnelStage)) r.valorParado += l.averageTicket ?? 0
    }
    if (!l.lastContactAt) r.nunca++
    const d = diasSemContato(l, agora)
    dias.push(d)
    if (d > r.maiorSilencio) r.maiorSilencio = d
  }
  if (leads.length > 0) {
    r.pctEmDia = (r.emDia / leads.length) * 100
    dias.sort((a, b) => a - b)
    const m = Math.floor(dias.length / 2)
    r.medianaDias = dias.length % 2 ? dias[m] : (dias[m - 1] + dias[m]) / 2
  }
  return r
}

/** Etapa × faixa: quantos leads em cada cruzamento. */
export type MatrizFollowup = Record<LeadFunnelStage, Record<FaixaId, number>>

export function matrizFollowup(leads: Lead[], agora = Date.now()): MatrizFollowup {
  const m = {} as MatrizFollowup
  for (const e of ETAPAS_FOLLOWUP) {
    m[e] = Object.fromEntries(FAIXAS.map(f => [f.id, 0])) as Record<FaixaId, number>
  }
  for (const l of leads) {
    const linha = m[l.funnelStage]
    if (linha) linha[faixaDe(diasSemContato(l, agora))]++
  }
  return m
}

export interface LinhaCorretor extends ResumoFollowup { brokerId: string | null }

/** Um resumo por corretor — quem tem mais lead parado vem primeiro. */
export function followupPorCorretor(leads: Lead[], agora = Date.now()): LinhaCorretor[] {
  const grupos = new Map<string | null, Lead[]>()
  for (const l of leads) {
    const k = l.brokerId ?? null
    const g = grupos.get(k)
    if (g) g.push(l); else grupos.set(k, [l])
  }
  return [...grupos.entries()]
    .map(([brokerId, ls]) => ({ brokerId, ...resumoFollowup(ls, agora) }))
    .sort((a, b) => b.parado - a.parado || b.esfriando - a.esfriando || b.total - a.total)
}

export interface FiltroFollowup {
  etapa?: LeadFunnelStage | null
  faixa?: FaixaId | null
  nivel?: NivelContato | null
  /** só quem nunca recebeu contato */
  nunca?: boolean
}

/** Os leads do recorte, do silêncio mais longo para o mais curto. */
export function filtrarFollowup(leads: Lead[], f: FiltroFollowup, agora = Date.now()): Lead[] {
  return leads
    .filter(l => {
      if (f.etapa && l.funnelStage !== f.etapa) return false
      if (f.faixa && faixaDe(diasSemContato(l, agora)) !== f.faixa) return false
      if (f.nivel && nivelContato(l, agora) !== f.nivel) return false
      if (f.nunca && l.lastContactAt) return false
      return true
    })
    .sort((a, b) => msSemContato(b, agora) - msSemContato(a, agora))
}

// ── Leituras ──────────────────────────────────────────────────────────────────

export type TomLeitura = 'sucesso' | 'atencao' | 'risco' | 'neutro'
export interface LeituraFollowup { tom: TomLeitura; texto: string }

const n = (v: number) => v.toLocaleString('pt-BR')

/**
 * O que a carteira diz, em frases — sempre com o número que sustenta a frase.
 * `nomeCorretor` devolve o nome para exibir; sem nome, a leitura por corretor
 * não sai (melhor omitir do que apontar "alguém").
 */
export function leiturasFollowup(
  leads: Lead[],
  resumo: ResumoFollowup,
  corretores: LinhaCorretor[],
  nomeCorretor: (id: string | null) => string | undefined,
  moeda: (v: number) => string,
  agora = Date.now(),
): LeituraFollowup[] {
  const out: LeituraFollowup[] = []
  if (resumo.total === 0) return out

  // 1. Negociação parada: o silêncio que mais custa
  const quentesParados = leads.filter(l => QUENTES.has(l.funnelStage) && nivelContato(l, agora) === 'parado')
  if (quentesParados.length > 0) {
    out.push({
      tom: 'risco',
      texto: `${n(quentesParados.length)} ${quentesParados.length === 1 ? 'lead' : 'leads'} em atendimento, visita ou proposta ` +
             `${quentesParados.length === 1 ? 'está' : 'estão'} há ${PARADO_DIAS} dias ou mais sem contato` +
             (resumo.valorParado > 0 ? ` — ${moeda(resumo.valorParado)} em negociação parada.` : '.'),
    })
  }

  // 2. Nunca contatados
  if (resumo.nunca > 0) {
    out.push({
      tom: 'atencao',
      texto: `${n(resumo.nunca)} ${resumo.nunca === 1 ? 'lead nunca recebeu' : 'leads nunca receberam'} um contato registrado desde que ${resumo.nunca === 1 ? 'entrou' : 'entraram'}.`,
    })
  }

  // 3. Onde os parados se concentram
  const comParado = corretores.filter(c => c.parado > 0 && nomeCorretor(c.brokerId))
  if (corretores.length > 1 && comParado.length > 0 && resumo.parado >= 5) {
    const pior = comParado[0]
    const parte = (pior.parado / resumo.parado) * 100
    if (parte >= 50) {
      out.push({
        tom: 'atencao',
        texto: `${nomeCorretor(pior.brokerId)} concentra ${n(pior.parado)} dos ${n(resumo.parado)} leads parados (${Math.round(parte)}%).`,
      })
    }
  }

  // 4. O retrato geral
  if (resumo.pctEmDia !== null) {
    const pct = Math.round(resumo.pctEmDia)
    out.push({
      tom: pct >= 70 ? 'sucesso' : 'neutro',
      texto: `${n(resumo.emDia)} de ${n(resumo.total)} leads (${pct}%) receberam contato nos últimos ${ESFRIANDO_DIAS} dias` +
             (resumo.medianaDias !== null ? `. Metade da carteira está há ${n(Math.round(resumo.medianaDias))} ${Math.round(resumo.medianaDias) === 1 ? 'dia' : 'dias'} ou mais sem contato.` : '.'),
    })
  }

  return out
}

/** "46 dias", "1 dia", "hoje". */
export function textoDias(dias: number): string {
  if (dias <= 0) return 'hoje'
  return `${n(dias)} ${dias === 1 ? 'dia' : 'dias'}`
}
