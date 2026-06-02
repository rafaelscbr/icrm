import { supabase } from './supabase'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ListScoreResult {
  score:       number   // 0–100
  label:       'Fria' | 'Morna' | 'Quente' | 'Premium'
  emoji:       string
  color:       string
  bg:          string
  border:      string
  // Breakdown para exibir na UI
  clients:     number
  transferred: number
  interested:  number
  total:       number
}

const LABEL_CONFIG = {
  'Fria':    { emoji: '❄️', color: 'text-slate-400',  bg: 'bg-slate-500/10',  border: 'border-slate-500/20'  },
  'Morna':   { emoji: '🌤', color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20'   },
  'Quente':  { emoji: '🔥', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
  'Premium': { emoji: '⚡', color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
}

function scoreToLabel(score: number): ListScoreResult['label'] {
  if (score >= 71) return 'Premium'
  if (score >= 46) return 'Quente'
  if (score >= 21) return 'Morna'
  return 'Fria'
}

function computeListScore(data: {
  total:       number
  clients:     number
  transferred: number
  interested:  number
}): number {
  if (data.total === 0) return 0
  const pct = (n: number) => n / data.total

  // C1: clientes (5% = 100 pts) — peso 40%
  const c1 = Math.min(100, pct(data.clients) * 2000)
  // C2: transferidos ao funil (15% = 100 pts) — peso 35%
  const c2 = Math.min(100, pct(data.transferred) * 667)
  // C3: interessados em campanha (20% = 100 pts) — peso 25%
  const c3 = Math.min(100, pct(data.interested) * 500)

  return Math.round(c1 * 0.40 + c2 * 0.35 + c3 * 0.25)
}

function buildResult(
  total: number, clients: number, transferred: number, interested: number
): ListScoreResult {
  const score = computeListScore({ total, clients, transferred, interested })
  const label = scoreToLabel(score)
  const cfg   = LABEL_CONFIG[label]
  return { score, label, ...cfg, clients, transferred, interested, total }
}

// ─── Helpers de chunk paralelo ────────────────────────────────────────────────

/** Divide um array em pedaços e executa queryFn em paralelo (Promise.all). */
async function parallelChunks<T, R>(
  items:    T[],
  size:     number,
  queryFn:  (chunk: T[]) => Promise<R[]>
): Promise<R[]> {
  if (items.length === 0) return []
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  const results = await Promise.all(chunks.map(queryFn))
  return (results as R[][]).flat()
}

/** Busca todos os membros com paginação real (evita limite de rows do PostgREST). */
async function fetchAllMembers(listIds: string[]): Promise<{ list_id: string; contact_id: string }[]> {
  const PAGE = 1000
  const all: { list_id: string; contact_id: string }[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('lead_list_members')
      .select('list_id,contact_id')
      .in('list_id', listIds)
      .range(from, from + PAGE - 1)
      .order('list_id')   // ordem estável garante paginação correta

    if (error || !data || data.length === 0) break
    all.push(...(data as { list_id: string; contact_id: string }[]))
    if (data.length < PAGE) break
    from += PAGE
  }

  return all
}

// ─── Busca em batch para todas as listas ──────────────────────────────────────

export async function batchListScores(
  listIds: string[]
): Promise<Map<string, ListScoreResult>> {
  if (listIds.length === 0) return new Map()

  const CHUNK = 400   // pedaços para as queries de IN (seguro abaixo do max_url_length)

  // ── Passo 1: buscar TODOS os membros com paginação real ───────────────────
  const allMembers = await fetchAllMembers(listIds)

  if (allMembers.length === 0) {
    return new Map(listIds.map(id => [id, buildResult(0, 0, 0, 0)]))
  }

  const allContactIds = [...new Set(allMembers.map(m => m.contact_id))]

  // ── Passo 2: phones dos contatos (necessário para cruzar com campaign_leads)
  const contactPhones = new Map<string, string>()
  const phoneRows = await parallelChunks<string, { id: string; phone: string }>(
    allContactIds, CHUNK,
    async (chunk) => {
      const { data } = await supabase.from('contacts').select('id,phone').in('id', chunk)
      return (data ?? []) as { id: string; phone: string }[]
    }
  )
  phoneRows.forEach((c: { id: string; phone: string }) => contactPhones.set(c.id, c.phone))

  // ── Passo 3: clientes, transferidos e interessados em PARALELO ────────────
  const allPhones = [...new Set([...contactPhones.values()].filter(Boolean))]

  const [clientRows, transferredRows, interestedPhoneRows] = await Promise.all([

    // Clientes: contatos que têm venda registrada
    parallelChunks<string, { client_id: string }>(
      allContactIds, CHUNK,
      async (chunk) => {
        const { data } = await supabase.from('sales').select('client_id').in('client_id', chunk)
        return (data ?? []) as { client_id: string }[]
      }
    ),

    // Transferidos: contatos que estão no funil principal como leads ativos
    parallelChunks<string, { contact_id: string }>(
      allContactIds, CHUNK,
      async (chunk) => {
        const { data } = await supabase.from('leads').select('contact_id')
          .in('contact_id', chunk)
          .is('discard_reason', null)
          .not('contact_id', 'is', null)
        return (data ?? []) as { contact_id: string }[]
      }
    ),

    // Interessados: phone aparece em campaign_leads com etapa attended/scheduled
    allPhones.length > 0
      ? parallelChunks<string, { phone: string }>(
          allPhones, CHUNK,
          async (chunk) => {
            const { data } = await supabase.from('campaign_leads').select('phone')
              .in('phone', chunk)
              .in('funnel_stage', ['attended', 'scheduled'])
            return (data ?? []) as { phone: string }[]
          }
        )
      : Promise.resolve<{ phone: string }[]>([]),
  ])

  // ── Passo 4: montar Sets para lookup O(1) ─────────────────────────────────
  const clientSet      = new Set((clientRows as { client_id: string }[]).map(r => r.client_id))
  const transferredSet = new Set(
    (transferredRows as { contact_id: string }[]).map(r => r.contact_id).filter(Boolean) as string[]
  )
  const interestedPhones = new Set((interestedPhoneRows as { phone: string }[]).map(r => r.phone))

  // Mapear phone interessado → contact_id
  const interestedSet = new Set<string>()
  for (const [contactId, phone] of contactPhones) {
    if (phone && interestedPhones.has(phone)) interestedSet.add(contactId)
  }

  // ── Passo 5: calcular score por lista ─────────────────────────────────────
  // Agrupar membros por lista de forma eficiente (Map em vez de .filter)
  const membersByList = new Map<string, string[]>()
  for (const m of allMembers) {
    if (!membersByList.has(m.list_id)) membersByList.set(m.list_id, [])
    membersByList.get(m.list_id)!.push(m.contact_id)
  }

  const result = new Map<string, ListScoreResult>()
  for (const listId of listIds) {
    const members    = membersByList.get(listId) ?? []
    const total      = members.length
    const clients    = members.filter(id => clientSet.has(id)).length
    const transferred = members.filter(id => transferredSet.has(id)).length
    const interested  = members.filter(id => interestedSet.has(id)).length
    result.set(listId, buildResult(total, clients, transferred, interested))
  }

  return result
}
