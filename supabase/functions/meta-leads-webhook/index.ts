import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const VERIFY_TOKEN = Deno.env.get('META_VERIFY_TOKEN') ?? ''
const APP_SECRET   = Deno.env.get('META_APP_SECRET') ?? ''
const ACCESS_TOKEN = Deno.env.get('META_ACCESS_TOKEN') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Valida X-Hub-Signature-256 com comparação timing-safe
async function verifySignature(body: string, header: string, secret: string): Promise<boolean> {
  if (!header.startsWith('sha256=') || !secret) return false
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const raw = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
  const computed = 'sha256=' + Array.from(new Uint8Array(raw))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  // Timing-safe: percorre sempre o mesmo número de operações
  if (computed.length !== header.length) return false
  const a = encoder.encode(computed)
  const b = encoder.encode(header)
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

// Busca field_data do lead na Graph API
async function fetchLeadData(leadgenId: string): Promise<Record<string, unknown> | null> {
  const url =
    `https://graph.facebook.com/v23.0/${leadgenId}` +
    `?fields=field_data,ad_name,form_id,created_time` +
    `&access_token=${ACCESS_TOKEN}`
  try {
    const res  = await fetch(url)
    const data = await res.json() as Record<string, unknown>
    if (data.error) {
      console.error(`[meta] Graph API erro para ${leadgenId}:`, JSON.stringify(data.error))
      return null
    }
    return data
  } catch (err) {
    console.error(`[meta] fetch Graph API falhou para ${leadgenId}:`, err)
    return null
  }
}

Deno.serve(async (req: Request) => {

  // ── GET: verificação do webhook pela Meta ─────────────────────────────────
  if (req.method === 'GET') {
    const url       = new URL(req.url)
    const mode      = url.searchParams.get('hub.mode')
    const token     = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
      console.log('[meta] webhook verificado pela Meta')
      return new Response(challenge, { status: 200 })
    }
    return new Response('Forbidden', { status: 403 })
  }

  // ── POST: evento de lead ─────────────────────────────────────────────────
  if (req.method === 'POST') {
    // Lê o corpo bruto antes de qualquer coisa (necessário para HMAC)
    const rawBody = await req.text()

    // Valida assinatura — rejeita se inválida
    const sigHeader = req.headers.get('x-hub-signature-256') ?? ''
    if (!await verifySignature(rawBody, sigHeader, APP_SECRET)) {
      console.warn('[meta] assinatura inválida — rejeitando POST')
      return new Response('Forbidden', { status: 403 })
    }

    try {
      const body = JSON.parse(rawBody) as Record<string, unknown>

      // Coleta TODOS os leadgen changes do lote (não só o último)
      const changes: Array<{
        leadgen_id: string
        page_id:    string | null
        form_id:    string | null
        ad_id:      string | null
        raw:        unknown
      }> = []

      for (const entry of (body.entry as Array<Record<string, unknown>>) ?? []) {
        for (const change of (entry.changes as Array<Record<string, unknown>>) ?? []) {
          if (change.field === 'leadgen') {
            const v = change.value as Record<string, string>
            if (v?.leadgen_id) {
              changes.push({
                leadgen_id: v.leadgen_id,
                page_id:    v.page_id    ?? null,
                form_id:    v.form_id    ?? null,
                ad_id:      v.ad_id      ?? null,
                raw:        change,
              })
            }
          }
        }
      }

      console.log(`[meta] lote recebido: ${changes.length} lead(s)`)

      for (const c of changes) {
        // 1. Insere evento bruto — ON CONFLICT = dedup de retries da Meta
        const { data: evRow, error: evErr } = await supabase
          .from('meta_webhook_events')
          .insert({
            leadgen_id:  c.leadgen_id,
            page_id:     c.page_id,
            form_id:     c.form_id,
            ad_id:       c.ad_id,
            raw_payload: c.raw,
            status:      'received',
          })
          .select('id')
          .single()

        if (evErr) {
          // Código 23505 = violação de UNIQUE (leadgen_id já existe → retry da Meta)
          if ((evErr as { code?: string }).code === '23505') {
            console.log(`[meta] retry ignorado: ${c.leadgen_id}`)
            continue
          }
          console.error(`[meta] erro ao inserir evento ${c.leadgen_id}:`, evErr)
          continue
        }

        const eventId = evRow.id as string

        // 2. Busca field_data na Graph API
        const graphData = await fetchLeadData(c.leadgen_id)

        if (!graphData) {
          await supabase
            .from('meta_webhook_events')
            .update({ status: 'error', error_detail: 'Graph API indisponível ou token inválido' })
            .eq('id', eventId)
          continue
        }

        // 3. Atualiza evento com o payload completo
        await supabase
          .from('meta_webhook_events')
          .update({
            lead_payload: graphData,
            ad_name:      (graphData.ad_name  as string) ?? c.ad_id ?? null,
            form_id:      (graphData.form_id  as string) ?? c.form_id ?? null,
          })
          .eq('id', eventId)

        // 4. Processa em UMA transação no banco (dedup, round-robin, lead, notif)
        const { data: leadId, error: rpcErr } = await supabase
          .rpc('process_meta_lead', { p_event_id: eventId })

        if (rpcErr) {
          console.error(`[meta] erro ao processar evento ${eventId}:`, rpcErr)
          await supabase
            .from('meta_webhook_events')
            .update({ status: 'error', error_detail: rpcErr.message })
            .eq('id', eventId)
        } else {
          console.log(`[meta] lead ${leadId} ← leadgen ${c.leadgen_id}`)
        }
      }
    } catch (err) {
      console.error('[meta] erro geral no POST:', err)
    }

    // Sempre 200 — nunca deixar a Meta desativar a subscription por falha HTTP
    return new Response(JSON.stringify({ status: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response('Method Not Allowed', { status: 405 })
})
