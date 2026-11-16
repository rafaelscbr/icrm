/**
 * Leads › Dashboard — monitoramento ao vivo (16/11/2026). A parte que calcula,
 * sem tela e sem rede.
 *
 * Duas perguntas que o dono faz olhando a equipe trabalhar:
 *   1. Velocidade de resposta — quem atende no prazo e quem deixa o lead vencer?
 *   2. Qualidade por origem   — qual formulário traz lead bom e qual traz curioso?
 * Mais o ritmo do dia (quando cada um produziu) e o que cada um recebeu hoje.
 *
 * De onde vêm os dados:
 *   • leads        — já em memória (`useLeadsStore`), zero rede;
 *   • atribuições  — `lead_assignments`, a trilha de quem recebeu cada lead e
 *                    por quê (roleta, transferência por prazo…).
 * As funções abaixo só cruzam essas listas — é o que os testes cobrem.
 *
 * "Para quem vai o próximo lead" saiu da tela em 16/11/2026, a pedido do
 * Rafael; a conta da roleta vive só no banco (`next_lead_broker_index`).
 */
import type { Lead, LeadFunnelStage, SlaDia } from '../../types'
import { localDateStr } from '../../lib/formatters'

// ── Tipos de entrada ──────────────────────────────────────────────────────────

/** Uma linha de `lead_assignments`: o lead passou para `toBrokerId`. */
export interface Atribuicao {
  id:           string
  leadId:       string
  fromBrokerId: string | null
  toBrokerId:   string | null
  /** round_robin · campaign_routing · returning_client · sla_recapture · manual */
  reason:       string
  /** prazo de 1º contato dado a quem recebeu; null = sem relógio */
  slaDueAt:     string | null
  createdAt:    string
}

// ── O que cada um recebeu hoje ────────────────────────────────────────────────

export interface RecebidosHoje {
  /** entregues pela roleta (geral, do formulário ou cliente que voltou) */
  daRoleta: number
  /** herdados de outro corretor que deixou o prazo vencer */
  porTransferencia: number
  /** repassados à mão pelo admin */
  manual: number
  total: number
}

/** Quantos leads cada corretor recebeu hoje, e por qual caminho. */
export function recebidosHoje(atribuicoes: Atribuicao[], agora: Date = new Date()): Map<string, RecebidosHoje> {
  const hoje = localDateStr(agora)
  const mapa = new Map<string, RecebidosHoje>()
  for (const a of atribuicoes) {
    if (!a.toBrokerId || localDateStr(new Date(a.createdAt)) !== hoje) continue
    const r = mapa.get(a.toBrokerId) ?? { daRoleta: 0, porTransferencia: 0, manual: 0, total: 0 }
    if (a.reason === 'sla_recapture') r.porTransferencia++
    else if (a.reason === 'manual') r.manual++
    else r.daRoleta++
    r.total++
    mapa.set(a.toBrokerId, r)
  }
  return mapa
}

// ── 1. Velocidade de resposta ─────────────────────────────────────────────────

/**
 * Minutos ÚTEIS entre dois instantes, pela agenda do rodízio (a mesma que o
 * banco usa para contar o prazo). Um lead que chega às 22h e é atendido às
 * 9h05 do dia seguinte esperou 5 minutos úteis, não 11 horas.
 */
export function minutosUteis(inicioMs: number, fimMs: number, agenda: SlaDia[]): number {
  if (!(fimMs > inicioMs)) return 0
  let total = 0
  const dia = new Date(inicioMs)
  dia.setHours(0, 0, 0, 0)
  for (let i = 0; i < 62 && dia.getTime() <= fimMs; i++) {
    const j = agenda[dia.getDay()]
    if (j?.on) {
      const [hi, mi] = j.start.split(':').map(Number)
      const [hf, mf] = j.end.split(':').map(Number)
      const ini = new Date(dia); ini.setHours(hi, mi, 0, 0)
      const fim = new Date(dia); fim.setHours(hf, mf, 0, 0)
      const a = Math.max(inicioMs, ini.getTime())
      const b = Math.min(fimMs, fim.getTime())
      if (b > a) total += (b - a) / 60_000
    }
    dia.setDate(dia.getDate() + 1)
  }
  return total
}

export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null
  const v = [...valores].sort((a, b) => a - b)
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

export interface LinhaVelocidade {
  brokerId: string | null
  /** passagens de lead pela mão dele com desfecho no período (ou ainda em aberto) */
  recebidos: number
  /** registrou o 1º contato */
  atendidos: number
  noPrazo: number
  foraDoPrazo: number
  /** o prazo venceu e o rodízio levou o lead para outro corretor */
  perdidos: number
  /** ainda sem 1º contato, com o prazo correndo */
  aguardando: number
  /** ainda sem 1º contato e com o prazo JÁ vencido */
  vencidos: number
  /** mediana, em minutos úteis, entre receber e fazer o 1º contato; null sem amostra */
  medianaMin: number | null
}

type LeadVelocidade = Pick<Lead, 'firstContactAt' | 'discardReason' | 'closedAt'>

const linhaVazia = (brokerId: string | null): LinhaVelocidade & { tempos: number[] } => ({
  brokerId, recebidos: 0, atendidos: 0, noPrazo: 0, foraDoPrazo: 0,
  perdidos: 0, aguardando: 0, vencidos: 0, medianaMin: null, tempos: [],
})

/**
 * O que aconteceu com cada lead entregue a cada corretor desde `desdeMs`.
 *
 * A unidade é a PASSAGEM (uma linha de `lead_assignments`), não o lead: se o
 * lead foi para o Dionata, venceu e foi para o Ryan, o Dionata "perdeu" um e o
 * Ryan "recebeu" um — cada um responde pelo prazo que teve.
 *
 * A passagem entra no período pelo dia do DESFECHO, não pelo dia em que o lead
 * foi entregue: lead que chegou domingo à noite e venceu segunda às 9h10 é uma
 * perda de segunda. Passagem ainda sem desfecho conta sempre — é de agora.
 *
 * `agenda` nula (configuração do rodízio não carregou) → sem tempo mediano; o
 * resto da linha continua valendo.
 */
export function velocidadeDeResposta(
  atribuicoes: Atribuicao[],
  leads: Map<string, LeadVelocidade>,
  desdeMs: number,
  agora: number,
  agenda: SlaDia[] | null,
): { linhas: LinhaVelocidade[]; total: LinhaVelocidade } {
  const porLead = new Map<string, Atribuicao[]>()
  for (const a of atribuicoes) {
    const l = porLead.get(a.leadId)
    if (l) l.push(a); else porLead.set(a.leadId, [a])
  }

  const porCorretor = new Map<string, LinhaVelocidade & { tempos: number[] }>()
  const total = linhaVazia(null)

  for (const [leadId, lista] of porLead) {
    lista.sort((x, y) => x.createdAt.localeCompare(y.createdAt))
    for (let i = 0; i < lista.length; i++) {
      const a = lista[i]
      const inicio = new Date(a.createdAt).getTime()
      if (!a.toBrokerId) continue

      const seguinte = lista[i + 1]
      const lead = leads.get(leadId)
      const contato = lead?.firstContactAt ? new Date(lead.firstContactAt).getTime() : null

      // Repassado à mão para outro, lead apagado, ou já tinha contato antes de
      // chegar nesta mão: não é uma passagem em que havia prazo a cumprir.
      if (seguinte && seguinte.reason !== 'sla_recapture') continue
      if (!seguinte && !lead) continue
      if (!seguinte && contato !== null && contato < inicio) continue

      // Quando a passagem se resolveu: perdeu → na transferência; atendeu → no
      // contato; lead encerrado sem contato → na entrega; em aberto → agora.
      const encerrado = !!(lead?.discardReason || lead?.closedAt)
      const desfechoEm = seguinte ? new Date(seguinte.createdAt).getTime()
        : contato !== null ? contato
        : encerrado ? inicio
        : agora
      if (desfechoEm < desdeMs) continue

      let linha = porCorretor.get(a.toBrokerId)
      if (!linha) { linha = linhaVazia(a.toBrokerId); porCorretor.set(a.toBrokerId, linha) }

      for (const r of [linha, total]) {
        r.recebidos++
        if (seguinte) { r.perdidos++; continue }
        if (contato !== null) {
          r.atendidos++
          if (a.slaDueAt) {
            if (contato <= new Date(a.slaDueAt).getTime()) r.noPrazo++
            else r.foraDoPrazo++
          }
          if (agenda) r.tempos.push(minutosUteis(inicio, contato, agenda))
          continue
        }
        // Sem contato: se o lead já saiu do funil, não há mais o que esperar.
        if (encerrado) continue
        if (a.slaDueAt && new Date(a.slaDueAt).getTime() < agora) r.vencidos++
        else r.aguardando++
      }
    }
  }

  const fechar = ({ tempos, ...r }: LinhaVelocidade & { tempos: number[] }): LinhaVelocidade =>
    ({ ...r, medianaMin: mediana(tempos) })

  return {
    linhas: [...porCorretor.values()].map(fechar)
      .sort((a, b) => b.recebidos - a.recebidos || (a.medianaMin ?? Infinity) - (b.medianaMin ?? Infinity)),
    total: fechar(total),
  }
}

/** "menos de 1 min" · "4 min" · "1h20" — a duração de uma resposta. */
export function textoDeMinutos(min: number | null): string {
  if (min === null) return '—'
  if (min < 1) return 'menos de 1 min'
  if (min < 60) return `${Math.round(min)} min`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m === 0 ? `${h} h` : `${h}h${String(m).padStart(2, '0')}`
}

// ── 2. Qualidade por origem ───────────────────────────────────────────────────

const AVANCOU = new Set<LeadFunnelStage>(['atendimento', 'visita', 'proposta', 'venda'])

export interface LinhaOrigem {
  chave: string
  origem: string
  produto: string | null
  chegaram: number
  /** em atendimento, visita, proposta ou venda — ou já vendido */
  avancaram: number
  /** ainda em Leads ou Followup */
  emAberto: number
  descartados: number
  /** o motivo de descarte mais comum desta origem */
  motivoTop: { slug: string; n: number } | null
}

type LeadOrigem = Pick<Lead, 'origin' | 'propertyName' | 'createdAt' | 'discardReason' | 'funnelStage' | 'closedAt'>

/**
 * Onde está HOJE cada lead que chegou desde `desdeMs`, agrupado por origem e
 * produto. É um retrato do estado atual (um lead que avançou e depois foi
 * descartado conta como descartado) — o histórico etapa a etapa é da aba
 * Conversão.
 */
export function qualidadePorOrigem(leads: LeadOrigem[], desdeMs: number): LinhaOrigem[] {
  const grupos = new Map<string, LinhaOrigem & { motivos: Map<string, number> }>()
  for (const l of leads) {
    if (new Date(l.createdAt).getTime() < desdeMs) continue
    const produto = l.propertyName?.trim() || null
    const chave = `${l.origin}|${produto ?? ''}`
    let g = grupos.get(chave)
    if (!g) {
      g = { chave, origem: l.origin, produto, chegaram: 0, avancaram: 0, emAberto: 0, descartados: 0, motivoTop: null, motivos: new Map() }
      grupos.set(chave, g)
    }
    g.chegaram++
    if (l.discardReason) {
      g.descartados++
      g.motivos.set(l.discardReason, (g.motivos.get(l.discardReason) ?? 0) + 1)
    } else if (l.closedAt || AVANCOU.has(l.funnelStage)) {
      g.avancaram++
    } else {
      g.emAberto++
    }
  }
  return [...grupos.values()]
    .map(({ motivos, ...g }) => {
      let top: LinhaOrigem['motivoTop'] = null
      for (const [slug, n] of motivos) if (!top || n > top.n) top = { slug, n }
      return { ...g, motivoTop: top }
    })
    .sort((a, b) => b.chegaram - a.chegaram || b.avancaram - a.avancaram)
}

// ── Ritmo do dia ──────────────────────────────────────────────────────────────

/** Quantos eventos de hoje caíram em cada hora (0–23). */
export function atividadePorHora(eventos: { at: string }[], agora: Date = new Date()): number[] {
  const hoje = localDateStr(agora)
  const horas = Array<number>(24).fill(0)
  for (const e of eventos) {
    const d = new Date(e.at)
    if (localDateStr(d) === hoje) horas[d.getHours()]++
  }
  return horas
}

/** O trecho do dia que vale mostrar: do expediente até a hora atual (ou a última com atividade). */
export function janelaDoDia(horas: number[], agora: Date = new Date()): { de: number; ate: number } {
  const comAtividade = horas.map((n, h) => (n > 0 ? h : -1)).filter(h => h >= 0)
  const de = Math.min(8, ...comAtividade)
  const ate = Math.max(19, agora.getHours(), ...comAtividade)
  return { de, ate }
}

/**
 * Onde um instante cai na linha do dia, de 0 a 100 (%), numa janela que vai
 * das `de`h até o fim da hora `ate`. Fora da janela devolve null — a marca não
 * é desenhada em vez de ser espremida na borda.
 */
export function posicaoNoDia(instante: number | string, de: number, ate: number, agora: Date = new Date()): number | null {
  const t = typeof instante === 'number' ? instante : new Date(instante).getTime()
  const inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), de).getTime()
  const fim = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), ate + 1).getTime()
  if (t < inicio || t > fim) return null
  return ((t - inicio) / (fim - inicio)) * 100
}

// ── Ontem até esta hora ───────────────────────────────────────────────────────

/** Um registro de produção de um dia: quem, o quê e quando. */
export interface EventoDoDia {
  brokerId: string | null
  tipo: 'interacao' | 'avanco' | 'visita' | 'ligacao'
  at: string
}

export interface Producao { interacoes: number; ligacoes: number; avancos: number; visitas: number }

/**
 * Quanto cada corretor tinha produzido ATÉ `limiteMs`. Serve para comparar o
 * hoje com "ontem a esta mesma hora" — comparar meio dia com o dia inteiro de
 * ontem faz qualquer um parecer mal às 11h da manhã.
 */
export function producaoAte(eventos: EventoDoDia[], limiteMs: number): Map<string, Producao> {
  const mapa = new Map<string, Producao>()
  for (const e of eventos) {
    if (!e.brokerId || new Date(e.at).getTime() > limiteMs) continue
    const p = mapa.get(e.brokerId) ?? { interacoes: 0, ligacoes: 0, avancos: 0, visitas: 0 }
    if (e.tipo === 'interacao') p.interacoes++
    else if (e.tipo === 'ligacao') p.ligacoes++
    else if (e.tipo === 'avanco') p.avancos++
    else p.visitas++
    mapa.set(e.brokerId, p)
  }
  return mapa
}

// ── Alertas por exceção ───────────────────────────────────────────────────────

/** Sem registro por este tempo, dentro do expediente, vira alerta. 90 e não 60: uma hora de almoço não é notícia. */
export const PARADO_MIN = 90
/** Prazo de 1º contato que vence dentro destes minutos entra como "vai vencer". */
export const VAI_VENCER_MIN = 5

export interface AlertaSala {
  chave: string
  gravidade: 'risco' | 'atencao'
  texto: string
  /** quando o alerta é sobre um lead: abre o card dele */
  leadId?: string
}

/** O expediente de hoje pela agenda do rodízio; null se hoje não tem ou a agenda não carregou. */
export function expedienteDeHoje(agora: Date, agenda: SlaDia[] | null): { inicio: number; fim: number } | null {
  const j = agenda?.[agora.getDay()]
  if (!j?.on) return null
  const [hi, mi] = j.start.split(':').map(Number)
  const [hf, mf] = j.end.split(':').map(Number)
  const inicio = new Date(agora); inicio.setHours(hi, mi, 0, 0)
  const fim = new Date(agora); fim.setHours(hf, mf, 0, 0)
  return { inicio: inicio.getTime(), fim: fim.getTime() }
}

/**
 * O que pede olho AGORA — e só isso. Lista vazia é o estado normal: a faixa de
 * alertas some da tela. Nada aqui é lista de trabalho (isso mora no Kanban e
 * no Followup); é o sinal de que algo saiu do esperado neste momento.
 */
export function alertasDaSala(p: {
  agora: number
  agenda: SlaDia[] | null
  corretores: { id: string; nome: string; ultimaAtividadeAt: string | null; emPausa: boolean }[]
  /** leads sem 1º contato com o relógio do prazo correndo */
  esperando: { id: string; nome: string; corretor?: string; slaDueAt: string }[]
}): AlertaSala[] {
  const out: AlertaSala[] = []
  const primeiro = (nome: string) => nome.split(' ')[0]

  // 1. Prazo de 1º contato vencido
  const vencidos = p.esperando.filter(l => new Date(l.slaDueAt).getTime() < p.agora)
  if (vencidos.length === 1) {
    const l = vencidos[0]
    const ha = textoDeMinutos((p.agora - new Date(l.slaDueAt).getTime()) / 60_000)
    out.push({
      chave: `vencido-${l.id}`, gravidade: 'risco', leadId: l.id,
      texto: `${l.nome} está com o prazo de 1º contato vencido há ${ha}${l.corretor ? ` — com ${primeiro(l.corretor)}` : ''}`,
    })
  } else if (vencidos.length > 1) {
    out.push({ chave: 'vencidos', gravidade: 'risco', texto: `${vencidos.length} leads com o prazo de 1º contato vencido` })
  }

  // 2. Prazo que vence nos próximos minutos
  for (const l of p.esperando) {
    const falta = (new Date(l.slaDueAt).getTime() - p.agora) / 60_000
    if (falta < 0 || falta > VAI_VENCER_MIN) continue
    out.push({
      chave: `vence-${l.id}`, gravidade: 'atencao', leadId: l.id,
      texto: `${l.nome} vence o prazo de 1º contato em ${textoDeMinutos(falta)}${l.corretor ? ` — com ${primeiro(l.corretor)}` : ''}`,
    })
  }

  // 3. Corretor sem registro dentro do expediente (quem está em pausa não entra)
  const exp = expedienteDeHoje(new Date(p.agora), p.agenda)
  if (exp && p.agora >= exp.inicio && p.agora <= exp.fim) {
    for (const c of p.corretores) {
      if (c.emPausa) continue
      const ultima = c.ultimaAtividadeAt ? new Date(c.ultimaAtividadeAt).getTime() : null
      const hoje = ultima !== null && ultima >= exp.inicio
      const parado = (p.agora - (hoje ? ultima! : exp.inicio)) / 60_000
      if (parado < PARADO_MIN) continue
      out.push({
        chave: `parado-${c.id}`, gravidade: 'atencao',
        texto: hoje
          ? `${primeiro(c.nome)} está sem registro há ${textoDeMinutos(parado)}`
          : `${primeiro(c.nome)} ainda não registrou nada hoje`,
      })
    }
  }

  // 4. Ninguém recebendo lead
  if (p.corretores.length > 0 && p.corretores.every(c => c.emPausa)) {
    out.push({ chave: 'todos-em-pausa', gravidade: 'atencao', texto: 'Todos os corretores estão em pausa — lead novo entra pela ordem normal da roleta' })
  }

  return out.sort((a, b) => Number(b.gravidade === 'risco') - Number(a.gravidade === 'risco'))
}

// ── Períodos ──────────────────────────────────────────────────────────────────

export type PeriodoMonitor = 'hoje' | '7' | '30'

/** Início do período, em ms: meia-noite de hoje, ou de 6 / 29 dias atrás. */
export function inicioDoPeriodo(p: PeriodoMonitor, agora: Date = new Date()): number {
  const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
  if (p === '7') d.setDate(d.getDate() - 6)
  if (p === '30') d.setDate(d.getDate() - 29)
  return d.getTime()
}
