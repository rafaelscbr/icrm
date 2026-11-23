import { create } from 'zustand'
import { supabase } from '../../lib/supabase'
import { localDateStr } from '../../lib/formatters'
import type {
  PulseSnapshot, PulseEvent, PulseBroker, PulseHoje, PulseGargalos, PulseConnection, PulseTempos,
  PulseVgl, PulseSala, PulseAtribuicao,
} from './types'
import { isEventoRuido } from './pulseEvents'
import { useAuthStore } from '../../store/useAuthStore'
import { somarDias } from '../leads/conversao'
import type { RelatorioConversao } from '../leads/conversao'
import { useLeadPauseStore } from '../../store/useLeadPauseStore'
import { cartaoDaLinha, contato, entrar, mover, tirar, trocarDono } from './kanbanDaSala'
import type { CartaoSala } from './kanbanDaSala'

// ─── Orçamento de recursos ────────────────────────────────────────────────────
//
// Esta tela roda 12h/dia num iPad. Todo número aqui existe para que ela nunca
// vire um problema de custo nem de memória:
//
//   • FEED_MAX / RECENT_MAX  → arrays com teto fixo. O consumo de memória de
//     uma sessão de 12h é o mesmo de uma sessão de 5 minutos.
//   • RESNAPSHOT_COOLDOWN_MS → a RPC só é refeita numa reconexão se a última
//     tiver mais de 10 min. Sem isso, um socket instável viraria polling.
//
// PROIBIDO neste arquivo: qualquer setInterval que toque a rede, qualquer
// fetchAll, qualquer leitura da tabela `properties`.
// O feed cobre o DIA INTEIRO, de 00:00 até agora — não as últimas horas.
// Medido em 14 dias: 6 a 74 eventos/dia. 300 dá 4x de folga sobre o pior dia
// observado e mantém o payload do snapshot em ~60 kB. O agrupamento de
// disparos consecutivos reduz ainda mais as linhas efetivamente renderizadas.
const FEED_MAX               = 300
const RECENT_MAX             = 400
const JANELA_CLIMA_MS        = 30 * 60 * 1000
const RESNAPSHOT_COOLDOWN_MS = 10 * 60 * 1000
const RECONNECT_DELAY_MS     = 4000
/** A conversão do funil olha a safra dos últimos 90 dias: dos leads que chegaram, até onde foram. */
export const JANELA_CONVERSAO_DIAS = 90

/** Taxa padrão de comissão do sistema — espelha o default de concludeSale. */
const TAXA_COMISSAO = 0.05

const HOJE_ZERO: PulseHoje = {
  leadsNovos: 0, interacoes: 0, visitasMarcadas: 0, mudancasEtapa: 0, ligacoes: 0,
  vendasQtd: 0, vendasValor: 0, vendasComissao: 0,
}

const GARGALOS_ZERO: PulseGargalos = {
  semAtendimentoHoje: 0, aguardando48h: 0, slaEstourado: 0, tarefasAtrasadas: 0,
}

const TEMPOS_ZERO: PulseTempos = {
  primeiroContato:  { mediaMin: 0, medianaMin: 0, amostra: 0, pctDentroSla: 0, slaMin: null },
  segundaTentativa: { mediaMin: 0, medianaMin: 0, amostra: 0 },
}

interface PulseStore {
  connection:        PulseConnection
  erro:              string | null
  /** data (YYYY-MM-DD) a que os contadores se referem — base da virada do dia */
  dataReferencia:    string | null
  /** momento do último snapshot bem-sucedido */
  ultimoSnapshotAt:  number | null
  /** desde quando o socket está fora do ar (null = conectado) */
  desconectadoDesde: number | null

  hoje:            PulseHoje
  funil:           Record<string, number>
  negociacaoValor: number
  gargalos:        PulseGargalos
  /** janela móvel de 30 dias — só muda a cada snapshot, não a cada evento */
  tempos:          PulseTempos
  /** meta do mês e dias sem venda (RPC própria, ver migração 058) */
  vgl:             PulseVgl | null
  /** venda recém-chegada que dispara a comemoração; limpa sozinha */
  celebracao:      PulseEvent | null
  encerrarCelebracao: () => void
  corretores:      PulseBroker[]
  brokerNames:     Record<string, string>
  /** id -> {nome, produto} dos leads; alimentado pelo snapshot e por leads novos */
  leadsInfo:       Record<string, { nome: string; produto: string | null }>
  feed:            PulseEvent[]
  porHora:         number[]
  /**
   * O que veio do Dashboard de Leads (migração 102): leads por dia, quem espera
   * o 1º contato e a trilha de distribuição. null antes da 1ª leitura.
   */
  sala:            PulseSala | null
  /** a leitura da sala falhou — o resto do painel continua valendo */
  salaErro:        string | null
  /**
   * Conversão da imobiliária: dos leads que chegaram nos últimos 90 dias, até
   * onde foram (lead_conversion_report, modo safra — a mesma conta da aba
   * Conversão). Lida com o snapshot; null se falhou.
   */
  conversao:       RelatorioConversao | null
  /** timestamps dos últimos eventos — só para o cálculo do clima */
  recent:          number[]
  /**
   * O Kanban da imobiliária inteira (segunda tela, kanbanDaSala.ts): os leads
   * em aberto + os vendidos do mês. Lido com o snapshot; depois anda só com os
   * eventos do canal. null antes da 1ª leitura.
   */
  kanban:          CartaoSala[] | null
  kanbanErro:      string | null
  /** % de comissão de cada produto da carteira (developments.commission_pct) */
  pctProduto:      Record<string, number>

  bootstrap: (motivo: 'inicial' | 'virada_dia' | 'reconexao') => Promise<void>
  subscribe: () => () => void
  /** poda a janela do clima; JS puro, chamado pelo tick de 30s da tela */
  podar:     () => void
  comissaoPrevista: () => number
}

// ─── Normalização do payload da RPC ───────────────────────────────────────────

function funilToMap(funil: PulseSnapshot['funil']): Record<string, number> {
  const map: Record<string, number> = {}
  funil.forEach(f => { map[f.stage] = f.count })
  return map
}

const ETAPAS_DESCARTE: Record<string, string> = {
  lead: 'lead', leads: 'lead', followup: 'followup', atendimento: 'atendimento',
  visita: 'visita', proposta: 'proposta',
}

/** "Descartado em Followup — motivo" → 'followup'. Mesma leitura da migração 098. */
export function etapaDoDescarte(descricao: string | undefined): string | null {
  const m = descricao?.match(/^Descartado em (.+?) —/)
  return m ? ETAPAS_DESCARTE[m[1].trim().toLowerCase()] ?? null : null
}

/** Bucket horário local do evento — mesma base do gráfico do dia. */
function horaDe(iso: string): number {
  return new Date(iso).getHours()
}

export const usePulseStore = create<PulseStore>((set, get) => ({
  connection:        'loading',
  erro:              null,
  dataReferencia:    null,
  ultimoSnapshotAt:  null,
  desconectadoDesde: null,

  hoje:            HOJE_ZERO,
  funil:           {},
  negociacaoValor: 0,
  gargalos:        GARGALOS_ZERO,
  tempos:          TEMPOS_ZERO,
  vgl:             null,
  celebracao:      null,
  corretores:      [],
  brokerNames:     {},
  leadsInfo:       {},
  feed:            [],
  porHora:         Array(24).fill(0),
  sala:            null,
  salaErro:        null,
  conversao:       null,
  recent:          [],
  kanban:          null,
  kanbanErro:      null,
  pctProduto:      {},

  comissaoPrevista: () => get().negociacaoValor * TAXA_COMISSAO,

  encerrarCelebracao: () => set({ celebracao: null }),

  // ── Bootstrap: a ÚNICA leitura que esta tela faz no banco ──────────────────
  // Uma chamada, agregação inteira no servidor, retorno de poucos KB. Acontece
  // na carga da página, na virada do dia e numa reconexão fria. Mais nada.
  bootstrap: async (motivo) => {
    const { ultimoSnapshotAt } = get()

    if (motivo === 'reconexao' && ultimoSnapshotAt
        && Date.now() - ultimoSnapshotAt < RESNAPSHOT_COOLDOWN_MS) {
      // Reconexão recente — os contadores em memória ainda valem. Não gasta RPC.
      return
    }

    try {
      // As três RPCs em paralelo — juntas somam ~40 kB, uma vez por sessão.
      const hoje = localDateStr()
      const ini = new Date(); ini.setDate(1); ini.setHours(0, 0, 0, 0)
      const [snapRes, vglRes, salaRes, convRes, kanbanRes, pctRes] = await Promise.all([
        supabase.rpc('pulse_snapshot'),
        supabase.rpc('pulse_vgl'),
        supabase.rpc('pulse_sala'),
        supabase.rpc('lead_conversion_report', {
          p_broker_id: null, p_start: somarDias(hoje, -(JANELA_CONVERSAO_DIAS - 1)), p_end: hoje,
          p_mode: 'safra', p_bucket: 'month',
        }),
        // Segunda tela: só as colunas que o cartão mostra, só o que está no
        // quadro (em aberto + vendido no mês). ~150 linhas, uma vez.
        supabase.from('leads')
          .select('id,name,funnel_stage,broker_id,average_ticket,property_name,development_id,stage_changed_at,created_at,origin,last_contact_at,followup_step')
          .is('discard_reason', null)
          .or(`closed_at.is.null,closed_at.gte.${ini.toISOString()}`),
        supabase.from('developments').select('id,commission_pct'),
      ])
      if (kanbanRes.error) console.error('[pulse] kanban:', kanbanRes.error)
      if (salaRes.error) console.error('[pulse] sala:', salaRes.error)
      if (convRes.error) console.error('[pulse] conversão:', convRes.error)
      const { data, error } = snapRes
      if (error) throw error

      const snap = data as PulseSnapshot
      const agora = Date.now()

      // O nome de cada corretor sai do próprio snapshot — nenhuma consulta extra.
      const brokerNames: Record<string, string> = {}
      snap.corretores.forEach(c => { brokerNames[c.brokerId] = c.nome })

      const leadsInfo = snap.leadsInfo ?? {}
      const timeline = (snap.timeline ?? [])
        .filter(ev => !isEventoRuido(ev))
        .map(ev => {
          const info = ev.leadId ? leadsInfo[ev.leadId] : undefined
          return {
            ...ev,
            leadNome: ev.leadNome ?? info?.nome,
            produto:  ev.produto  ?? info?.produto ?? undefined,
          }
        })
      const corte = agora - JANELA_CLIMA_MS

      set({
        connection:        'live',
        erro:              null,
        dataReferencia:    localDateStr(),
        ultimoSnapshotAt:  agora,
        desconectadoDesde: null,
        hoje:              snap.hoje,
        funil:             funilToMap(snap.funil ?? []),
        negociacaoValor:   snap.negociacao?.valor ?? 0,
        gargalos:          snap.gargalos ?? GARGALOS_ZERO,
        tempos:            snap.tempos ?? TEMPOS_ZERO,
        // Falha só do VGL não derruba o painel — o bloco some, o resto fica.
        vgl:               vglRes.error ? get().vgl : (vglRes.data as PulseVgl),
        // Falha só da sala: os blocos que dependem dela dizem que falharam; o
        // resto do painel fica. Nunca mostra a sala de ontem como se fosse de hoje.
        sala:              salaRes.error ? null : (salaRes.data as PulseSala),
        salaErro:          salaRes.error ? salaRes.error.message : null,
        conversao:         convRes.error ? null : (convRes.data as RelatorioConversao),
        // Falha só do Kanban: a segunda tela diz que falhou; nunca mostra o
        // quadro de antes como se fosse o de agora.
        kanban:            kanbanRes.error ? null
                             : (kanbanRes.data ?? []).map(r => cartaoDaLinha(r as Record<string, unknown>)).filter((c): c is CartaoSala => !!c),
        kanbanErro:        kanbanRes.error ? kanbanRes.error.message : null,
        pctProduto:        pctRes.error ? get().pctProduto
                             : Object.fromEntries((pctRes.data ?? []).map(d => [d.id as string, Number(d.commission_pct ?? 5)])),
        corretores:        snap.corretores ?? [],
        brokerNames,
        leadsInfo,
        feed:              timeline.slice(0, FEED_MAX),
        porHora:           (snap.porHora ?? []).length === 24 ? snap.porHora : Array(24).fill(0),
        recent:            timeline
                             .map(ev => new Date(ev.at).getTime())
                             .filter(t => t >= corte)
                             .slice(0, RECENT_MAX),
      })
    } catch (err) {
      // Banco é a fonte de verdade: se ele falhou, a tela DIZ que falhou.
      // Nunca exibir número velho como se fosse ao vivo.
      console.error('[pulse] bootstrap:', err)
      set({
        connection: 'error',
        erro: err instanceof Error ? err.message : 'Falha ao carregar o snapshot',
      })
    }
  },

  podar: () => {
    const corte = Date.now() - JANELA_CLIMA_MS
    set(s => ({ recent: s.recent.filter(t => t >= corte) }))
  },

  // ── Canal único, somente INSERT ────────────────────────────────────────────
  //
  // Só INSERT, de propósito, por dois motivos:
  //
  //  1. Sem REPLICA IDENTITY FULL, o payload de UPDATE traz apenas a PK em
  //     `old` — é impossível saber QUAL coluna mudou. Toda mudança que importa
  //     (etapa, descarte, 1º contato, venda) já grava uma linha nova em
  //     lead_interactions ou sales, então o INSERT carrega a informação inteira.
  //
  //  2. Binding registrado é binding cobrado: não assinar UPDATE significa que
  //     o servidor sequer envia essas mensagens para este canal.
  subscribe: () => {
    const channelName = 'pulse-realtime'
    if (supabase.getChannels().some(c => c.topic === `realtime:${channelName}`)) return () => {}

    let disposed = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let channel: ReturnType<typeof buildChannel> | null = null

    /** Muda a sala só se ela já foi lida — antes disso o snapshot vai trazê-la inteira. */
    const mudarSala = (fn: (sala: PulseSala) => PulseSala) =>
      set(s => (s.sala ? { sala: fn(s.sala) } : s))

    /** Mexe no Kanban só se ele já foi lido — antes disso a leitura traz tudo. */
    const mudarKanban = (fn: (k: CartaoSala[]) => CartaoSala[]) =>
      set(s => {
        if (!s.kanban) return s
        const k = fn(s.kanban)
        return k === s.kanban ? s : { kanban: k }
      })

    const push = (ev: PulseEvent) => {
      if (isEventoRuido(ev)) return

      // Virada do dia: o primeiro evento já pertencente a amanhã dispara o
      // re-snapshot na hora, em vez de esperar o tick de 30s do useKiosk. O
      // próprio snapshot traz o evento de volta, então descartá-lo aqui não
      // perde nada — e impede que o dia novo comece misturado com o anterior.
      const { dataReferencia } = get()
      const diaDoEvento = localDateStr(new Date(ev.at))
      if (dataReferencia && diaDoEvento > dataReferencia) {
        get().bootstrap('virada_dia')
        return
      }
      // Evento atrasado do dia anterior não entra no feed de hoje.
      if (dataReferencia && diaDoEvento < dataReferencia) return

      set(s => {
        if (s.feed.some(e => e.id === ev.id)) return s   // snapshot pode ter trazido

        const hora = horaDe(ev.at)
        const porHora = [...s.porHora]
        if (hora >= 0 && hora < 24) porHora[hora] += 1

        const hoje = { ...s.hoje }
        const funil = { ...s.funil }
        // Venda é o único evento que interrompe a tela — ver SaleCelebration.
        let celebrar: PulseEvent | null = null

        switch (ev.kind) {
          case 'lead_novo':
            hoje.leadsNovos += 1
            funil.lead = (funil.lead ?? 0) + 1
            break
          case 'interacao': {
            hoje.interacoes += 1
            // Descarte tira o lead do funil. A etapa de onde ele saiu vem na
            // descrição gravada pelo sistema ("Descartado em Followup — motivo").
            const etapa = ev.subTipo === 'discard' ? etapaDoDescarte(ev.detalhe) : null
            if (etapa) funil[etapa] = Math.max(0, (funil[etapa] ?? 0) - 1)
            break
          }
          case 'etapa':
            hoje.mudancasEtapa += 1
            if (ev.fromStage) funil[ev.fromStage] = Math.max(0, (funil[ev.fromStage] ?? 0) - 1)
            if (ev.toStage)   funil[ev.toStage]   = (funil[ev.toStage] ?? 0) + 1
            break
          case 'venda':
            celebrar = ev
            hoje.vendasQtd     += 1
            hoje.vendasValor   += ev.valor ?? 0
            hoje.vendasComissao += (ev.valor ?? 0) * TAXA_COMISSAO
            break
          case 'visita':
            hoje.visitasMarcadas += 1
            break
          case 'ligacao':
            hoje.ligacoes += 1
            break
          case 'campanha':
            break
        }

        // Radar: contadores e "última atividade" do corretor que gerou o evento
        const corretores = ev.brokerId
          ? s.corretores.map(c => c.brokerId !== ev.brokerId ? c : {
              ...c,
              interacoesHoje: c.interacoesHoje + (ev.kind === 'interacao' ? 1 : 0),
              leadsHoje:      c.leadsHoje      + (ev.kind === 'lead_novo' ? 1 : 0),
              visitasHoje:    c.visitasHoje    + (ev.kind === 'visita'    ? 1 : 0),
              vendasHoje:     c.vendasHoje     + (ev.kind === 'venda'     ? 1 : 0),
              ligacoesHoje:   c.ligacoesHoje   + (ev.kind === 'ligacao'   ? 1 : 0),
              avancosHoje:    (c.avancosHoje ?? 0) + (ev.kind === 'etapa'   ? 1 : 0),
              ultimaAtividadeAt: ev.at,
            })
          : s.corretores

        return {
          celebracao: celebrar ?? s.celebracao,
          feed:    [ev, ...s.feed].slice(0, FEED_MAX),
          recent:  [Date.now(), ...s.recent].slice(0, RECENT_MAX),
          porHora, hoje, funil, corretores,
        }
      })
    }

    const buildChannel = () => supabase
      .channel(channelName)

      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leads' }, p => {
        const r = p.new as Record<string, unknown>
        const id      = r.id as string
        const nome    = r.name as string
        // property_name já vem preenchido nos leads do Meta (vem do produto do
        // formulário). Alimenta o mapa para que as interações seguintes deste
        // lead exibam o produto sem nenhuma consulta.
        const produto = (r.property_name as string | null) ?? null
        set(s => ({ leadsInfo: { ...s.leadsInfo, [id]: { nome, produto } } }))
        const cartao = !r.discard_reason && !r.closed_at ? cartaoDaLinha(r) : null
        if (cartao) mudarKanban(k => entrar(k, cartao))
        mudarSala(sala => {
          const slaDueAt = (r.sla_due_at as string | null) ?? null
          const brokerId = (r.broker_id as string | null) ?? null
          const ultimo = sala.leadsPorDia[sala.leadsPorDia.length - 1]
          return {
            ...sala,
            leadsPorDia: ultimo && ultimo.data === localDateStr(new Date(r.created_at as string))
              ? [...sala.leadsPorDia.slice(0, -1), { ...ultimo, n: ultimo.n + 1 }]
              : sala.leadsPorDia,
            esperando: slaDueAt && !sala.esperando.some(e => e.id === id)
              ? [...sala.esperando, { id, nome, brokerId, slaDueAt }]
              : sala.esperando,
            trilha: { ...sala.trilha, [id]: sala.trilha[id] ?? { firstContactAt: null, discardReason: null, closedAt: null } },
          }
        })
        push({
          id,
          leadId:    id,
          at:        r.created_at as string,
          kind:      'lead_novo',
          brokerId:  (r.broker_id as string | null) ?? undefined,
          leadNome:  nome,
          produto:   produto ?? undefined,
          origem:    (r.origin as string | null) ?? undefined,
          valor:     (r.average_ticket as number | null) ?? undefined,
        })
      })

      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lead_interactions' }, p => {
        const r = p.new as Record<string, unknown>
        // Interação sem broker_id foi gerada pelo SISTEMA (o webhook do Meta
        // grava uma nota em todo lead que entra), não por uma pessoa. O lead já
        // aparece no feed pelo INSERT em `leads`; contá-la de novo duplicaria a
        // linha e inflaria o KPI de Atendimentos. Mesmo filtro da RPC 052.
        if (!r.broker_id) return
        const tipo   = r.type as string
        const leadId = r.lead_id as string
        // 1º contato (o banco conta só WhatsApp — trigger handle_first_contact) e
        // descarte tiram o lead da espera e fecham a passagem dele na trilha.
        if (tipo === 'whatsapp' || tipo === 'discard') {
          mudarSala(sala => {
            const t = sala.trilha[leadId]
            return {
              ...sala,
              esperando: sala.esperando.filter(e => e.id !== leadId),
              trilha: !t ? sala.trilha : {
                ...sala.trilha,
                [leadId]: tipo === 'whatsapp'
                  ? { ...t, firstContactAt: t.firstContactAt ?? (r.interacted_at as string) }
                  : { ...t, discardReason: t.discardReason ?? 'discard' },
              },
            }
          })
        }
        // O Kanban da segunda tela anda junto: etapa nova ou fora do quadro.
        if (tipo === 'stage_change') mudarKanban(k => mover(k, leadId, (r.to_stage as string | null) ?? undefined, r.interacted_at as string))
        else if (tipo === 'discard') mudarKanban(k => tirar(k, leadId))
        else mudarKanban(k => contato(k, leadId, tipo, r.interacted_at as string))
        // Nome e produto saem do mapa em memória — zero consulta por evento.
        const info   = get().leadsInfo[leadId]
        push({
          id:        r.id as string,
          leadId,
          at:        r.interacted_at as string,
          kind:      tipo === 'stage_change' ? 'etapa' : 'interacao',
          brokerId:  (r.broker_id as string | null) ?? undefined,
          leadNome:  info?.nome,
          produto:   info?.produto ?? undefined,
          fromStage: (r.from_stage as string | null) ?? undefined,
          toStage:   (r.to_stage as string | null) ?? undefined,
          subTipo:   tipo,
          detalhe:   (r.description as string | null) ?? undefined,
        })
      })

      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sales' }, p => {
        const r = p.new as Record<string, unknown>
        push({
          id:       `sale-${r.id as string}`,
          at:       r.created_at as string,
          kind:     'venda',
          brokerId: (r.broker_id as string | null) ?? undefined,
          leadNome: (r.property_name as string | null) ?? undefined,
          valor:    (r.value as number | null) ?? undefined,
        })
      })

      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks' }, p => {
        const r = p.new as Record<string, unknown>
        if (r.category !== 'visita') return
        push({
          id:       `task-${r.id as string}`,
          at:       r.created_at as string,
          kind:     'visita',
          brokerId: ((r.assigned_to_id ?? r.broker_id) as string | null) ?? undefined,
          leadNome: r.title as string,
          detalhe:  (r.due_date as string | null) ?? undefined,
        })
      })

      // Ligações da prospecção ativa. O INSERT acontece no clique de "Ligar
      // pelo WhatsApp" e já traz contact_name — o feed não precisa consultar
      // nada por evento, igual ao resto desta tela.
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'call_logs' }, p => {
        const r = p.new as Record<string, unknown>
        push({
          id:       `call-${r.id as string}`,
          at:       r.called_at as string,
          kind:     'ligacao',
          brokerId: (r.broker_id as string | null) ?? undefined,
          leadNome: (r.contact_name as string | null) ?? undefined,
          subTipo:  (r.outcome as string | null) ?? 'discou',
        })
      })

      // O lead mudou de mão (roleta, rodízio por prazo, transferência). A linha
      // traz o novo dono e o novo prazo: atualiza quem está esperando e a trilha
      // do "no prazo" sem nenhuma consulta.
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lead_assignments' }, p => {
        const r = p.new as Record<string, unknown>
        const a: PulseAtribuicao = {
          id:           r.id as string,
          leadId:       r.lead_id as string,
          fromBrokerId: (r.from_broker_id as string | null) ?? null,
          toBrokerId:   (r.to_broker_id as string | null) ?? null,
          reason:       r.reason as string,
          slaDueAt:     (r.sla_due_at as string | null) ?? null,
          createdAt:    r.created_at as string,
        }
        mudarSala(sala => {
          if (sala.atribuicoes.some(x => x.id === a.id)) return sala
          const t = sala.trilha[a.leadId]
          const espera = sala.esperando.find(e => e.id === a.leadId)
          let esperando = sala.esperando
          if (espera) {
            esperando = a.slaDueAt
              ? sala.esperando.map(e => e.id === a.leadId ? { ...e, brokerId: a.toBrokerId, slaDueAt: a.slaDueAt! } : e)
              : sala.esperando.filter(e => e.id !== a.leadId)
          } else if (a.slaDueAt && t && !t.firstContactAt && !t.discardReason && !t.closedAt) {
            const nome = get().leadsInfo[a.leadId]?.nome ?? 'Lead'
            esperando = [...sala.esperando, { id: a.leadId, nome, brokerId: a.toBrokerId, slaDueAt: a.slaDueAt }]
          }
          return { ...sala, atribuicoes: [...sala.atribuicoes, a], esperando }
        })
        mudarKanban(k => trocarDono(k, a.leadId, a.toBrokerId))
      })

      // Um corretor pausou o recebimento: o banco avisa o admin (migração 090).
      // É a deixa para reler as pausas — uma leitura pequena, só quando muda.
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${useAuthStore.getState().user?.id ?? '00000000-0000-0000-0000-000000000000'}`,
      }, p => {
        const r = p.new as Record<string, unknown>
        if (r.type === 'lead_intake_paused') void useLeadPauseStore.getState().carregar()
      })

      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'campaign_activity_log' }, p => {
        const r = p.new as Record<string, unknown>
        push({
          id:       r.id as string,
          at:       r.created_at as string,
          kind:     'campanha',
          brokerId: (r.broker_id as string | null) ?? undefined,
          leadNome: (r.lead_name as string | null) ?? undefined,
          subTipo:  r.action_type as string,
        })
      })

    // Reconexão com backoff fixo — mesmo padrão de useLeadsStore.subscribe().
    const connect = (isReconnect: boolean) => {
      if (disposed) return
      const atual = buildChannel()
      channel = atual
      atual.subscribe(status => {
        // Só o canal em uso decide alguma coisa. `removeChannel` dispara CLOSED
        // de volta nesta mesma função; sem esta linha, a cada queda o fechamento
        // chamava a si mesmo até estourar a pilha (16/11/2026).
        if (channel !== atual) return
        if (status === 'SUBSCRIBED') {
          set({ connection: 'live', desconectadoDesde: null })
          if (isReconnect) get().bootstrap('reconexao')   // respeita o cooldown
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (disposed) return
          set(s => ({
            connection: 'reconnecting',
            desconectadoDesde: s.desconectadoDesde ?? Date.now(),
          }))
          channel = null
          void supabase.removeChannel(atual)
          if (retryTimer) clearTimeout(retryTimer)
          retryTimer = setTimeout(() => connect(true), RECONNECT_DELAY_MS)
        }
      })
    }
    connect(false)

    return () => {
      disposed = true
      if (retryTimer) clearTimeout(retryTimer)
      if (channel) supabase.removeChannel(channel)
    }
  },
}))
