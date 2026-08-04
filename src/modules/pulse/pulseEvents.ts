import {
  UserPlus, MessageCircle, Phone, MapPin, FileText, Mail, Users,
  Trash2, ArrowRight, BadgeDollarSign, CalendarCheck, Send, ClipboardCheck,
  Activity, ArrowRightLeft, PhoneCall, PhoneMissed, PhoneOff, Flame,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { STAGE_THEME } from '../../lib/stageTheme'
import type { LeadFunnelStage } from '../../types'
import type { PulseEvent } from './types'

export type PulseTone = 'neutral' | 'good' | 'warn' | 'win'

export interface PulseEventView {
  icon:    LucideIcon
  texto:   string
  detalhe?: string
  tone:    PulseTone
}

const ORIGEM_LABEL: Record<string, string> = {
  felicita:  'Felicita',
  meta_ads:  'Meta Ads',
  portal:    'Portal',
  offline:   'Offline',
  campanha:  'Prospecção · Disparo',
  indicacao: 'Indicação',
  prospeccao_ligacao: 'Prospecção · Ligação',
}

/**
 * Desfechos de ligação da prospecção ativa.
 *
 * 'discou' é o registro do clique em "Ligar pelo WhatsApp" sem desfecho ainda —
 * no feed vira só "ligou para", sem afirmar que houve conversa. Afirmar mais do
 * que se observou é o jeito mais rápido de um painel perder credibilidade.
 */
const LIGACAO: Record<string, { icon: LucideIcon; verbo: string; tone: PulseTone }> = {
  discou:          { icon: PhoneCall,   verbo: 'ligou para',                 tone: 'neutral' },
  nao_atendeu:     { icon: PhoneMissed, verbo: 'tentou ligar para',          tone: 'neutral' },
  caixa_postal:    { icon: PhoneMissed, verbo: 'caiu na caixa postal de',    tone: 'neutral' },
  pediu_retorno:   { icon: PhoneCall,   verbo: 'agendou retorno com',        tone: 'good'    },
  interessado:     { icon: Flame,       verbo: 'despertou interesse em',     tone: 'win'     },
  sem_interesse:   { icon: PhoneOff,    verbo: 'ouviu não de',               tone: 'warn'    },
  nao_perturbe:    { icon: PhoneOff,    verbo: 'anotou não perturbe em',     tone: 'warn'    },
  numero_invalido: { icon: PhoneOff,    verbo: 'marcou inválido o número de', tone: 'warn'   },
}

const INTERACAO: Record<string, { icon: LucideIcon; verbo: string; tone: PulseTone }> = {
  ligacao:  { icon: Phone,          verbo: 'ligou para',            tone: 'good'    },
  whatsapp: { icon: MessageCircle,  verbo: 'falou no WhatsApp com', tone: 'good'    },
  email:    { icon: Mail,           verbo: 'enviou e-mail para',    tone: 'neutral' },
  visita:   { icon: MapPin,         verbo: 'registrou visita —',    tone: 'good'    },
  reuniao:  { icon: Users,          verbo: 'reuniu-se com',         tone: 'good'    },
  nota:     { icon: FileText,       verbo: 'anotou em',             tone: 'neutral' },
  tarefa:   { icon: ClipboardCheck, verbo: 'concluiu tarefa de',    tone: 'neutral' },
  discard:  { icon: Trash2,         verbo: 'descartou',             tone: 'warn'    },
}

const CAMPANHA: Record<string, { icon: LucideIcon; verbo: string; tone: PulseTone }> = {
  dispatch:     { icon: Send,           verbo: 'disparou para',        tone: 'good'    },
  stage_change: { icon: ArrowRight,     verbo: 'avançou na campanha',  tone: 'good'    },
  transfer:     { icon: ArrowRightLeft, verbo: 'transferiu ao funil',  tone: 'good'    },
  assignment:   { icon: Users,          verbo: 'delegou',              tone: 'neutral' },
  parecer:      { icon: FileText,       verbo: 'deu parecer em',       tone: 'neutral' },
}

/**
 * A conclusão de venda grava em DUAS pontas: um registro em `sales` e uma
 * interação de tipo 'nota' com esta descrição. O evento de venda do Pulse vem
 * sempre de `sales` — a nota é filtrada aqui para a mesma venda não aparecer
 * duas vezes no feed.
 */
const NOTA_VENDA_PREFIXO = 'Venda concluída'

/**
 * A transferência da prospecção copia cada ligação para lead_interactions, para
 * que a linha do tempo do lead novo nasça com o histórico. No MESMO dia — que é
 * o caso comum: ligou, gostou, transferiu —, essas cópias apareceriam no feed
 * ao lado do evento de ligação original, contando duas vezes o mesmo telefonema
 * e inflando o KPI de Atendimentos.
 */
const LIGACAO_COPIADA_PREFIXO = 'Prospecção ativa · '

export function isEventoRuido(ev: PulseEvent): boolean {
  if (ev.kind !== 'interacao') return false
  const detalhe = ev.detalhe ?? ''
  if (ev.subTipo === 'nota'    && detalhe.startsWith(NOTA_VENDA_PREFIXO))     return true
  if (ev.subTipo === 'ligacao' && detalhe.startsWith(LIGACAO_COPIADA_PREFIXO)) return true
  return false
}

function stageLabel(slug?: string): string {
  if (!slug) return ''
  return STAGE_THEME[slug as LeadFunnelStage]?.label ?? slug
}

function moeda(v?: number): string {
  if (!v) return ''
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

/**
 * Traduz um evento (venha do snapshot ou do realtime) na linha que aparece no
 * feed. Renderizador único para as duas fontes — é o que garante que a tela
 * fica idêntica tenha o iPad sido ligado agora ou às 8 da manhã.
 */
export function describe(ev: PulseEvent, brokerNome?: string): PulseEventView {
  const quem = brokerNome ?? 'Alguém'
  const lead = ev.leadNome ?? 'lead'
  // O produto entra no texto principal: saber COM QUEM o corretor falou sem
  // saber SOBRE O QUE não fecha a leitura de 2 segundos que o painel promete.
  const comProduto = (base: string) => ev.produto ? `${base} · ${ev.produto}` : base

  switch (ev.kind) {
    case 'lead_novo': {
      // Quem recebeu o lead importa tanto quanto o lead ter entrado — é o
      // rodízio funcionando (ou não).
      const origem = ORIGEM_LABEL[ev.origem ?? ''] ?? ev.origem
      return {
        icon: UserPlus,
        texto: comProduto(`Novo lead — ${lead}`),
        detalhe: brokerNome ? `${origem ?? 'Novo'} → ${brokerNome}` : origem,
        tone: 'win',
      }
    }

    case 'etapa': {
      const destino = stageLabel(ev.toStage)
      return {
        icon: ArrowRight,
        texto: comProduto(`${quem} moveu ${lead} → ${destino}`),
        detalhe: ev.fromStage ? `de ${stageLabel(ev.fromStage)}` : undefined,
        tone: ev.toStage === 'venda' ? 'win' : 'good',
      }
    }

    case 'interacao': {
      const cfg = INTERACAO[ev.subTipo ?? ''] ?? INTERACAO.nota
      return {
        icon: cfg.icon,
        texto: comProduto(`${quem} ${cfg.verbo} ${lead}`),
        detalhe: ev.subTipo === 'discard' ? ev.detalhe : undefined,
        tone: cfg.tone,
      }
    }

    case 'venda':
      return {
        icon: BadgeDollarSign,
        texto: `Venda registrada — ${lead}`,
        detalhe: moeda(ev.valor),
        tone: 'win',
      }

    case 'visita':
      return {
        icon: CalendarCheck,
        texto: `Visita agendada — ${lead}`,
        detalhe: ev.detalhe ? `para ${ev.detalhe.split('T')[0].split('-').reverse().join('/')}` : undefined,
        tone: 'good',
      }

    case 'campanha': {
      const cfg = CAMPANHA[ev.subTipo ?? ''] ?? { icon: Activity, verbo: 'agiu em', tone: 'neutral' as PulseTone }
      const n = ev.agrupados ?? 1
      return {
        icon: cfg.icon,
        texto: n > 1
          ? `${quem} ${cfg.verbo} ${n} contatos`
          : `${quem} ${cfg.verbo} ${lead}`,
        tone: cfg.tone,
      }
    }

    case 'ligacao': {
      const cfg = LIGACAO[ev.subTipo ?? ''] ?? LIGACAO.discou
      const n = ev.agrupados ?? 1
      return {
        icon: cfg.icon,
        texto: n > 1
          ? `${quem} ligou para ${n} contatos`
          : `${quem} ${cfg.verbo} ${lead}`,
        detalhe: n > 1 ? undefined : 'prospecção ativa',
        tone: cfg.tone,
      }
    }
  }
}

/**
 * Agrupa disparos e ligações consecutivos do mesmo corretor numa linha só.
 *
 * Sem isto, um dia de campanha com 200 disparos empurra todo o resto para fora
 * do feed em minutos — e o painel deixa de responder "o que está acontecendo"
 * para responder "o Dionata está disparando", 200 vezes seguidas. Ligação em
 * volume tem exatamente o mesmo efeito.
 *
 * Ligação que gerou INTERESSE nunca é agrupada: é o evento raro que justifica a
 * operação inteira e precisa de linha própria.
 */
const JANELA_AGRUPAMENTO_MS = 10 * 60 * 1000

/** Ligação rotineira — pode virar contagem. Interesse, não. */
function ligacaoRotineira(ev: PulseEvent): boolean {
  return ev.kind === 'ligacao' && ev.subTipo !== 'interessado' && ev.subTipo !== 'pediu_retorno'
}

export function agruparFeed(eventos: PulseEvent[]): PulseEvent[] {
  const out: PulseEvent[] = []

  for (const ev of eventos) {
    const anterior = out[out.length - 1]
    const perto = anterior
      && Math.abs(new Date(anterior.at).getTime() - new Date(ev.at).getTime()) < JANELA_AGRUPAMENTO_MS
      && anterior.brokerId === ev.brokerId

    const agrupavel = perto && (
         (anterior.kind === 'campanha' && ev.kind === 'campanha'
          && anterior.subTipo === 'dispatch' && ev.subTipo === 'dispatch')
      || (ligacaoRotineira(anterior) && ligacaoRotineira(ev))
    )

    if (agrupavel) {
      out[out.length - 1] = { ...anterior, agrupados: (anterior.agrupados ?? 1) + 1 }
    } else {
      out.push(ev)
    }
  }

  return out
}

/** "agora", "há 3 min", "há 2 h" — sem dependência de biblioteca de datas. */
export function tempoRelativo(iso: string, agora: number = Date.now()): string {
  const min = Math.floor((agora - new Date(iso).getTime()) / 60000)
  if (min < 1)  return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  return `há ${h} h`
}

export function horaCurta(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
