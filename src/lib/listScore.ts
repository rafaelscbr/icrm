import { supabase } from './supabase'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ListScoreResult {
  score:      number   // 0–100
  label:      'Fria' | 'Morna' | 'Quente' | 'Premium'
  emoji:      string
  color:      string
  bg:         string
  border:     string
  // Breakdown para exibir na UI
  clients:    number
  transferred:number
  interested: number
  total:      number
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
  total:      number
  clients:    number
  transferred:number
  interested: number
}): number {
  if (data.total === 0) return 0
  const pct = (n: number) => n / data.total

  // C1: clientes (5% = 100 pts)
  const c1 = Math.min(100, pct(data.clients) * 2000)
  // C2: transferidos (15% = 100 pts)
  const c2 = Math.min(100, pct(data.transferred) * 667)
  // C3: interessados (20% = 100 pts)
  const c3 = Math.min(100, pct(data.interested) * 500)

  return Math.round(c1 * 0.40 + c2 * 0.35 + c3 * 0.25)
}

// ─── Busca em batch para todas as listas ──────────────────────────────────────

export async function batchListScores(
  listIds: string[]
): Promise<Map<string, ListScoreResult>> {
  if (listIds.length === 0) return new Map()

  const CHUNK = 500

  // 1. Buscar todos os membros das listas
  const allMembers: { list_id: string; contact_id: string }[] = []
  for (let i = 0; i < listIds.length; i += CHUNK) {
    const { data } = await supabase
      .from('lead_list_members')
      .select('list_id,contact_id')
      .in('list_id', listIds.slice(i, i + CHUNK))
    if (data) allMembers.push(...(data as { list_id: string; contact_id: string }[]))
  }

  if (allMembers.length === 0) {
    return new Map(listIds.map(id => [id, buildResult(0, 0, 0, 0)]))
  }

  const allContactIds = [...new Set(allMembers.map(m => m.contact_id))]

  // 2. Buscar phones dos contatos (para cruzar com campaign_leads)
  const contactPhones = new Map<string, string>()
  for (let i = 0; i < allContactIds.length; i += CHUNK) {
    const { data } = await supabase
      .from('contacts').select('id,phone').in('id', allContactIds.slice(i, i + CHUNK))
    ;(data ?? []).forEach((c: { id: string; phone: string }) => contactPhones.set(c.id, c.phone))
  }

  const allPhones = [...new Set([...contactPhones.values()])]

  // 3. Clientes (sales.client_id)
  const clientSet = new Set<string>()
  for (let i = 0; i < allContactIds.length; i += CHUNK) {
    const { data } = await supabase
      .from('sales').select('client_id').in('client_id', allContactIds.slice(i, i + CHUNK))
    ;(data ?? []).forEach((s: { client_id: string }) => clientSet.add(s.client_id))
  }

  // 4. Transferidos ao funil principal (leads com contact_id)
  const transferredSet = new Set<string>()
  for (let i = 0; i < allContactIds.length; i += CHUNK) {
    const { data } = await supabase
      .from('leads').select('contact_id').in('contact_id', allContactIds.slice(i, i + CHUNK))
      .is('discard_reason', null).not('contact_id', 'is', null)
    ;(data ?? []).forEach((l: { contact_id: string }) => { if (l.contact_id) transferredSet.add(l.contact_id) })
  }

  // 5. Interessados em campanha (attended ou scheduled)
  const interestedPhones = new Set<string>()
  for (let i = 0; i < allPhones.length; i += CHUNK) {
    const { data } = await supabase
      .from('campaign_leads').select('phone').in('phone', allPhones.slice(i, i + CHUNK))
      .in('funnel_stage', ['attended', 'scheduled'])
    ;(data ?? []).forEach((cl: { phone: string }) => interestedPhones.add(cl.phone))
  }

  // Mapear phone → contact_id para interested
  const interestedSet = new Set<string>()
  for (const [contactId, phone] of contactPhones) {
    if (interestedPhones.has(phone)) interestedSet.add(contactId)
  }

  // 6. Computar score por lista
  const result = new Map<string, ListScoreResult>()

  for (const listId of listIds) {
    const members = allMembers.filter(m => m.list_id === listId)
    const total       = members.length
    const clients     = members.filter(m => clientSet.has(m.contact_id)).length
    const transferred = members.filter(m => transferredSet.has(m.contact_id)).length
    const interested  = members.filter(m => interestedSet.has(m.contact_id)).length

    result.set(listId, buildResult(total, clients, transferred, interested))
  }

  return result
}

function buildResult(
  total: number, clients: number, transferred: number, interested: number
): ListScoreResult {
  const score = computeListScore({ total, clients, transferred, interested })
  const label = scoreToLabel(score)
  const cfg   = LABEL_CONFIG[label]
  return { score, label, ...cfg, clients, transferred, interested, total }
}

