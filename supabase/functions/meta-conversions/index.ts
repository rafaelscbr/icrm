// Envia ao Meta os eventos da fila meta_conversion_events (API de Conversões
// para CRM / Conversion Leads). Chamada pelo pg_cron a cada 5 min, via pg_net
// (migração 086). Implantar com verify_jwt = false: a autenticação é o segredo
// do gancho, como na send-push.
//
// Segredos da função:
//   META_DATASET_ID       — conjunto de dados (pixel) que recebe os eventos
//   META_CAPI_TOKEN       — token gerado no Gerenciador de Eventos para esse conjunto
//   META_TEST_EVENT_CODE  — opcional; com ele os eventos aparecem em "Eventos de teste"
//
// Um evento por chamada ao Meta: o volume é baixo e, em lote, um evento
// inválido derrubaria os outros.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { GRAPH_VERSION, buildBody, classify, isExpired, type QueueEvent } from './payload.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const DATASET_ID   = (Deno.env.get('META_DATASET_ID') ?? '').trim()
const CAPI_TOKEN   = (Deno.env.get('META_CAPI_TOKEN') ?? '').trim()
const TEST_CODE    = (Deno.env.get('META_TEST_EVENT_CODE') ?? '').trim() || null

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

let hookSecret: string | null = null

async function getHookSecret(): Promise<string | null> {
  if (hookSecret) return hookSecret
  const { data, error } = await supabase.rpc('get_secret', { p_name: 'meta_capi_hook_secret' })
  if (error) {
    console.error('[capi] erro ao ler o segredo do gancho:', error.message)
    return null
  }
  hookSecret = (data as string | null) ?? null
  return hookSecret
}

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const x = enc.encode(a)
  const y = enc.encode(b)
  if (x.length !== y.length) return false
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

async function heartbeat(note: string): Promise<void> {
  const { error } = await supabase.rpc('meta_conv_heartbeat', { p_note: note, p_test: TEST_CODE !== null })
  if (error) console.error('[capi] heartbeat:', error.message)
}

async function report(
  id: string, outcome: 'enviado' | 'tentar' | 'erro' | 'expirado',
  http: number | null, response: unknown, error: string | null,
): Promise<void> {
  const { error: rpcErr } = await supabase.rpc('meta_conv_report', {
    p_id: id, p_outcome: outcome, p_http: http, p_response: response ?? null,
    p_error: error, p_test: TEST_CODE !== null,
  })
  // Sem registro, o evento fica "enviando" e volta à fila em 10 min; o Meta
  // descarta a repetição pelo event_id.
  if (rpcErr) console.error(`[capi] não registrou o desfecho de ${id}:`, rpcErr.message)
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const secret = await getHookSecret()
  const given  = req.headers.get('x-hook-secret') ?? ''
  if (!secret || !timingSafeEqual(given, secret)) {
    return new Response('Forbidden', { status: 403 })
  }

  // Sem configuração não reserva nada: os eventos esperam na fila.
  if (!/^[0-9]+$/.test(DATASET_ID) || !CAPI_TOKEN) {
    const note = 'Envio parado: falta configurar META_DATASET_ID e META_CAPI_TOKEN na função meta-conversions'
    console.error(`[capi] ${note}`)
    await heartbeat(note)
    return json(503, { error: note })
  }

  const { data, error } = await supabase.rpc('meta_conv_claim', { p_limit: 50 })
  if (error) {
    console.error('[capi] erro ao reservar a fila:', error.message)
    await heartbeat(`Erro ao ler a fila: ${error.message}`)
    return json(500, { error: error.message })
  }

  const events = ((data ?? []) as QueueEvent[])
    .sort((a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime())

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${DATASET_ID}/events?access_token=${encodeURIComponent(CAPI_TOKEN)}`
  const count = { enviado: 0, tentar: 0, erro: 0, expirado: 0 }
  let authError: string | null = null

  for (const ev of events) {
    // Token recusado neste lote: devolve o resto à fila sem chamar o Meta.
    if (authError) {
      await report(ev.id, 'tentar', null, null, authError)
      count.tentar++
      continue
    }

    if (isExpired(ev.event_time, Date.now())) {
      await report(ev.id, 'expirado', null, null, 'Passou do limite de 7 dias do Meta antes de ser enviado')
      count.expirado++
      continue
    }

    let body: string
    try {
      body = buildBody(ev, TEST_CODE)
    } catch (err) {
      await report(ev.id, 'erro', null, null, (err as Error).message)
      count.erro++
      continue
    }

    try {
      const res  = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
      const text = await res.text()
      let parsed: unknown
      try { parsed = JSON.parse(text) } catch { parsed = { raw: text.slice(0, 2000) } }

      const verdict = classify(res.status, parsed)
      await report(ev.id, verdict.outcome, res.status, parsed, verdict.error)
      count[verdict.outcome]++
      if (verdict.auth) authError = verdict.error
    } catch (err) {
      // Falha de rede: não sabemos se chegou. Tenta de novo — mesmo event_id.
      await report(ev.id, 'tentar', null, null, `Falha de rede ao chamar o Meta: ${(err as Error).message}`)
      count.tentar++
    }
  }

  const note = authError
    ? `Token recusado pelo Meta — ${authError}`
    : `${count.enviado} enviado(s), ${count.tentar} para tentar de novo, ${count.erro} com erro, ${count.expirado} expirado(s)`
  console.log(`[capi] ${note}${TEST_CODE ? ' [modo de teste]' : ''}`)
  await heartbeat(note)

  return json(200, { ...count, test_mode: TEST_CODE !== null })
})
