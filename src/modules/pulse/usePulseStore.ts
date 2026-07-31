import { create } from 'zustand'
import { supabase } from '../../lib/supabase'
import { localDateStr } from '../../lib/formatters'
import type {
  PulseSnapshot, PulseEvent, PulseBroker, PulseHoje, PulseGargalos, PulseConnection,
} from './types'
import { isEventoRuido } from './pulseEvents'

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
const FEED_MAX               = 60
const RECENT_MAX             = 400
const JANELA_CLIMA_MS        = 30 * 60 * 1000
const RESNAPSHOT_COOLDOWN_MS = 10 * 60 * 1000
const RECONNECT_DELAY_MS     = 4000

/** Taxa padrão de comissão do sistema — espelha o default de concludeSale. */
const TAXA_COMISSAO = 0.05

const HOJE_ZERO: PulseHoje = {
  leadsNovos: 0, interacoes: 0, visitasMarcadas: 0, mudancasEtapa: 0,
  vendasQtd: 0, vendasValor: 0, vendasComissao: 0,
}

const GARGALOS_ZERO: PulseGargalos = {
  semAtendimentoHoje: 0, aguardando48h: 0, slaEstourado: 0, tarefasAtrasadas: 0,
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
  corretores:      PulseBroker[]
  brokerNames:     Record<string, string>
  feed:            PulseEvent[]
  porHora:         number[]
  /** timestamps dos últimos eventos — só para o cálculo do clima */
  recent:          number[]

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
  corretores:      [],
  brokerNames:     {},
  feed:            [],
  porHora:         Array(24).fill(0),
  recent:          [],

  comissaoPrevista: () => get().negociacaoValor * TAXA_COMISSAO,

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
      const { data, error } = await supabase.rpc('pulse_snapshot')
      if (error) throw error

      const snap = data as PulseSnapshot
      const agora = Date.now()

      // O nome de cada corretor sai do próprio snapshot — nenhuma consulta extra.
      const brokerNames: Record<string, string> = {}
      snap.corretores.forEach(c => { brokerNames[c.brokerId] = c.nome })

      const timeline = (snap.timeline ?? []).filter(ev => !isEventoRuido(ev))
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
        corretores:        snap.corretores ?? [],
        brokerNames,
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

    const push = (ev: PulseEvent) => {
      if (isEventoRuido(ev)) return

      set(s => {
        if (s.feed.some(e => e.id === ev.id)) return s   // snapshot pode ter trazido

        const hora = horaDe(ev.at)
        const porHora = [...s.porHora]
        if (hora >= 0 && hora < 24) porHora[hora] += 1

        const hoje = { ...s.hoje }
        const funil = { ...s.funil }

        switch (ev.kind) {
          case 'lead_novo':
            hoje.leadsNovos += 1
            funil.lead = (funil.lead ?? 0) + 1
            break
          case 'interacao':
            hoje.interacoes += 1
            break
          case 'etapa':
            hoje.mudancasEtapa += 1
            if (ev.fromStage) funil[ev.fromStage] = Math.max(0, (funil[ev.fromStage] ?? 0) - 1)
            if (ev.toStage)   funil[ev.toStage]   = (funil[ev.toStage] ?? 0) + 1
            break
          case 'venda':
            hoje.vendasQtd     += 1
            hoje.vendasValor   += ev.valor ?? 0
            hoje.vendasComissao += (ev.valor ?? 0) * TAXA_COMISSAO
            break
          case 'visita':
            hoje.visitasMarcadas += 1
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
              ultimaAtividadeAt: ev.at,
            })
          : s.corretores

        return {
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
        push({
          id:        r.id as string,
          at:        r.created_at as string,
          kind:      'lead_novo',
          brokerId:  (r.broker_id as string | null) ?? undefined,
          leadNome:  r.name as string,
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
        const tipo = r.type as string
        push({
          id:        r.id as string,
          at:        r.interacted_at as string,
          kind:      tipo === 'stage_change' ? 'etapa' : 'interacao',
          brokerId:  (r.broker_id as string | null) ?? undefined,
          // O INSERT de lead_interactions não traz o nome do lead (só lead_id).
          // Buscá-lo custaria uma query por evento — exatamente o que esta tela
          // não pode fazer. O feed mostra a ação; o nome vem no próximo snapshot.
          leadNome:  undefined,
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
      channel = buildChannel()
      channel.subscribe(status => {
        if (status === 'SUBSCRIBED') {
          set({ connection: 'live', desconectadoDesde: null })
          if (isReconnect) get().bootstrap('reconexao')   // respeita o cooldown
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (disposed) return
          set(s => ({
            connection: 'reconnecting',
            desconectadoDesde: s.desconectadoDesde ?? Date.now(),
          }))
          if (channel) { supabase.removeChannel(channel); channel = null }
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
