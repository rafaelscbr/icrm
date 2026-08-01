import type { LeadFunnelStage } from '../../types'

/**
 * Formato canônico de um evento do Pulse.
 *
 * A RPC pulse_snapshot() devolve a timeline inicial NESTE formato e os handlers
 * de realtime constroem o MESMO formato — existe um único renderizador
 * (pulseEvents.describe) para as duas fontes. Se este tipo mudar, a migração
 * 052 tem que mudar junto.
 */
export type PulseEventKind =
  | 'lead_novo'   // lead entrou no funil
  | 'interacao'   // ligação, whatsapp, visita, nota, descarte…
  | 'etapa'       // mudança de etapa do funil (traz fromStage/toStage)
  | 'venda'       // registro em sales
  | 'visita'      // tarefa de visita agendada
  | 'campanha'    // disparo, parecer, transferência

export interface PulseEvent {
  id:         string
  at:         string
  kind:       PulseEventKind
  brokerId?:  string
  leadNome?:  string
  fromStage?: string
  toStage?:   string
  /** tipo da interação ('whatsapp', 'discard'…) ou action_type da campanha */
  subTipo?:   string
  origem?:    string
  valor?:     number
  detalhe?:   string
  /** nº de eventos idênticos agrupados no feed (disparos em sequência) */
  agrupados?: number
}

export interface PulseBroker {
  brokerId:          string
  nome:              string
  interacoesHoje:    number
  leadsHoje:         number
  visitasHoje:       number
  vendasHoje:        number
  ultimaAtividadeAt: string | null
}

export interface PulseHoje {
  leadsNovos:      number
  interacoes:      number
  visitasMarcadas: number
  mudancasEtapa:   number
  vendasQtd:       number
  vendasValor:     number
  vendasComissao:  number
}

export interface PulseGargalos {
  semAtendimentoHoje: number
  aguardando48h:      number
  slaEstourado:       number
  tarefasAtrasadas:   number
}

/**
 * Tempos de resposta — janela móvel de 30 dias, em MINUTOS ÚTEIS.
 *
 * Média E mediana: nesta base a média fica ~3x a mediana porque uns poucos
 * leads esquecidos por um dia inteiro puxam tudo para cima. Mostrar só a média
 * esconderia que a experiência típica é bem melhor que o número feio.
 */
export interface PulseTempos {
  primeiroContato: {
    mediaMin:     number
    medianaMin:   number
    amostra:      number
    /** % de leads atendidos dentro dos 5 minutos úteis de SLA */
    pctDentroSla: number
  }
  segundaTentativa: {
    mediaMin:   number
    medianaMin: number
    amostra:    number
  }
}

export interface PulseSnapshot {
  agora:      string
  hoje:       PulseHoje
  funil:      Array<{ stage: LeadFunnelStage; count: number }>
  negociacao: { valor: number }
  gargalos:   PulseGargalos
  corretores: PulseBroker[]
  timeline:   PulseEvent[]
  tempos:     PulseTempos
  porHora:    number[]
}

/** Estado da conexão — a faixa de status no topo da tela lê daqui. */
export type PulseConnection = 'loading' | 'live' | 'reconnecting' | 'stale' | 'error'
