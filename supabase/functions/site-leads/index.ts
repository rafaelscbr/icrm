// site-leads: recebe os contatos deixados no site souzaimobi.com.br e cria o lead no iCRM.
//
// Fluxo: valida → barra robô (campo isca) e excesso de envios do mesmo IP →
// grava o evento bruto em site_lead_events → process_site_lead() (mesma regra
// do Meta Ads: reentrada, cliente que volta, rodízio, SLA e notificação).
//
// Público (verify_jwt = false): o site é estático e não tem login. A proteção é
// CORS restrito aos domínios do site + campo isca (`isca`) + limite por IP.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SAL_IP       = Deno.env.get('SITE_LEADS_SALT') ?? 'souza-site'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const ORIGENS_PERMITIDAS = ['https://souzaimobi.com.br', 'https://www.souzaimobi.com.br', 'http://localhost:4321', 'http://localhost:4322']
const TIPOS = ['alerta', 'tabela', 'quiz', 'contato']
const LIMITE_POR_IP = 5          // envios
const JANELA_MIN    = 10         // minutos

function cors(origin: string | null) {
  const permitido = origin && ORIGENS_PERMITIDAS.includes(origin) ? origin : ORIGENS_PERMITIDAS[0]
  return {
    'Access-Control-Allow-Origin': permitido,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Vary': 'Origin',
  }
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), 'Content-Type': 'application/json' } })
}

async function hash(texto: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(SAL_IP + texto))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

const limpa = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })
  if (req.method !== 'POST') return json({ ok: false, erro: 'método' }, 405, origin)
  if (!origin || !ORIGENS_PERMITIDAS.includes(origin)) return json({ ok: false, erro: 'origem' }, 403, origin)

  let corpo: Record<string, unknown>
  try { corpo = await req.json() } catch { return json({ ok: false, erro: 'json' }, 400, origin) }

  const nome     = limpa(corpo.nome, 80)
  const telefone = limpa(corpo.telefone, 30)
  const digitos  = telefone.replace(/\D/g, '')
  const email    = limpa(corpo.email, 120)
  const tipo     = TIPOS.includes(limpa(corpo.tipo, 20)) ? limpa(corpo.tipo, 20) : 'contato'

  if (nome.length < 2) return json({ ok: false, erro: 'nome' }, 422, origin)
  if (digitos.length < 10 || digitos.length > 13) return json({ ok: false, erro: 'telefone' }, 422, origin)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, erro: 'email' }, 422, origin)

  // Respostas: só texto curto, no máximo 12 chaves
  const respostas: Record<string, string | string[]> = {}
  if (corpo.respostas && typeof corpo.respostas === 'object') {
    for (const [k, v] of Object.entries(corpo.respostas as Record<string, unknown>).slice(0, 12)) {
      const chave = limpa(k, 40)
      if (!chave) continue
      if (Array.isArray(v)) respostas[chave] = v.slice(0, 10).map((x) => limpa(x, 80)).filter(Boolean)
      else if (limpa(v, 200)) respostas[chave] = limpa(v, 200)
    }
  }

  // Origem da visita (utm) e jornada no site: só texto curto e listas pequenas
  const objeto = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
  const lista  = (v: unknown) => (Array.isArray(v) ? v.slice(0, 12).map((x) => limpa(x, 80)).filter(Boolean) : [])
  const utmIn  = objeto(corpo.utm)
  const utm: Record<string, string> = {}
  if (utmIn) for (const [k, v] of Object.entries(utmIn).slice(0, 10)) { const c = limpa(k, 30); const val = limpa(v, 120); if (c && val) utm[c] = val }
  const ctxIn  = objeto(corpo.contexto)
  const contexto = ctxIn ? {
    vistos: lista(ctxIn.vistos),
    favoritos: lista(ctxIn.favoritos),
    comparados: lista(ctxIn.comparados),
    pontuacao: typeof ctxIn.pontuacao === 'number' ? Math.max(0, Math.min(100, Math.round(ctxIn.pontuacao))) : null,
    dispositivo: limpa(ctxIn.dispositivo, 20) || null,
  } : null

  const ip     = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim()
  const ipHash = ip ? await hash(ip) : null

  if (ipHash) {
    const desde = new Date(Date.now() - JANELA_MIN * 60_000).toISOString()
    const { count } = await supabase
      .from('site_lead_events')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .gte('created_at', desde)
    if ((count ?? 0) >= LIMITE_POR_IP) return json({ ok: false, erro: 'limite' }, 429, origin)
  }

  // Campo isca (`isca`): pessoa não vê, robô preenche. O envio fica registrado como "isca" (sem virar lead),
  // para dar para conferir se algum cliente de verdade caiu nela; o robô recebe "ok" e não insiste.
  // O antigo campo `empresa` NÃO é mais isca: o Chrome o completava com a empresa da pessoa.
  const isca = limpa(corpo.isca, 200)

  const payload = {
    nome, telefone, email: email || null, tipo,
    empreendimento: limpa(corpo.empreendimento, 80) || null,
    pagina: limpa(corpo.pagina, 200) || null,
    respostas,
    utm: Object.keys(utm).length ? utm : null,
    referrer: limpa(corpo.referrer, 200) || null,
    contexto,
  }

  if (isca) {
    await supabase.from('site_lead_events').insert({ ip_hash: ipHash, payload: { ...payload, isca }, status: 'isca' })
    return json({ ok: true }, 200, origin)
  }

  const { data: ev, error: evErr } = await supabase
    .from('site_lead_events')
    .insert({ ip_hash: ipHash, payload })
    .select('id')
    .single()
  if (evErr) {
    console.error('[site] erro ao gravar evento:', evErr)
    return json({ ok: false, erro: 'gravar' }, 500, origin)
  }

  const { error: rpcErr } = await supabase.rpc('process_site_lead', { p_event_id: ev.id })
  if (rpcErr) {
    console.error(`[site] erro ao processar ${ev.id}:`, rpcErr)
    await supabase.from('site_lead_events').update({ status: 'error', error_detail: rpcErr.message }).eq('id', ev.id)
    return json({ ok: false, erro: 'processar' }, 500, origin)
  }

  return json({ ok: true }, 200, origin)
})
