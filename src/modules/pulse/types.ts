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
  // Prospecção ativa por telefone. Separado de 'interacao' de propósito:
  // atendimento é conversa com lead do funil, ligação é toque em base fria.
  // Somar os dois faria um dia de 60 discagens parecer 60 atendimentos.
  | 'ligacao'

export interface PulseEvent {
  id:         string
  /** lead de origem — cruza com PulseSnapshot.leadsInfo para nome e produto */
  leadId?:    string
  at:         string
  kind:       PulseEventKind
  brokerId?:  string
  leadNome?:  string
  /** empreendimento/imóvel vinculado ao lead */
  produto?:   string
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
  /** mudanças de etapa que o corretor provocou no dia */
  avancosHoje?:      number
  /** ligações de prospecção ativa registradas hoje */
  ligacoesHoje:      number
  ultimaAtividadeAt: string | null
}

export interface PulseHoje {
  leadsNovos:      number
  interacoes:      number
  visitasMarcadas: number
  mudancasEtapa:   number
  ligacoes:        number
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

/** Meta do mês e seca de vendas — RPC pulse_vgl, separada do snapshot. */
export interface PulseVgl {
  metaMes:            number
  realizadoMes:       number
  vendasMes:          number
  ultimaVenda:        string | null
  /** null quando nunca houve venda */
  diasSemVenda:       number | null
  diasUteisRestantes: number
  faltaParaMeta:      number
}

/** Balanço de um dia fechado — RPC pulse_resumo_dia, carregada sob demanda. */
/** Leituras que só fazem sentido sobre um dia inteiro e fechado. */
export interface PulseDestaques {
  /** corretor com mais atividade no dia; venda desempata */
  campeaoId:   string | null
  whatsapp:    number
  avancos:     number
  /** hora (0–23) em que o dia mais aconteceu */
  horaPico:    number | null
  horaPicoQtd: number | null
  produtoTop:  { nome: string; qtd: number } | null
  avancosPorEtapa: Array<{ etapa: string; qtd: number }>
  ligacoesDesfecho: {
    total:        number
    /** ligações em que houve conversa — separa esforço de resultado */
    falou:        number
    interessados: number
    retornos:     number
    semResposta:  number
  }
}

export interface PulseResumoDia {
  data:       string
  hoje:       PulseHoje
  destaques:  PulseDestaques
  corretores: PulseBroker[]
}

export interface PulseSnapshot {
  agora:      string
  hoje:       PulseHoje
  funil:      Array<{ stage: LeadFunnelStage; count: number }>
  negociacao: { valor: number }
  gargalos:   PulseGargalos
  corretores: PulseBroker[]
  timeline:   PulseEvent[]
  /**
   * Mapa id -> {nome, produto} dos leads ativos.
   *
   * O INSERT de lead_interactions no realtime só carrega lead_id. Este mapa
   * viaja no snapshot e se mantém sozinho — o INSERT em `leads` já traz nome e
   * produto —, então o feed mostra "com Fulano · Garden Park" sem gastar uma
   * consulta por evento.
   */
  leadsInfo:  Record<string, { nome: string; produto: string | null }>
  tempos:     PulseTempos
  porHora:    number[]
}

/** Estado da conexão — a faixa de status no topo da tela lê daqui. */
export type PulseConnection = 'loading' | 'live' | 'reconnecting' | 'stale' | 'error'
