import { supabase } from './supabase'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface LeadScoreBreakdown {
  label:  string
  points: number
}

export interface LeadScoreResult {
  score:     number
  label:     'Frio' | 'Morno' | 'Quente' | 'Muito Quente'
  emoji:     string
  color:     string   // text color
  bg:        string   // background
  border:    string
  breakdown: LeadScoreBreakdown[]
}

// ─── Tabelas de pontos ────────────────────────────────────────────────────────

const CAMPAIGN_STAGE_PTS: Record<string, number> = {
  sent:      10,
  attended:  25,
  scheduled: 40,
}

const FUNNEL_STAGE_PTS: Record<string, number> = {
  lead:        10,
  followup:    15,
  atendimento: 25,
  visita:      40,
  proposta:    55,
  venda:       80,
}

function scoreLabel(score: number): LeadScoreResult['label'] {
  if (score >= 66) return 'Muito Quente'
  if (score >= 36) return 'Quente'
  if (score >= 16) return 'Morno'
  return 'Frio'
}

const LABEL_CONFIG = {
  'Frio':        { emoji: '❄️', color: 'text-slate-400',  bg: 'bg-slate-500/10',  border: 'border-slate-500/20'  },
  'Morno':       { emoji: '🌤', color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20'   },
  'Quente':      { emoji: '🔥', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
  'Muito Quente':{ emoji: '⚡', color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
}

// ─── Cálculo individual ───────────────────────────────────────────────────────

export function computeScoreFromData(data: {
  listCount:     number
  campaignStage: string | null
  dispatchCount: number
  funnelStage:   string | null
  isClient:      boolean
}): LeadScoreResult {
  let score = 0
  const breakdown: LeadScoreBreakdown[] = []

  // Listas
  if (data.listCount > 0) {
    const pts = 5 + (data.listCount - 1) * 3
    score += pts
    breakdown.push({ label: `${data.listCount} lista${data.listCount > 1 ? 's' : ''}`, points: pts })
  }

  // Funil de campanha
  if (data.campaignStage && CAMPAIGN_STAGE_PTS[data.campaignStage]) {
    const pts = CAMPAIGN_STAGE_PTS[data.campaignStage]
    score += pts
    const labels: Record<string, string> = {
      sent: '1ª Mensagem', attended: 'Demonstrou Interesse', scheduled: 'Agendou Apresentação',
    }
    breakdown.push({ label: labels[data.campaignStage] ?? data.campaignStage, points: pts })
  }

  // Disparos
  if (data.dispatchCount > 0) {
    const pts = Math.min(8 + (data.dispatchCount - 1) * 3, 23)
    score += pts
    breakdown.push({ label: `${data.dispatchCount} disparo${data.dispatchCount > 1 ? 's' : ''}`, points: pts })
  }

  // Funil principal
  if (data.funnelStage && FUNNEL_STAGE_PTS[data.funnelStage]) {
    const pts = FUNNEL_STAGE_PTS[data.funnelStage]
    score += pts
    const labels: Record<string, string> = {
      lead: 'Lead', followup: 'Followup', atendimento: 'Atendimento',
      visita: 'Visita', proposta: 'Proposta', venda: 'Venda',
    }
    breakdown.push({ label: `Funil: ${labels[data.funnelStage]}`, points: pts })
  }

  // Cliente
  if (data.isClient) {
    score += 50
    breakdown.push({ label: 'Já é cliente', points: 50 })
  }

  const label = scoreLabel(score)
  const cfg   = LABEL_CONFIG[label]
  return { score, label, ...cfg, breakdown }
}

// ─── Busca individual (para ContactModal) ────────────────────────────────────

export async function fetchLeadScore(contactId: string, phone: string): Promise<LeadScoreResult> {
  const [listsRes, campaignRes, dispatchRes, funnelRes, salesRes] = await Promise.all([
    supabase.from('lead_list_members').select('list_id', { count: 'exact', head: true })
      .eq('contact_id', contactId),
    supabase.from('campaign_leads').select('funnel_stage').eq('phone', phone),
    supabase.from('lead_campaign_dispatches').select('id', { count: 'exact', head: true })
      .eq('contact_id', contactId),
    supabase.from('leads').select('funnel_stage').eq('contact_id', contactId)
      .is('discard_reason', null).order('funnel_stage', { ascending: false }).limit(1),
    supabase.from('sales').select('id', { count: 'exact', head: true })
      .eq('client_id', contactId),
  ])

  // Maior etapa de campanha
  const CAMPAIGN_ORDER = ['scheduled', 'attended', 'sent', 'new']
  const campaignLeads = (campaignRes.data ?? []) as { funnel_stage: string }[]
  const campaignStage = CAMPAIGN_ORDER.find(s => campaignLeads.some(l => l.funnel_stage === s)) ?? null

  // Maior etapa do funil
  const FUNNEL_ORDER = ['venda', 'proposta', 'visita', 'atendimento', 'followup', 'lead']
  const funnelLeads  = (funnelRes.data ?? []) as { funnel_stage: string }[]
  const funnelStage  = FUNNEL_ORDER.find(s => funnelLeads.some(l => l.funnel_stage === s)) ?? null

  return computeScoreFromData({
    listCount:     listsRes.count ?? 0,
    campaignStage,
    dispatchCount: dispatchRes.count ?? 0,
    funnelStage,
    isClient:      (salesRes.count ?? 0) > 0,
  })
}

// ─── Busca em batch (para LeadListDetail — evita N queries) ─────────────────

export interface BatchScoreInput {
  contactId: string
  phone:     string
}

export async function batchLeadScores(
  contacts: BatchScoreInput[]
): Promise<Map<string, LeadScoreResult>> {
  if (contacts.length === 0) return new Map()

  const ids    = contacts.map(c => c.contactId)
  const phones = contacts.map(c => c.phone)
  const CHUNK  = 500

  async function queryChunked<T>(
    table: string, column: string, values: string[], select: string
  ): Promise<T[]> {
    const results: T[] = []
    for (let i = 0; i < values.length; i += CHUNK) {
      const { data } = await supabase.from(table).select(select).in(column, values.slice(i, i + CHUNK))
      if (data) results.push(...(data as T[]))
    }
    return results
  }

  const [listMembers, campaignLeads, dispatches, funnelLeads, sales] = await Promise.all([
    queryChunked<{ contact_id: string }>(
      'lead_list_members', 'contact_id', ids, 'contact_id'
    ),
    queryChunked<{ phone: string; funnel_stage: string }>(
      'campaign_leads', 'phone', phones, 'phone,funnel_stage'
    ),
    queryChunked<{ contact_id: string }>(
      'lead_campaign_dispatches', 'contact_id', ids, 'contact_id'
    ),
    queryChunked<{ contact_id: string; funnel_stage: string }>(
      'leads', 'contact_id', ids, 'contact_id,funnel_stage'
    ),
    queryChunked<{ client_id: string }>(
      'sales', 'client_id', ids, 'client_id'
    ),
  ])

  // Indexar por contact_id / phone
  const listCount     = new Map<string, number>()
  const dispatchCount = new Map<string, number>()
  const clientSet     = new Set<string>()
  const campaignMap   = new Map<string, string>()  // phone → best stage
  const funnelMap     = new Map<string, string>()  // contact_id → best stage

  const CAMPAIGN_ORDER = ['scheduled', 'attended', 'sent']
  const FUNNEL_ORDER   = ['venda', 'proposta', 'visita', 'atendimento', 'followup', 'lead']

  listMembers.forEach(m => listCount.set(m.contact_id, (listCount.get(m.contact_id) ?? 0) + 1))
  dispatches.forEach(d => dispatchCount.set(d.contact_id, (dispatchCount.get(d.contact_id) ?? 0) + 1))
  sales.forEach(s => clientSet.add(s.client_id))

  campaignLeads.forEach(cl => {
    const cur = campaignMap.get(cl.phone)
    const curIdx = cur ? CAMPAIGN_ORDER.indexOf(cur) : 999
    const newIdx = CAMPAIGN_ORDER.indexOf(cl.funnel_stage)
    if (newIdx !== -1 && newIdx < curIdx) campaignMap.set(cl.phone, cl.funnel_stage)
  })

  funnelLeads.forEach(fl => {
    if (!fl.contact_id) return
    const cur = funnelMap.get(fl.contact_id)
    const curIdx = cur ? FUNNEL_ORDER.indexOf(cur) : 999
    const newIdx = FUNNEL_ORDER.indexOf(fl.funnel_stage)
    if (newIdx !== -1 && newIdx < curIdx) funnelMap.set(fl.contact_id, fl.funnel_stage)
  })

  const result = new Map<string, LeadScoreResult>()
  for (const c of contacts) {
    result.set(c.contactId, computeScoreFromData({
      listCount:     listCount.get(c.contactId) ?? 0,
      campaignStage: campaignMap.get(c.phone) ?? null,
      dispatchCount: dispatchCount.get(c.contactId) ?? 0,
      funnelStage:   funnelMap.get(c.contactId) ?? null,
      isClient:      clientSet.has(c.contactId),
    }))
  }
  return result
}
