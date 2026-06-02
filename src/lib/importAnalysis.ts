import { supabase } from './supabase'
import { normalizePhone, formatDate } from './formatters'
import { ParsedLead } from './xlsxParser'

export type ConflictType = 'other_list' | 'campaign' | 'funnel' | 'client'

export interface ConflictDetail {
  type:       ConflictType
  label:      string      // "Lista: Apto 1 Dorm"
  subLabel?:  string      // "Desde 12/03/2025" | "Etapa: Proposta"
  entityId?:  string
}

export interface AnalyzedLead extends ParsedLead {
  existingContactId?: string
  existingName?:      string
  conflicts:          ConflictDetail[]
  importDecision:     boolean  // true = importar, false = pular
  alreadyInThisList?: boolean  // já estava nesta lista — nunca mostra no UI
}

export interface AnalysisResult {
  clean:            AnalyzedLead[]  // sem conflitos → importa automático
  conflicted:       AnalyzedLead[]  // tem conflitos → usuário decide
  alreadyInList:    number          // já estavam nesta lista → pula silenciosamente
  totalAnalyzed:    number
}

const CHUNK = 500

async function queryInChunks<T>(
  table: string,
  column: string,
  values: string[],
  select: string,
  extra?: Record<string, string>
): Promise<T[]> {
  if (values.length === 0) return []
  const results: T[] = []
  for (let i = 0; i < values.length; i += CHUNK) {
    const chunk = values.slice(i, i + CHUNK)
    let q = (supabase.from(table) as ReturnType<typeof supabase.from>)
      .select(select)
      .in(column, chunk)
    if (extra) {
      for (const [k, v] of Object.entries(extra)) {
        q = q.eq(k, v)
      }
    }
    const { data } = await q
    if (data) results.push(...(data as T[]))
  }
  return results
}

const FUNNEL_LABELS: Record<string, string> = {
  lead: 'Lead', followup: 'Followup', atendimento: 'Atendimento',
  visita: 'Visita', proposta: 'Proposta', venda: 'Venda',
}

const CAMPAIGN_STAGE_LABELS: Record<string, string> = {
  new: 'Novo', sent: 'Enviado', attended: 'Atendido',
  scheduled: 'Agendado', presentation: 'Apresentação', proposal: 'Proposta', sale: 'Venda',
}

export async function analyzeLeads(
  parsed: ParsedLead[],
  currentListId: string,
  onProgress?: (pct: number) => void
): Promise<AnalysisResult> {
  const phones = parsed.map(l => l.phone)
  onProgress?.(5)

  // 1. Buscar TODOS os contatos e normalizar phone em JS.
  //    Necessário porque contatos criados manualmente têm phone formatado
  //    ("(47) 98829-9675") enquanto os da planilha são normalizados ("47988299675").
  //    Uma busca .in('phone', phones) jamais casaria os dois formatos.
  const PAGE = 1000
  const allContacts: { id: string; name: string; phone: string }[] = []
  let from = 0
  while (true) {
    const { data } = await supabase
      .from('contacts')
      .select('id,name,phone')
      .range(from, from + PAGE - 1)
    if (!data || data.length === 0) break
    allContacts.push(...(data as { id: string; name: string; phone: string }[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  onProgress?.(20)

  // Mapa: phone normalizado → contact
  const phoneToContact = new Map<string, { id: string; name: string; phone: string }>()
  for (const c of allContacts) {
    const norm = normalizePhone(c.phone)
    if (norm) phoneToContact.set(norm, c)
  }

  const existingContacts  = phones
    .map(p => phoneToContact.get(p))
    .filter((c): c is { id: string; name: string; phone: string } => Boolean(c))
  const existingContactIds = [...new Set(existingContacts.map(c => c.id))]

  if (existingContactIds.length === 0) {
    onProgress?.(100)
    return {
      clean:         parsed.map(l => ({ ...l, conflicts: [], importDecision: true })),
      conflicted:    [],
      alreadyInList: 0,
      totalAnalyzed: parsed.length,
    }
  }

  // 2. Consultas paralelas em todas as entidades
  const [listMembers, campaignLeads, funnelLeads, salesRows] = await Promise.all([
    queryInChunks<{ contact_id: string; list_id: string; imported_at: string }>(
      'lead_list_members', 'contact_id', existingContactIds,
      'contact_id,list_id,imported_at'
    ),
    queryInChunks<{ phone: string; campaign_id: string; funnel_stage: string }>(
      'campaign_leads', 'phone', phones,
      'phone,campaign_id,funnel_stage'
    ),
    queryInChunks<{ contact_id: string; funnel_stage: string }>(
      'leads', 'contact_id', existingContactIds,
      'contact_id,funnel_stage',
    ),
    queryInChunks<{ client_id: string; date: string; property_name: string }>(
      'sales', 'client_id', existingContactIds,
      'client_id,date,property_name'
    ),
  ])
  onProgress?.(60)

  // 3. Buscar nomes das listas e campanhas
  const listIds      = [...new Set(listMembers.map(m => m.list_id))]
  const campaignIds  = [...new Set(campaignLeads.map(c => c.campaign_id))]

  const [lists, campaigns] = await Promise.all([
    queryInChunks<{ id: string; name: string }>('lead_lists',  'id', listIds,     'id,name'),
    queryInChunks<{ id: string; name: string }>('campaigns',   'id', campaignIds, 'id,name'),
  ])
  onProgress?.(80)

  const listMap     = new Map(lists.map(l    => [l.id,     l.name]))
  const campaignMap = new Map(campaigns.map(c => [c.id,    c.name]))

  // Índices por contact_id / phone
  const membersByContact  = new Map<string, { list_id: string; imported_at: string }[]>()
  listMembers.forEach(m => {
    const arr = membersByContact.get(m.contact_id) ?? []
    arr.push(m)
    membersByContact.set(m.contact_id, arr)
  })

  const campaignsByPhone = new Map<string, { campaign_id: string; funnel_stage: string }[]>()
  campaignLeads.forEach(cl => {
    const norm = normalizePhone(cl.phone) ?? cl.phone
    const arr  = campaignsByPhone.get(norm) ?? []
    arr.push(cl)
    campaignsByPhone.set(norm, arr)
  })

  const funnelByContact = new Map<string, string>()
  funnelLeads.forEach(l => { if (l.contact_id) funnelByContact.set(l.contact_id, l.funnel_stage) })

  const salesByContact = new Map<string, { date: string; propertyName: string }[]>()
  salesRows.forEach(s => {
    if (!s.client_id) return
    const arr = salesByContact.get(s.client_id) ?? []
    arr.push({ date: s.date, propertyName: s.property_name })
    salesByContact.set(s.client_id, arr)
  })

  // 4. Construir resultado por lead
  const clean:      AnalyzedLead[] = []
  const conflicted: AnalyzedLead[] = []
  let alreadyInList = 0

  for (const lead of parsed) {
    const contact   = phoneToContact.get(lead.phone)
    const conflicts: ConflictDetail[] = []
    let inThisList  = false

    if (contact) {
      // Memberships em listas
      for (const m of membersByContact.get(contact.id) ?? []) {
        if (m.list_id === currentListId) {
          inThisList = true
        } else {
          const listName = listMap.get(m.list_id) ?? 'Lista removida'
          const date     = new Date(m.imported_at).toLocaleDateString('pt-BR')
          conflicts.push({
            type:     'other_list',
            label:    `Lista: ${listName}`,
            subLabel: `Desde ${date}`,
            entityId: m.list_id,
          })
        }
      }

      // Campanhas (por phone normalizado)
      for (const cl of campaignsByPhone.get(lead.phone) ?? []) {
        const campaignName = campaignMap.get(cl.campaign_id) ?? 'Campanha removida'
        const stageLabel   = CAMPAIGN_STAGE_LABELS[cl.funnel_stage] ?? cl.funnel_stage
        conflicts.push({
          type:     'campaign',
          label:    `Campanha: ${campaignName}`,
          subLabel: `Etapa: ${stageLabel}`,
          entityId: cl.campaign_id,
        })
      }

      // Funil principal
      const funnelStage = funnelByContact.get(contact.id)
      if (funnelStage) {
        conflicts.push({
          type:     'funnel',
          label:    'Funil principal',
          subLabel: `Etapa: ${FUNNEL_LABELS[funnelStage] ?? funnelStage}`,
        })
      }

      // Cliente (comprou)
      for (const sale of salesByContact.get(contact.id) ?? []) {
        conflicts.push({
          type:     'client',
          label:    'Já é cliente',
          subLabel: `${sale.propertyName} — ${formatDate(sale.date)}`,
        })
      }
    }

    if (inThisList) {
      alreadyInList++
      continue
    }

    const analyzed: AnalyzedLead = {
      ...lead,
      existingContactId: contact?.id,
      existingName:      contact?.name,
      conflicts,
      // Clientes são desmarcados por padrão; o resto fica marcado
      importDecision: conflicts.length === 0 || !conflicts.some(c => c.type === 'client'),
    }

    if (conflicts.length > 0) {
      conflicted.push(analyzed)
    } else {
      clean.push(analyzed)
    }
  }

  onProgress?.(100)
  return { clean, conflicted, alreadyInList, totalAnalyzed: parsed.length }
}
