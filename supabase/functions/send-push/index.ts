import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Segredos vêm do Vault via RPC get_secret (somente service_role)
let vapidReady = false
let hookSecret: string | null = null

async function getSecret(name: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_secret', { p_name: name })
  if (error) {
    console.error(`[push] erro ao ler segredo ${name}:`, error.message)
    return null
  }
  return data as string | null
}

async function ensureSetup(): Promise<boolean> {
  if (vapidReady && hookSecret) return true
  const [priv, pub, hook] = await Promise.all([
    getSecret('vapid_private_key'),
    getSecret('vapid_public_key'),
    getSecret('push_hook_secret'),
  ])
  if (!priv || !pub || !hook) return false
  webpush.setVapidDetails('mailto:rafael@souzaimoveis.com', pub, priv)
  hookSecret = hook
  vapidReady = true
  return true
}

interface NotificationRow {
  id:            string
  user_id:       string
  type:          string
  title:         string
  body:          string | null
  resource_id:   string | null
  resource_type: string | null
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  if (!await ensureSetup()) {
    console.error('[push] segredos VAPID ausentes no Vault')
    return new Response('Setup incompleto', { status: 500 })
  }

  // Autenticação do gatilho pg_net via segredo compartilhado
  if (req.headers.get('x-push-secret') !== hookSecret) {
    return new Response('Forbidden', { status: 403 })
  }

  const n = await req.json() as NotificationRow

  // Linha de urgência: lead com relógio de SLA rodando
  let slaLine = ''
  if (n.resource_type === 'lead' && n.resource_id) {
    const { data: lead } = await supabase
      .from('leads')
      .select('sla_due_at, first_contact_at')
      .eq('id', n.resource_id)
      .maybeSingle()
    if (lead?.sla_due_at && !lead.first_contact_at) {
      const ate = new Date(lead.sla_due_at).toLocaleTimeString('pt-BR', {
        hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
      })
      slaLine = `Você tem 5 min úteis para o 1º contato (até ${ate})`
    }
  }

  const payload = JSON.stringify({
    title: n.title,
    body:  [n.body, slaLine].filter(Boolean).join('\n'),
    url:   n.resource_type === 'lead' ? '/leads' : '/tarefas',
    tag:   n.id,
  })

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', n.user_id)

  if (error) {
    console.error('[push] erro ao buscar inscrições:', error.message)
    return new Response('Erro interno', { status: 500 })
  }

  let sent = 0
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      )
      sent++
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode
      // 404/410 = inscrição morta (app desinstalado, permissão revogada) — limpa
      if (code === 404 || code === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', s.id)
        console.log(`[push] inscrição expirada removida: ${s.id}`)
      } else {
        console.error(`[push] falha ao enviar para ${s.id}:`, err)
      }
    }
  }

  console.log(`[push] notificação ${n.id} → ${sent}/${subs?.length ?? 0} dispositivos`)
  return new Response(JSON.stringify({ sent, total: subs?.length ?? 0 }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
