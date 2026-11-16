/**
 * Leads › Dashboard — a parte que calcula, sem tela.
 *
 * Nada aqui toca a rede. O gráfico, o funil e a lista de atenção saem dos
 * leads que o `useLeadsStore` já tem em memória (carga única + realtime); a
 * atividade dos corretores sai do `usePulseStore` (um snapshot + INSERT ao
 * vivo). Estas funções só transformam esses dados — é o que os testes cobrem.
 */
import type { Lead, LeadFunnelStage } from '../../types'
import type { PulseEvent } from '../pulse/types'
import { describe } from '../pulse/pulseEvents'
import type { PulseEventView } from '../pulse/pulseEvents'
import { localDateStr } from '../../lib/formatters'

const DIA_MS = 86_400_000

// ── Leads recebidos por dia ───────────────────────────────────────────────────

export interface PontoDia { data: string; n: number }

/**
 * Um ponto por dia, do mais antigo para hoje, com zero onde não chegou nada.
 * Conta TODO lead que entrou — descartado e ganho também: a pergunta do gráfico
 * é "quanto chegou", não "quanto sobrou".
 */
export function leadsPorDia(leads: Pick<Lead, 'createdAt'>[], dias: number, agora: Date = new Date()): PontoDia[] {
  const porDia = new Map<string, number>()
  for (const l of leads) {
    const d = localDateStr(new Date(l.createdAt))
    porDia.set(d, (porDia.get(d) ?? 0) + 1)
  }
  const out: PontoDia[] = []
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - i)
    const data = localDateStr(d)
    out.push({ data, n: porDia.get(data) ?? 0 })
  }
  return out
}

/** Média por dia dos dias ANTERIORES a hoje — hoje ainda está em andamento. */
export function mediaSemHoje(serie: PontoDia[]): number | null {
  const fechados = serie.slice(0, -1)
  if (fechados.length === 0) return null
  return fechados.reduce((s, p) => s + p.n, 0) / fechados.length
}

// ── Funil agora ───────────────────────────────────────────────────────────────

export const ETAPAS_FUNIL: LeadFunnelStage[] = ['lead', 'followup', 'atendimento', 'visita', 'proposta', 'venda']

export interface FunilAgora {
  /** leads ativos (não descartados, não encerrados) em cada etapa */
  porEtapa: Record<LeadFunnelStage, number>
  ativos: number
  /** vendas concluídas no mês corrente */
  vendasNoMes: number
  /** soma do ticket dos leads ativos em visita e proposta */
  emNegociacao: number
  leadsEmNegociacao: number
}

type LeadFunil = Pick<Lead, 'funnelStage' | 'discardReason' | 'closedAt' | 'averageTicket'>

export function funilAgora(leads: LeadFunil[], agora: Date = new Date()): FunilAgora {
  const porEtapa = { lead: 0, followup: 0, atendimento: 0, visita: 0, proposta: 0, venda: 0 } as Record<LeadFunnelStage, number>
  const mes = localDateStr(agora).slice(0, 7)
  let ativos = 0, vendasNoMes = 0, emNegociacao = 0, leadsEmNegociacao = 0

  for (const l of leads) {
    if (l.closedAt) {
      if (localDateStr(new Date(l.closedAt)).slice(0, 7) === mes) vendasNoMes++
      continue
    }
    if (l.discardReason) continue
    ativos++
    porEtapa[l.funnelStage] = (porEtapa[l.funnelStage] ?? 0) + 1
    if (l.funnelStage === 'visita' || l.funnelStage === 'proposta') {
      leadsEmNegociacao++
      emNegociacao += l.averageTicket ?? 0
    }
  }
  return { porEtapa, ativos, vendasNoMes, emNegociacao, leadsEmNegociacao }
}

// ── O que pede atenção ────────────────────────────────────────────────────────

export interface Atencao<T> {
  /**
   * Lead com o relógio de 1º contato correndo e ainda sem contato — vencido ou
   * não. Mesma regra do Kanban (`slaActive`): mostrar só o vencido escondia o
   * lead que chegou fora do expediente e vence na manhã seguinte.
   */
  aguardandoPrimeiroContato: T[]
  /** em atendimento, visita ou proposta sem contato há DIAS_ESFRIANDO dias ou mais */
  esfriando: T[]
  /** preencheu o formulário de novo e o corretor ainda não viu */
  voltaram: T[]
}

type LeadAtencao = Pick<Lead,
  'funnelStage' | 'discardReason' | 'closedAt' | 'slaDueAt' | 'firstContactAt' | 'lastContactAt'
  | 'stageChangedAt' | 'createdAt' | 'reentryAt' | 'reentrySeenAt'>

export const DIAS_ESFRIANDO = 2

export function atencao<T extends LeadAtencao>(leads: T[], agora: number = Date.now()): Atencao<T> {
  const out: Atencao<T> = { aguardandoPrimeiroContato: [], esfriando: [], voltaram: [] }
  for (const l of leads) {
    if (l.discardReason || l.closedAt) continue

    if (l.slaDueAt && !l.firstContactAt) out.aguardandoPrimeiroContato.push(l)

    if (l.funnelStage === 'atendimento' || l.funnelStage === 'visita' || l.funnelStage === 'proposta') {
      const ultimo = new Date(l.lastContactAt ?? l.stageChangedAt ?? l.createdAt).getTime()
      if (agora - ultimo >= DIAS_ESFRIANDO * DIA_MS) out.esfriando.push(l)
    }

    if (l.reentryAt && (!l.reentrySeenAt || new Date(l.reentrySeenAt) < new Date(l.reentryAt))) {
      out.voltaram.push(l)
    }
  }
  // Prazo mais próximo (ou vencido há mais tempo) primeiro.
  out.aguardandoPrimeiroContato.sort((a, b) => new Date(a.slaDueAt!).getTime() - new Date(b.slaDueAt!).getTime())
  const ref = (l: T) => new Date(l.lastContactAt ?? l.stageChangedAt ?? l.createdAt).getTime()
  out.esfriando.sort((a, b) => ref(a) - ref(b))
  return out
}

export function prazoVencido(slaDueAt: string, agora: number = Date.now()): boolean {
  return new Date(slaDueAt).getTime() < agora
}

/** "prazo venceu há 12 min" · "prazo até 18:30" · "prazo até seg 09:10". */
export function textoDoPrazo(slaDueAt: string, agora: number = Date.now()): string {
  if (prazoVencido(slaDueAt, agora)) return `prazo venceu ${haQuanto(slaDueAt, agora)}`
  const d = new Date(slaDueAt)
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (localDateStr(d) === localDateStr(new Date(agora))) return `prazo até ${hora}`
  const dia = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
  return `prazo até ${dia} ${hora}`
}

// ── Atividade do corretor ─────────────────────────────────────────────────────

const ORIGEM: Record<string, string> = {
  felicita: 'Felicità', meta_ads: 'Meta Ads', portal: 'Portal', offline: 'Offline', campanha: 'Campanha',
  indicacao: 'Indicação', prospeccao_ligacao: 'Ligação ativa', site: 'Site',
}

const SUJEITO = '\u0001'

/**
 * A frase do evento sem o nome do corretor — no quadro dele o sujeito já está
 * no título, e repetir "Dionata…" em toda linha é ruído. Usa o mesmo
 * renderizador do Pulse (`describe`), então as duas telas falam igual.
 */
export function fraseDoCorretor(ev: PulseEvent): PulseEventView {
  if (ev.kind === 'lead_novo') {
    const v = describe(ev)
    return {
      ...v,
      texto: `Recebeu o lead ${ev.leadNome ?? 'novo'}${ev.produto ? ` · ${ev.produto}` : ''}`,
      detalhe: ORIGEM[ev.origem ?? ''] ?? ev.origem,
    }
  }
  const v = describe(ev, SUJEITO)
  if (!v.texto.startsWith(`${SUJEITO} `)) return v
  const resto = v.texto.slice(2)
  return { ...v, texto: resto.charAt(0).toUpperCase() + resto.slice(1) }
}

/** "agora", "há 4 min", "há 2 h", "ontem", "há 3 dias". */
export function haQuanto(iso: string, agora: number = Date.now()): string {
  const min = Math.floor((agora - new Date(iso).getTime()) / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.floor(h / 24)
  return d === 1 ? 'ontem' : `há ${d} dias`
}

/** Considera "em atividade" quem agiu nos últimos 10 minutos. */
export const JANELA_ATIVO_MS = 10 * 60 * 1000

export function estaAtivo(ultimaAtividadeAt: string | null | undefined, agora: number = Date.now()): boolean {
  return !!ultimaAtividadeAt && agora - new Date(ultimaAtividadeAt).getTime() < JANELA_ATIVO_MS
}

/** Rótulo curto do eixo: 08/11; o último ponto vira "Hoje". */
export function rotuloDia(data: string, ehHoje: boolean): string {
  if (ehHoje) return 'Hoje'
  const [, m, d] = data.split('-')
  return `${d}/${m}`
}
