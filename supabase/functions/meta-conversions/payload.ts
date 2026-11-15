// Montagem do envio para a API de Conversões do Meta (formato Conversion Leads)
// e leitura da resposta. Sem dependência de Deno — é testado pelo Vitest do app
// (src/test/meta-conversoes.test.ts).

export const GRAPH_VERSION = 'v27.0'

// Nomes fixos, em minúsculas: o Meta casa a etapa do funil pelo nome exato.
export const EVENT_NAMES = ['lead_recebido', 'lead_qualificado', 'visita', 'proposta', 'venda'] as const
export type EventName = typeof EVENT_NAMES[number]

// Nome que vai para o Meta. Igual ao da fila, com uma exceção: a campanha de
// "lead qualificado" já estava presa ao evento QUALIFIED nesse conjunto de dados
// (conferido no Gerenciador de Eventos em 15/11/2026), e o Meta casa pelo nome
// exato — então a qualificação sai com esse nome.
export const META_EVENT_NAME: Record<EventName, string> = {
  lead_recebido:    'lead_recebido',
  lead_qualificado: 'QUALIFIED',
  visita:           'visita',
  proposta:         'proposta',
  venda:            'venda',
}

// O Meta recusa o envio INTEIRO se event_time tiver mais de 7 dias. Folga de
// 30 min para relógio e tempo de rede.
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 - 30 * 60 * 1000

export interface QueueEvent {
  id:         string
  leadgen_id: string
  event_name: string
  event_time: string   // ISO
}

export function isExpired(eventTimeIso: string, nowMs: number): boolean {
  return nowMs - new Date(eventTimeIso).getTime() > MAX_AGE_MS
}

/**
 * Corpo do POST, já como texto.
 *
 * O lead_id vai como número (como nos exemplos do Meta), mas tem até 17
 * dígitos — acima do que o `number` do JavaScript guarda sem arredondar. Por
 * isso os dígitos são escritos direto no texto, depois de validados, em vez de
 * passar por JSON.stringify de um número.
 *
 * Nada de nome, telefone ou e-mail: o leadgen_id basta.
 */
export function buildBody(ev: QueueEvent, testEventCode?: string | null): string {
  if (!/^[0-9]{15,17}$/.test(ev.leadgen_id)) {
    throw new Error(`leadgen_id fora do padrão: ${ev.leadgen_id}`)
  }
  if (!(EVENT_NAMES as readonly string[]).includes(ev.event_name)) {
    throw new Error(`Nome de evento desconhecido: ${ev.event_name}`)
  }
  const seconds = Math.floor(new Date(ev.event_time).getTime() / 1000)
  if (!Number.isFinite(seconds)) {
    throw new Error(`event_time inválido: ${ev.event_time}`)
  }

  const event =
    `{"event_name":${JSON.stringify(META_EVENT_NAME[ev.event_name as EventName])}` +
    `,"event_time":${seconds}` +
    `,"event_id":${JSON.stringify(ev.id)}` +
    `,"action_source":"system_generated"` +
    `,"user_data":{"lead_id":${ev.leadgen_id}}` +
    `,"custom_data":{"event_source":"crm","lead_event_source":"iCRM"}}`

  const test = testEventCode ? `,"test_event_code":${JSON.stringify(testEventCode)}` : ''
  return `{"data":[${event}]${test}}`
}

export type Outcome = 'enviado' | 'tentar' | 'erro'

export interface Verdict {
  outcome: Outcome
  error:   string | null
  /** Token inválido ou sem permissão: não adianta tentar os próximos do lote. */
  auth:    boolean
}

// Códigos de erro da Graph API que são passageiros (limite de chamadas, falha
// temporária do serviço).
const TRANSIENT_CODES = new Set([1, 2, 4, 17, 32, 341, 613])
// Token expirado/inválido ou sem permissão no conjunto de dados.
const AUTH_CODES = new Set([10, 102, 190, 200])

export function classify(httpStatus: number, json: unknown): Verdict {
  const body = (json ?? {}) as Record<string, unknown>
  const err  = body.error as Record<string, unknown> | undefined

  if (httpStatus >= 200 && httpStatus < 300 && !err) {
    // Aceito. Se o Meta informar a contagem e ela for zero, não foi recebido.
    if (typeof body.events_received === 'number' && body.events_received < 1) {
      return { outcome: 'erro', error: 'O Meta respondeu sem receber o evento (events_received = 0)', auth: false }
    }
    return { outcome: 'enviado', error: null, auth: false }
  }

  const code    = typeof err?.code === 'number' ? err.code : null
  const detail  = [err?.message, err?.error_user_title, err?.error_user_msg]
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
    .join(' — ')
  const message = `Meta ${httpStatus}${code !== null ? ` (código ${code})` : ''}: ${detail || 'sem detalhe na resposta'}`

  if (httpStatus === 401 || httpStatus === 403 || (code !== null && AUTH_CODES.has(code))) {
    // Volta à fila: quando o token for corrigido, o evento sai sozinho.
    return { outcome: 'tentar', error: message, auth: true }
  }
  if (httpStatus >= 500 || httpStatus === 429 || err?.is_transient === true
      || (code !== null && TRANSIENT_CODES.has(code))) {
    return { outcome: 'tentar', error: message, auth: false }
  }
  return { outcome: 'erro', error: message, auth: false }
}
