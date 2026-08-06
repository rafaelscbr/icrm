/**
 * O discador.
 *
 * Uma máquina de estados pequena e explícita: puxa um lead, registra a ligação
 * no clique, registra o desfecho, puxa o próximo. Nenhuma decisão de fila mora
 * aqui — quem escolhe "o próximo" é o banco (next_call_lead), com SKIP LOCKED,
 * porque dois corretores clicando no mesmo segundo precisam receber leads
 * DIFERENTES.
 *
 * Nenhuma atualização otimista: se o banco falhar, a tela diz que falhou.
 */

import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { getCurrentUserId } from '../lib/auth'
import { abrirWhatsApp } from '../lib/formatters'
import type { CallQueueLead, CallOutcome, CallQueueStatus, CallLogEntry } from '../types'

/** Contadores do corretor logado — alimentam a meta de 10 ligações/dia. */
export interface CallCounters {
  hoje:   number
  semana: number
  mes:    number
  /** ligações de hoje sem desfecho registrado */
  semDesfechoHoje: number
}

const ZERO: CallCounters = { hoje: 0, semana: 0, mes: 0, semDesfechoHoje: 0 }

function inicioDoDia(): string {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString()
}
/** Semana = Domingo → Sábado, convenção da casa. */
function inicioDaSemana(): string {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); return d.toISOString()
}
function inicioDoMes(): string {
  const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
}

interface CallQueueState {
  /** lead reservado agora para este corretor */
  atual:      CallQueueLead | null
  /** id do call_log da tentativa em andamento — null enquanto não discou */
  logAtual:   string | null
  carregando: boolean
  /** fila sem ninguém elegível neste instante (todos em espera ou encerrados) */
  filaVazia:  boolean
  erro:       string | null
  contadores: CallCounters

  puxarProximo: (campaignId: string) => Promise<void>
  /** Registra a ligação E abre o WhatsApp. O clique é o que conta. */
  ligar:        () => Promise<void>
  registrar:    (outcome: CallOutcome, notes?: string, callbackAt?: string) => Promise<CallQueueStatus | null>
  pular:        () => Promise<void>
  /**
   * Transfere para o funil. `queueId` permite transferir um lead que NÃO está
   * na mão do corretor — o caso do quadro, onde quem ficou em "demonstrou
   * interesse" espera passagem de bastão. Sem isso, marcar interesse e sair da
   * tela deixaria o lead preso: ele não volta pela fila (de propósito) e não
   * teria outra porta de saída.
   */
  transferir:   (opts?: { queueId?: string; ticket?: number; notes?: string; productName?: string }) => Promise<string>
  limpar:       () => void
  carregarContadores: () => Promise<void>
  /**
   * Contagem avulsa, sem tocar no estado do discador — para a tela de Metas,
   * que precisa contar por corretor arbitrário (visão do admin) e não só do
   * usuário logado. brokerId null = todos os corretores.
   */
  contarLigacoes: (brokerId: string | null) => Promise<Omit<CallCounters, 'semDesfechoHoje'>>
}

export const useCallQueueStore = create<CallQueueState>((set, get) => ({
  atual:      null,
  logAtual:   null,
  carregando: false,
  filaVazia:  false,
  erro:       null,
  contadores: ZERO,

  limpar: () => set({ atual: null, logAtual: null, filaVazia: false, erro: null }),

  puxarProximo: async (campaignId) => {
    set({ carregando: true, erro: null })
    try {
      const { data, error } = await supabase.rpc('next_call_lead', { p_campaign_id: campaignId })
      if (error) throw error

      if (!data) {
        set({ atual: null, logAtual: null, filaVazia: true, carregando: false })
        return
      }
      set({
        atual:      data as CallQueueLead,
        logAtual:   null,
        filaVazia:  false,
        carregando: false,
      })
    } catch (err) {
      set({
        carregando: false,
        erro: err instanceof Error ? err.message : 'Falha ao buscar o próximo lead',
      })
      throw err
    }
  },

  // Não existe URL que inicie chamada de WhatsApp — o que dá para fazer é
  // abrir a conversa no APP, já pronta, e o corretor tocar no telefone.
  // Registrar no clique é decisão de negócio: quem abriu e não ligou responde
  // por isso.
  //
  // A ordem importa: grava PRIMEIRO, abre depois. Se o banco falhar, a ligação
  // não acontece e o corretor vê o erro — em vez de ligar sem registro e a meta
  // do dia mentir.
  ligar: async () => {
    const { atual } = get()
    if (!atual) return

    const { data, error } = await supabase.rpc('register_call_attempt', { p_queue_id: atual.id })
    if (error) {
      set({ erro: error.message })
      throw error
    }

    const { logId, attempt } = data as { logId: string; attempt: number }
    // A ligação entra no histórico local na hora. Sem isto o modal de
    // transferência diria "0 ligações vão junto" logo depois de o corretor ter
    // ligado — e o histórico que viaja para o funil é o argumento inteiro dele.
    const agora: CallLogEntry = {
      id: logId, calledAt: new Date().toISOString(), outcome: 'discou', attempt,
    }
    set(s => ({
      logAtual: logId,
      erro:     null,
      atual:    s.atual
        ? { ...s.atual, attemptCount: attempt, status: 'tentativa',
            historico: [agora, ...s.atual.historico] }
        : null,
      contadores: { ...s.contadores,
        hoje:   s.contadores.hoje + 1,
        semana: s.contadores.semana + 1,
        mes:    s.contadores.mes + 1,
        semDesfechoHoje: s.contadores.semDesfechoHoje + 1,
      },
    }))

    abrirWhatsApp(atual.phone)
  },

  registrar: async (outcome, notes, callbackAt) => {
    const { logAtual } = get()
    if (!logAtual) return null

    const { data, error } = await supabase.rpc('register_call_outcome', {
      p_log_id:      logAtual,
      p_outcome:     outcome,
      p_notes:       notes ?? null,
      p_callback_at: callbackAt ?? null,
    })
    if (error) {
      set({ erro: error.message })
      throw error
    }

    const resultado = data as { status: CallQueueStatus | null }
    set(s => ({
      logAtual: null,
      erro:     null,
      atual:    s.atual
        ? {
            ...s.atual,
            status: resultado.status ?? s.atual.status,
            historico: s.atual.historico.map(h =>
              h.id === logAtual ? { ...h, outcome, notes: notes ?? h.notes } : h),
          }
        : null,
      contadores: { ...s.contadores, semDesfechoHoje: Math.max(0, s.contadores.semDesfechoHoje - 1) },
    }))
    return resultado.status
  },

  // Pular não é desfecho: não gera log, não conta ligação, só devolve o lead
  // para a fila. Ele volta depois — a ordenação por último toque cuida disso.
  pular: async () => {
    const { atual } = get()
    if (!atual) return
    const { error } = await supabase.rpc('release_call_claim', { p_queue_id: atual.id })
    if (error) throw error
    set({ atual: null, logAtual: null })
  },

  transferir: async (opts = {}) => {
    const { atual } = get()
    const queueId = opts.queueId ?? atual?.id
    if (!queueId) throw new Error('Nenhum lead selecionado')

    const { data, error } = await supabase.rpc('transfer_call_lead_to_funnel', {
      p_queue_id:      queueId,
      p_ticket:        opts.ticket ?? null,
      p_notes:         opts.notes ?? null,
      p_property_name: opts.productName ?? null,
    })
    if (error) throw error

    // Só limpa a mão do corretor se foi o lead dele que saiu.
    if (atual?.id === queueId) set({ atual: null, logAtual: null })
    return (data as { leadId: string }).leadId
  },

  /**
   * Tentativas que contam como esforço.
   *
   * `conta_meta` é coluna gerada no banco (migração 072): falsa quando a
   * ligação não chegou a existir — número inválido, sem WhatsApp, telefone
   * desligado. A regra mora lá porque a mesma contagem acontece em cinco
   * lugares; repetir o critério em TypeScript garantiria divergência na
   * primeira alteração.
   */
  contarLigacoes: async (brokerId) => {
    const base = () => {
      const q = supabase.from('call_logs').select('id', { count: 'exact', head: true })
        .eq('conta_meta', true)
      return brokerId ? q.eq('broker_id', brokerId) : q
    }
    const [dia, semana, mes] = await Promise.all([
      base().gte('called_at', inicioDoDia()),
      base().gte('called_at', inicioDaSemana()),
      base().gte('called_at', inicioDoMes()),
    ])
    return { hoje: dia.count ?? 0, semana: semana.count ?? 0, mes: mes.count ?? 0 }
  },

  carregarContadores: async () => {
    const brokerId = getCurrentUserId()
    if (!brokerId) return

    // Os três primeiros são a meta do corretor — só tentativa que conta.
    // O quarto é o oposto: quem tentou e não disse o que houve. Esse tem de
    // aparecer justamente porque não conta em lugar nenhum.
    const [dia, semana, mes, semDesfecho] = await Promise.all([
      supabase.from('call_logs').select('id', { count: 'exact', head: true })
        .eq('broker_id', brokerId).eq('conta_meta', true).gte('called_at', inicioDoDia()),
      supabase.from('call_logs').select('id', { count: 'exact', head: true })
        .eq('broker_id', brokerId).eq('conta_meta', true).gte('called_at', inicioDaSemana()),
      supabase.from('call_logs').select('id', { count: 'exact', head: true })
        .eq('broker_id', brokerId).eq('conta_meta', true).gte('called_at', inicioDoMes()),
      supabase.from('call_logs').select('id', { count: 'exact', head: true })
        .eq('broker_id', brokerId).eq('outcome', 'discou').gte('called_at', inicioDoDia()),
    ])

    set({
      contadores: {
        hoje:            dia.count    ?? 0,
        semana:          semana.count ?? 0,
        mes:             mes.count    ?? 0,
        semDesfechoHoje: semDesfecho.count ?? 0,
      },
    })
  },
}))
