import toast from 'react-hot-toast'
import { supabase } from './supabase'
import { getCurrentUserId, requireBrokerId } from './auth'
import { generateId } from './formatters'
import {
  Contact, Property, Sale, Task, Goal, DailyLog, Campaign, CampaignLead,
  ContactTag, FunnelStage, LeadSituation, Lead, LeadOrigin, LeadFunnelStage, LeadDiscardReason,
  LeadInteraction, LeadInteractionType, LeadInteractionOutcome,
  LeadConfigEntry, LeadConfigType, PermutaItem,
  AppNotification, NotificationType,
  LeadList, LeadListMember, CampaignList, LeadCampaignDispatch, BaseLeadProfile,
  CampaignParticipant, CampaignParticipantRole, CampaignActivity, CampaignActivityType,
} from '../types'

// ─── Row types — Base de Leads ────────────────────────────────────────────────

interface LeadListRow {
  id: string; name: string; description: string | null
  product_profile: BaseLeadProfile | null
  total_count: number; status: string
  broker_id: string | null
  created_at: string; updated_at: string
}

interface LeadListMemberRow {
  id: string; list_id: string; contact_id: string
  imported_at: string; import_batch: string | null; raw_phone: string | null
}

interface CampaignListRow {
  id: string; campaign_id: string; list_id: string; added_at: string
}

interface LeadCampaignDispatchRow {
  id: string; contact_id: string; campaign_id: string; list_id: string | null
  broker_id: string | null; dispatched_at: string; message_index: number | null
  channel: string; notes: string | null; warmup_score: number
}

function toLeadList(r: LeadListRow): LeadList {
  return {
    id: r.id, name: r.name, description: r.description ?? undefined,
    productProfile: r.product_profile ?? undefined,
    totalCount: r.total_count, status: r.status as LeadList['status'],
    brokerId: r.broker_id ?? undefined,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

function fromLeadList(l: LeadList): LeadListRow {
  return {
    id: l.id, name: l.name, description: l.description ?? null,
    product_profile: l.productProfile ?? null,
    total_count: l.totalCount, status: l.status,
    broker_id: l.brokerId ?? getCurrentUserId(),
    created_at: l.createdAt, updated_at: l.updatedAt,
  }
}

function toLeadListMember(r: LeadListMemberRow): LeadListMember {
  return {
    id: r.id, listId: r.list_id, contactId: r.contact_id,
    importedAt: r.imported_at,
    importBatch: r.import_batch ?? undefined, rawPhone: r.raw_phone ?? undefined,
  }
}

function toCampaignList(r: CampaignListRow): CampaignList {
  return { id: r.id, campaignId: r.campaign_id, listId: r.list_id, addedAt: r.added_at }
}

function toDispatch(r: LeadCampaignDispatchRow): LeadCampaignDispatch {
  return {
    id: r.id, contactId: r.contact_id, campaignId: r.campaign_id,
    listId: r.list_id ?? undefined, brokerId: r.broker_id ?? undefined,
    dispatchedAt: r.dispatched_at, messageIndex: r.message_index ?? undefined,
    channel: r.channel, notes: r.notes ?? undefined, warmupScore: r.warmup_score,
  }
}

// ─── Row types (snake_case vindos do Supabase) ────────────────────────────────

interface ContactRow {
  id: string; name: string; phone: string
  company: string | null; birthdate: string | null; photo_url: string | null
  tags: string[]; has_children: boolean; children_names: string | null
  is_married: boolean; spouse_name: string | null
  permuta_items: PermutaItem[] | null
  permuta_type: string | null
  permuta_property_region: string | null
  permuta_property_value: number | null
  permuta_car_model: string | null
  permuta_car_value: number | null
  is_base_lead: boolean
  base_lead_profile: BaseLeadProfile | null
  invalid_contact: boolean
  broker_id: string | null
  created_at: string; updated_at: string
}

interface PropertyRow {
  id: string; kind: string; name: string; type: string; neighborhood: string
  city: string | null; address: string | null; complement: string | null; unit: string | null
  bedrooms: number | null; suites: number | null
  area_sqm: number | null; condo_fee: number | null; notes: string | null
  value: number; status: string; owner_id: string | null
  development_name: string | null; images: string[]
  accepts_permuta: boolean; permuta_types: string[]; permuta_regions: string[]
  created_by_id: string | null
  created_at: string; updated_at: string
}

interface SaleRow {
  id: string; client_id: string; property_id: string | null
  property_name: string; date: string; value: number; type: string
  notes: string | null
  commission_pct: number | null; commission_fixed: number | null; broker_pct: number | null
  broker_id: string | null
  created_at: string
}

interface TaskRow {
  id: string; title: string; description: string | null
  due_date: string | null; due_time: string | null
  status: string; priority: string; category: string | null
  completed_at: string | null; contact_id: string | null
  property_id: string | null; google_event_id: string | null
  broker_id: string | null
  assigned_to_id: string | null   // delegação
  checklist: import('../types').ChecklistItem[] | null
  created_at: string; updated_at: string
}

interface GoalRow {
  id: string; name: string; category: string; target: number
  period: string; active: boolean
  broker_id: string | null
  created_at: string; updated_at: string
}

interface DailyLogRow {
  id: string; date: string; new_leads: number; owner_calls: number
  funnel_followup: boolean; notes: string | null; closed: boolean
  closed_at: string | null
  broker_id: string | null
  created_at: string; updated_at: string
}

interface CampaignRow {
  id: string; name: string; message: string; status: string
  messages: string[] | null
  average_ticket: number | null
  conversion_rates: Record<string, number> | null
  broker_id: string | null
  created_at: string; updated_at: string
}

interface CampaignLeadRow {
  id: string; campaign_id: string; name: string; phone: string
  email: string | null; extra: string | null; funnel_stage: string
  situation: string | null; notes: string | null
  first_contact_at: string | null; last_message: string | null
  message_index: number | null
  proposal_value: number | null
  property_id: string | null; stage_updated_at: string | null
  transferred_at: string | null; transferred_to_lead_id: string | null
  broker_id: string | null
  last_sent_by_id: string | null; last_sent_by_name: string | null; last_sent_at: string | null
  assigned_to_id: string | null; assigned_to_name: string | null
  dispatch_count: number
  created_at: string; updated_at: string
}

interface CampaignParticipantRow {
  id: string; campaign_id: string; broker_id: string; role: string; added_at: string
}

interface CampaignActivityRow {
  id: string; campaign_id: string
  lead_id: string | null; lead_name: string | null
  broker_id: string | null; broker_name: string | null
  action_type: string; metadata: Record<string, unknown> | null
  created_at: string
}

// ─── Mappers: row → tipo do app ───────────────────────────────────────────────

function toContact(r: ContactRow): Contact {
  // Prioriza novo campo JSONB; faz migração transparente dos campos legados
  let permutaItems: PermutaItem[] = []
  if (r.permuta_items && r.permuta_items.length > 0) {
    permutaItems = r.permuta_items
  } else if (r.permuta_type) {
    // migra dado antigo (campo único) para o novo formato (array)
    const legacy: PermutaItem = {
      id: `legacy-${r.id}`,
      type: r.permuta_type as 'imovel' | 'carro',
      region: r.permuta_property_region ?? undefined,
      value: r.permuta_property_value ?? undefined,
      carModel: r.permuta_car_model ?? undefined,
      carValue: r.permuta_car_value ?? undefined,
    }
    permutaItems = [legacy]
  }

  return {
    id: r.id, name: r.name, phone: r.phone,
    company: r.company ?? undefined, birthdate: r.birthdate ?? undefined,
    photoUrl: r.photo_url ?? undefined, tags: r.tags as ContactTag[],
    hasChildren: r.has_children, childrenNames: r.children_names ?? undefined,
    isMarried: r.is_married, spouseName: r.spouse_name ?? undefined,
    permutaItems,
    isBaseLead:      r.is_base_lead ?? undefined,
    baseLeadProfile: r.base_lead_profile ?? undefined,
    invalidContact:  r.invalid_contact ?? false,
    brokerId: r.broker_id ?? undefined,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

function fromContact(c: Contact): ContactRow {
  return {
    id: c.id, name: c.name, phone: c.phone,
    company: c.company ?? null, birthdate: c.birthdate ?? null,
    photo_url: c.photoUrl ?? null, tags: c.tags,
    has_children: c.hasChildren, children_names: c.childrenNames ?? null,
    is_married: c.isMarried, spouse_name: c.spouseName ?? null,
    permuta_items: c.permutaItems.length > 0 ? c.permutaItems : null,
    permuta_type: null,
    permuta_property_region: null,
    permuta_property_value: null,
    permuta_car_model: null,
    permuta_car_value: null,
    is_base_lead:      c.isBaseLead ?? false,
    base_lead_profile: c.baseLeadProfile ?? null,
    invalid_contact:   c.invalidContact ?? false,
    broker_id: c.brokerId ?? getCurrentUserId(),
    created_at: c.createdAt, updated_at: c.updatedAt,
  }
}

function toProperty(r: PropertyRow): Property {
  return {
    id: r.id, kind: r.kind as Property['kind'], name: r.name,
    type: r.type as Property['type'], neighborhood: r.neighborhood,
    city: r.city ?? undefined,
    address: r.address ?? undefined, complement: r.complement ?? undefined,
    unit: r.unit ?? undefined,
    bedrooms: r.bedrooms ?? undefined, suites: r.suites ?? undefined,
    areaSqm: r.area_sqm ?? undefined, condoFee: r.condo_fee ?? undefined,
    notes: r.notes ?? undefined,
    value: r.value, status: r.status as Property['status'],
    ownerId: r.owner_id ?? undefined, developmentName: r.development_name ?? undefined,
    images: r.images ?? [],
    acceptsPermuta: r.accepts_permuta ?? false,
    permutaTypes: (r.permuta_types ?? []) as Array<'imovel' | 'carro'>,
    permutaRegions: r.permuta_regions ?? [],
    createdById: r.created_by_id ?? undefined,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

function fromProperty(p: Property): PropertyRow {
  return {
    id: p.id, kind: p.kind, name: p.name, type: p.type,
    neighborhood: p.neighborhood, city: p.city ?? null,
    address: p.address ?? null, complement: p.complement ?? null, unit: p.unit ?? null,
    bedrooms: p.bedrooms ?? null, suites: p.suites ?? null,
    area_sqm: p.areaSqm ?? null, condo_fee: p.condoFee ?? null,
    notes: p.notes ?? null,
    value: p.value, status: p.status,
    owner_id: p.ownerId ?? null, development_name: p.developmentName ?? null,
    images: p.images,
    accepts_permuta: p.acceptsPermuta ?? false,
    permuta_types: p.permutaTypes ?? [],
    permuta_regions: p.permutaRegions ?? [],
    created_by_id: p.createdById ?? getCurrentUserId(),
    created_at: p.createdAt, updated_at: p.updatedAt,
  }
}

function toSale(r: SaleRow): Sale {
  return {
    id: r.id, clientId: r.client_id, propertyId: r.property_id ?? undefined,
    propertyName: r.property_name, date: r.date, value: r.value,
    type: r.type as Sale['type'], notes: r.notes ?? undefined,
    commissionPct:   r.commission_pct   ?? undefined,
    commissionFixed: r.commission_fixed ?? undefined,
    brokerPct:       r.broker_pct       ?? undefined,
    brokerId:        r.broker_id        ?? undefined,
    createdAt: r.created_at,
  }
}

function fromSale(s: Sale): SaleRow {
  return {
    id: s.id, client_id: s.clientId, property_id: s.propertyId ?? null,
    property_name: s.propertyName, date: s.date, value: s.value,
    type: s.type, notes: s.notes ?? null,
    commission_pct:   s.commissionPct   ?? null,
    commission_fixed: s.commissionFixed ?? null,
    broker_pct:       s.brokerPct       ?? null,
    // Respeita broker_id explícito (admin registrando venda de outro corretor)
    broker_id:        s.brokerId ?? getCurrentUserId(),
    created_at: s.createdAt,
  }
}

function toTask(r: TaskRow): Task {
  return {
    id: r.id, title: r.title, description: r.description ?? undefined,
    // Normaliza para YYYY-MM-DD — coluna pode ser date ou timestamp no banco
    dueDate: r.due_date ? r.due_date.split('T')[0] : undefined,
    dueTime: r.due_time ?? undefined,
    status: r.status as Task['status'], priority: r.priority as Task['priority'],
    category: r.category as Task['category'] ?? undefined,
    completedAt: r.completed_at ?? undefined, contactId: r.contact_id ?? undefined,
    propertyId: r.property_id ?? undefined, googleEventId: r.google_event_id ?? undefined,
    brokerId: r.broker_id ?? undefined,
    assignedToId: r.assigned_to_id ?? undefined,
    checklist: (r.checklist && r.checklist.length > 0) ? r.checklist : undefined,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

function fromTask(t: Task): TaskRow {
  return {
    id: t.id, title: t.title, description: t.description ?? null,
    due_date: t.dueDate ?? null, due_time: t.dueTime ?? null,
    status: t.status, priority: t.priority, category: t.category ?? null,
    completed_at: t.completedAt ?? null, contact_id: t.contactId ?? null,
    property_id: t.propertyId ?? null, google_event_id: t.googleEventId ?? null,
    broker_id: t.brokerId ?? getCurrentUserId(),
    assigned_to_id: t.assignedToId ?? null,
    checklist: t.checklist && t.checklist.length > 0 ? t.checklist : null,
    created_at: t.createdAt, updated_at: t.updatedAt,
  }
}

function toGoal(r: GoalRow): Goal {
  return {
    id: r.id, name: r.name, category: r.category as Goal['category'],
    target: r.target, period: r.period as Goal['period'],
    active: r.active, createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

function fromGoal(g: Goal): GoalRow {
  return {
    id: g.id, name: g.name, category: g.category, target: g.target,
    period: g.period, active: g.active,
    broker_id: requireBrokerId(),
    created_at: g.createdAt, updated_at: g.updatedAt,
  }
}

function toDailyLog(r: DailyLogRow): DailyLog {
  return {
    id: r.id,
    // Normaliza para YYYY-MM-DD independente do tipo da coluna no banco (date ou timestamp)
    date: r.date.split('T')[0],
    newLeads: r.new_leads, ownerCalls: r.owner_calls,
    funnelFollowup: r.funnel_followup, notes: r.notes ?? undefined,
    closed: r.closed, closedAt: r.closed_at ?? undefined,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

function fromDailyLog(l: DailyLog): DailyLogRow {
  return {
    id: l.id, date: l.date, new_leads: l.newLeads, owner_calls: l.ownerCalls,
    funnel_followup: l.funnelFollowup, notes: l.notes ?? null,
    closed: l.closed, closed_at: l.closedAt ?? null,
    broker_id: requireBrokerId(),
    created_at: l.createdAt, updated_at: l.updatedAt,
  }
}

function toCampaign(r: CampaignRow): Campaign {
  return {
    id: r.id, name: r.name, message: r.message,
    messages: r.messages ?? undefined,
    status: r.status as Campaign['status'],
    averageTicket: r.average_ticket ?? undefined,
    conversionRates: r.conversion_rates ?? undefined,
    brokerId:        r.broker_id        ?? undefined,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

function fromCampaign(c: Campaign): CampaignRow {
  return {
    id: c.id, name: c.name, message: c.message, status: c.status,
    messages: c.messages && c.messages.length > 0 ? c.messages : null,
    average_ticket: c.averageTicket ?? null,
    conversion_rates: c.conversionRates ?? null,
    broker_id: c.brokerId ?? getCurrentUserId(),
    created_at: c.createdAt, updated_at: c.updatedAt,
  }
}

function toCampaignLead(r: CampaignLeadRow): CampaignLead {
  return {
    id: r.id, campaignId: r.campaign_id, name: r.name, phone: r.phone,
    email: r.email ?? undefined, extra: r.extra ?? undefined,
    funnelStage: r.funnel_stage as FunnelStage,
    situation: (r.situation as LeadSituation) ?? undefined,
    notes: r.notes ?? undefined, firstContactAt: r.first_contact_at ?? undefined,
    lastMessage: r.last_message ?? undefined,
    messageIndex: r.message_index ?? undefined,
    proposalValue: r.proposal_value ?? undefined, propertyId: r.property_id ?? undefined,
    stageUpdatedAt: r.stage_updated_at ?? undefined,
    transferredAt: r.transferred_at ?? undefined,
    transferredToLeadId: r.transferred_to_lead_id ?? undefined,
    brokerId:       r.broker_id        ?? undefined,
    lastSentById:   r.last_sent_by_id  ?? undefined,
    lastSentByName: r.last_sent_by_name ?? undefined,
    lastSentAt:     r.last_sent_at     ?? undefined,
    assignedToId:   r.assigned_to_id   ?? undefined,
    assignedToName: r.assigned_to_name ?? undefined,
    dispatchCount:  r.dispatch_count   ?? 0,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

function fromCampaignLead(l: CampaignLead): CampaignLeadRow {
  return {
    id: l.id, campaign_id: l.campaignId, name: l.name, phone: l.phone,
    email: l.email ?? null, extra: l.extra ?? null,
    funnel_stage: l.funnelStage, situation: l.situation ?? null,
    notes: l.notes ?? null, first_contact_at: l.firstContactAt ?? null,
    last_message: l.lastMessage ?? null,
    message_index: l.messageIndex ?? null,
    proposal_value: l.proposalValue ?? null, property_id: l.propertyId ?? null,
    stage_updated_at: l.stageUpdatedAt ?? null,
    transferred_at: l.transferredAt ?? null,
    transferred_to_lead_id: l.transferredToLeadId ?? null,
    broker_id:         l.brokerId       ?? getCurrentUserId(),
    last_sent_by_id:   l.lastSentById   ?? null,
    last_sent_by_name: l.lastSentByName ?? null,
    last_sent_at:      l.lastSentAt     ?? null,
    assigned_to_id:    l.assignedToId   ?? null,
    assigned_to_name:  l.assignedToName ?? null,
    dispatch_count:    l.dispatchCount  ?? 0,
    created_at: l.createdAt, updated_at: l.updatedAt,
  }
}

function toCampaignParticipant(r: CampaignParticipantRow): CampaignParticipant {
  return {
    id: r.id, campaignId: r.campaign_id,
    brokerId: r.broker_id, role: r.role as CampaignParticipantRole,
    addedAt: r.added_at,
  }
}

function toCampaignActivity(r: CampaignActivityRow): CampaignActivity {
  return {
    id: r.id, campaignId: r.campaign_id,
    leadId:     r.lead_id     ?? undefined,
    leadName:   r.lead_name   ?? undefined,
    brokerId:   r.broker_id   ?? undefined,
    brokerName: r.broker_name ?? undefined,
    actionType: r.action_type as CampaignActivityType,
    metadata:   r.metadata    ?? undefined,
    createdAt:  r.created_at,
  }
}

interface LeadRow {
  id: string; name: string; phone: string; email: string | null
  origin: string; funnel_stage: string; followup_step: number
  discard_reason: string | null; discarded_at: string | null
  property_id: string | null; property_name: string | null; average_ticket: number | null
  contact_id: string | null; converted_at: string | null; visita_task_id: string | null
  flagged: boolean | null
  notes: string | null
  // Permuta
  permuta_type: string | null
  permuta_property_region: string | null
  permuta_property_value: number | null
  permuta_car_model: string | null
  permuta_car_value: number | null
  // Radar
  radar_property_type: string | null
  radar_region: string | null
  radar_value_min: number | null
  radar_value_max: number | null
  radar_area_min: number | null
  radar_bedrooms: number | null
  kanban_order: number | null
  stage_changed_at: string | null
  first_contact_at?: string | null
  sla_due_at?: string | null
  broker_id: string | null
  created_at: string; updated_at: string
}

function toLead(r: LeadRow): Lead {
  return {
    id: r.id, name: r.name, phone: r.phone, email: r.email ?? undefined,
    origin: r.origin as LeadOrigin, funnelStage: r.funnel_stage as LeadFunnelStage,
    followupStep: r.followup_step,
    discardReason: (r.discard_reason as LeadDiscardReason) ?? undefined,
    discardedAt: r.discarded_at ?? undefined,
    propertyId: r.property_id ?? undefined, propertyName: r.property_name ?? undefined,
    averageTicket: r.average_ticket ?? undefined,
    contactId: r.contact_id ?? undefined, convertedAt: r.converted_at ?? undefined,
    visitaTaskId: r.visita_task_id ?? undefined,
    flagged: r.flagged ?? undefined,
    notes: r.notes ?? undefined,
    permutaType: (r.permuta_type as Lead['permutaType']) ?? undefined,
    permutaPropertyRegion: r.permuta_property_region ?? undefined,
    permutaPropertyValue: r.permuta_property_value ?? undefined,
    permutaCarModel: r.permuta_car_model ?? undefined,
    permutaCarValue: r.permuta_car_value ?? undefined,
    radarPropertyType: r.radar_property_type ?? undefined,
    radarRegion: r.radar_region ?? undefined,
    radarValueMin: r.radar_value_min ?? undefined,
    radarValueMax: r.radar_value_max ?? undefined,
    radarAreaMin: r.radar_area_min ?? undefined,
    radarBedrooms: r.radar_bedrooms ?? undefined,
    kanbanOrder: r.kanban_order ?? undefined,
    stageChangedAt: r.stage_changed_at ?? undefined,
    firstContactAt: r.first_contact_at ?? undefined,
    slaDueAt: r.sla_due_at ?? undefined,
    brokerId:       r.broker_id ?? undefined,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

function fromLead(l: Lead): LeadRow {
  return {
    id: l.id, name: l.name, phone: l.phone, email: l.email ?? null,
    origin: l.origin, funnel_stage: l.funnelStage, followup_step: l.followupStep,
    discard_reason: l.discardReason ?? null, discarded_at: l.discardedAt ?? null,
    property_id: l.propertyId ?? null, property_name: l.propertyName ?? null,
    average_ticket: l.averageTicket ?? null,
    contact_id: l.contactId ?? null, converted_at: l.convertedAt ?? null,
    visita_task_id: l.visitaTaskId ?? null,
    flagged: l.flagged ?? null,
    notes: l.notes ?? null,
    permuta_type: l.permutaType ?? null,
    permuta_property_region: l.permutaPropertyRegion ?? null,
    permuta_property_value: l.permutaPropertyValue ?? null,
    permuta_car_model: l.permutaCarModel ?? null,
    permuta_car_value: l.permutaCarValue ?? null,
    radar_property_type: l.radarPropertyType ?? null,
    radar_region: l.radarRegion ?? null,
    radar_value_min: l.radarValueMin ?? null,
    radar_value_max: l.radarValueMax ?? null,
    radar_area_min: l.radarAreaMin ?? null,
    radar_bedrooms: l.radarBedrooms ?? null,
    kanban_order: l.kanbanOrder ?? null,
    stage_changed_at: l.stageChangedAt ?? null,
    broker_id: l.brokerId ?? getCurrentUserId(),
    created_at: l.createdAt, updated_at: l.updatedAt,
  }
}

interface LeadInteractionRow {
  id:            string
  lead_id:       string
  type:          string
  description:   string | null
  outcome:       string | null
  interacted_at: string
  broker_id:     string | null
  created_at:    string
}

function toLeadInteraction(r: LeadInteractionRow): LeadInteraction {
  return {
    id:           r.id,
    leadId:       r.lead_id,
    type:         r.type as LeadInteractionType,
    description:  r.description ?? undefined,
    outcome:      r.outcome ? (r.outcome as LeadInteractionOutcome) : undefined,
    interactedAt: r.interacted_at,
    createdAt:    r.created_at,
    brokerId:     r.broker_id ?? undefined,
  }
}

function fromLeadInteraction(i: LeadInteraction): LeadInteractionRow {
  return {
    id:            i.id,
    lead_id:       i.leadId,
    type:          i.type,
    description:   i.description ?? null,
    outcome:       i.outcome ?? null,
    interacted_at: i.interactedAt,
    broker_id:     requireBrokerId(),
    created_at:    i.createdAt,
  }
}

// ─── Operações genéricas ──────────────────────────────────────────────────────

// Timeout nas leituras: após a aba ficar suspensa, requests podem ficar pendurados
// para sempre (lock interno do supabase-js) — sem timeout, o inflightLoad dos
// stores nunca resolve e o app inteiro para de responder até um F5 manual.
const READ_TIMEOUT_MS = 30_000

async function fetchAll<R, T>(table: string, mapper: (r: R) => T): Promise<T[]> {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .order('created_at', { ascending: false })
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS))
  if (error) {
    toast.error(`Erro ao carregar ${table}: ${error.message}`)
    throw error
  }
  return (data as R[]).map(mapper)
}

// Busca apenas linhas alteradas desde a marca d'água — base do sync incremental.
// Pagina sequencialmente; na prática o delta tem poucas linhas (1 página).
async function fetchSince<R, T>(table: string, sinceIso: string, mapper: (r: R) => T): Promise<T[]> {
  const PAGE = 1000
  const rows: R[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .gt('updated_at', sinceIso)
      .order('updated_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
      .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS))
    if (error) {
      toast.error(`Erro ao sincronizar ${table}: ${error.message}`)
      throw error
    }
    rows.push(...(data as R[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return rows.map(mapper)
}

// Paginação automática para tabelas grandes (ex: campaign_leads com 14000+ registros)
// O Supabase retorna no máximo 1000 linhas por request. Buscar página a página em
// sequência travava a dashboard por ~1s por página — aqui contamos o total primeiro
// e baixamos todas as páginas em paralelo.
async function fetchAllPaginated<R, T>(table: string, mapper: (r: R) => T): Promise<T[]> {
  const PAGE = 1000

  const { count, error: countError } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS))
  if (countError) {
    toast.error(`Erro ao carregar ${table}: ${countError.message}`)
    throw countError
  }

  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE))
  const responses = await Promise.all(
    Array.from({ length: pages }, (_, i) =>
      supabase
        .from(table)
        .select('*')
        // Ordenação dupla garante estabilidade quando created_at é idêntico
        // (comum em imports em massa). Sem isso, range() pode trazer o mesmo
        // registro em duas páginas diferentes.
        .order('created_at', { ascending: false })
        .order('id',         { ascending: true  })
        .range(i * PAGE, (i + 1) * PAGE - 1)
        .abortSignal(AbortSignal.timeout(READ_TIMEOUT_MS))
    )
  )

  const result: T[] = []
  for (const { data, error } of responses) {
    if (error) {
      toast.error(`Erro ao carregar ${table}: ${error.message}`)
      throw error
    }
    result.push(...(data as R[]).map(mapper))
  }

  // Remove duplicatas remanescentes (segurança extra)
  const seen = new Set<string>()
  return result.filter(item => {
    const id = (item as { id: string }).id
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

// Garante sessão válida antes de qualquer escrita. getSession() renova o token
// automaticamente se expirado (comum após a aba ficar muito tempo inativa).
// Com timeout: getSession() pode travar para sempre após suspensão da aba —
// sem ele, todo clique de salvar ficava pendurado sem erro nem resposta.
async function ensureFreshSession(): Promise<void> {
  const result = await Promise.race([
    supabase.auth.getSession(),
    new Promise<'hang'>(resolve => setTimeout(() => resolve('hang'), 10_000)),
  ])
  if (result === 'hang') {
    toast.error('Conexão com a sessão travada. Recarregue a página (F5) para continuar.')
    throw new Error('getSession travado — provável lock após inatividade')
  }
  const { data, error } = result
  if (error || !data.session) {
    toast.error('Sessão expirada. Faça login novamente para continuar.')
    throw error ?? new Error('Sessão ausente')
  }
}

function isJwtError(error: { message?: string; code?: string }): boolean {
  return error.code === 'PGRST301' || /jwt|expired|token/i.test(error.message ?? '')
}

async function upsertOne<R>(table: string, row: R): Promise<void> {
  await ensureFreshSession()
  let { error } = await supabase
    .from(table)
    .upsert(row as object, { onConflict: 'id' })
  // Token pode ter vencido entre o check e o write — renova uma vez e repete
  if (error && isJwtError(error)) {
    const { error: refreshErr } = await supabase.auth.refreshSession()
    if (!refreshErr) {
      ;({ error } = await supabase.from(table).upsert(row as object, { onConflict: 'id' }))
    }
  }
  if (error) {
    toast.error(`Erro ao salvar em ${table}: ${error.message}`)
    throw error
  }
}

async function deleteOne(table: string, id: string): Promise<void> {
  await ensureFreshSession()
  let { error } = await supabase.from(table).delete().eq('id', id)
  if (error && isJwtError(error)) {
    const { error: refreshErr } = await supabase.auth.refreshSession()
    if (!refreshErr) {
      ;({ error } = await supabase.from(table).delete().eq('id', id))
    }
  }
  if (error) {
    toast.error(`Erro ao excluir em ${table}: ${error.message}`)
    throw error
  }
}

// ─── API pública ──────────────────────────────────────────────────────────────

export const db = {
  contacts: {
    fetchAll:   () => fetchAllPaginated<ContactRow, Contact>('contacts', toContact),
    fetchSince: (sinceIso: string) => fetchSince<ContactRow, Contact>('contacts', sinceIso, toContact),
    upsert:     (c: Contact)  => upsertOne('contacts', fromContact(c)),
    delete:     (id: string)  => deleteOne('contacts', id),
  },

  properties: {
    fetchAll: () => fetchAll<PropertyRow, Property>('properties', toProperty),
    upsert:   (p: Property) => upsertOne('properties', fromProperty(p)),
    delete:   (id: string)  => deleteOne('properties', id),
  },

  sales: {
    fetchAll: () => fetchAll<SaleRow, Sale>('sales', toSale),
    upsert:   (s: Sale)     => upsertOne('sales', fromSale(s)),
    delete:   (id: string)  => deleteOne('sales', id),
  },

  tasks: {
    fetchAll: async (): Promise<Task[]> => {
      const tasks = await fetchAll<TaskRow, Task>('tasks', toTask)
      if (tasks.length === 0) return tasks

      // Busca participantes de todas as tarefas carregadas e mescla
      const taskIds = tasks.map(t => t.id)
      const { data: parts } = await supabase
        .from('task_participants')
        .select('task_id, user_id')
        .in('task_id', taskIds)

      const partMap: Record<string, string[]> = {}
      for (const p of (parts ?? [])) {
        const tid = p.task_id as string
        if (!partMap[tid]) partMap[tid] = []
        partMap[tid].push(p.user_id as string)
      }

      return tasks.map(t => ({
        ...t,
        participants: partMap[t.id] ?? [],
      }))
    },

    upsert: (t: Task) => upsertOne('tasks', fromTask(t)),
    delete: (id: string) => deleteOne('tasks', id),

    /**
     * Substitui a lista de participantes de uma tarefa.
     * Deleta todos os registros existentes e insere os novos.
     * Só o criador (broker_id) pode gerenciar participantes (garantido por RLS).
     */
    setParticipants: async (taskId: string, userIds: string[]): Promise<void> => {
      // Remove participantes anteriores
      const { error: delErr } = await supabase
        .from('task_participants')
        .delete()
        .eq('task_id', taskId)
      if (delErr) throw delErr

      if (userIds.length === 0) return

      const now = new Date().toISOString()
      const { error: insErr } = await supabase
        .from('task_participants')
        .insert(userIds.map(uid => ({ task_id: taskId, user_id: uid, added_at: now })))
      if (insErr) throw insErr
    },
  },

  goals: {
    fetchAll: () => fetchAll<GoalRow, Goal>('goals', toGoal),
    fetchForBroker: async (brokerId: string): Promise<Goal[]> => {
      const { data, error } = await supabase.from('goals').select('*').eq('broker_id', brokerId).order('created_at')
      if (error) { toast.error(`Erro ao carregar metas: ${error.message}`); throw error }
      return (data as GoalRow[]).map(toGoal)
    },
    upsert: (g: Goal, brokerId?: string) => {
      const row = fromGoal(g)
      return upsertOne('goals', brokerId ? { ...row, broker_id: brokerId } : row)
    },
    delete:   (id: string)  => deleteOne('goals', id),
  },

  dailyLogs: {
    fetchAll: () => fetchAll<DailyLogRow, DailyLog>('daily_logs', toDailyLog),
    upsert: async (l: DailyLog) => {
      // O banco tem UNIQUE constraint em "date" (daily_logs_date_key).
      // onConflict: 'date' garante que se já existe um registro para esse dia,
      // ele é atualizado em vez de tentar inserir um novo (que violaria a constraint).
      const { error } = await supabase
        .from('daily_logs')
        .upsert(fromDailyLog(l), { onConflict: 'date,broker_id' })
      if (error) {
        toast.error(`Erro ao salvar em daily_logs: ${error.message}`)
        throw error
      }
    },
    delete: (id: string) => deleteOne('daily_logs', id),
  },

  campaigns: {
    fetchAll: () => fetchAll<CampaignRow, Campaign>('campaigns', toCampaign),
    upsert:   (c: Campaign) => upsertOne('campaigns', fromCampaign(c)),
    updateRow: async (c: Campaign) => {
      const { error } = await supabase
        .from('campaigns')
        .update(fromCampaign(c))
        .eq('id', c.id)
      if (error) throw error
    },
    delete:   (id: string)  => deleteOne('campaigns', id),
  },

  leads: {
    fetchAll: () => fetchAll<LeadRow, Lead>('leads', toLead),
    upsert:   (l: Lead) => upsertOne('leads', fromLead(l)),
    delete:   (id: string) => deleteOne('leads', id),
    // Transferência manual — RPC SECURITY DEFINER valida dono/admin e grava
    // auditoria (lead_assignments), interação e notificação numa transação
    transfer: async (leadId: string, toBrokerId: string): Promise<void> => {
      const { error } = await supabase.rpc('transfer_lead', {
        p_lead_id: leadId, p_to_broker: toBrokerId,
      })
      if (error) {
        toast.error(`Erro ao transferir lead: ${error.message}`)
        throw error
      }
    },
  },

  leadInteractions: {
    fetchForLead: async (leadId: string): Promise<LeadInteraction[]> => {
      const { data, error } = await supabase
        .from('lead_interactions')
        .select('*')
        .eq('lead_id', leadId)
        .order('interacted_at', { ascending: false })
      if (error) {
        toast.error(`Erro ao carregar interações: ${error.message}`)
        throw error
      }
      return (data as LeadInteractionRow[]).map(toLeadInteraction)
    },
    fetchAll: async (): Promise<LeadInteraction[]> => {
      const { data, error } = await supabase
        .from('lead_interactions')
        .select('*')
        .order('interacted_at', { ascending: false })
      if (error) {
        toast.error(`Erro ao carregar interações: ${error.message}`)
        throw error
      }
      return (data as LeadInteractionRow[]).map(toLeadInteraction)
    },
    upsert: (i: LeadInteraction) => upsertOne('lead_interactions', fromLeadInteraction(i)),
    delete: (id: string)         => deleteOne('lead_interactions', id),
  },

  leadConfig: {
    fetchAll: async (): Promise<LeadConfigEntry[]> => {
      const { data, error } = await supabase
        .from('lead_config')
        .select('*')
        .order('display_order')
      if (error) throw error
      return (data as Array<{
        id: string; type: string; slug: string; label: string
        emoji: string | null; color: string | null; display_order: number
        active: boolean; created_at: string; updated_at: string
      }>).map(r => ({
        id: r.id, type: r.type as LeadConfigType, slug: r.slug, label: r.label,
        emoji: r.emoji ?? undefined, color: r.color ?? undefined,
        displayOrder: r.display_order, active: r.active,
        createdAt: r.created_at, updatedAt: r.updated_at,
      }))
    },
    upsert: async (e: LeadConfigEntry): Promise<void> => {
      const { error } = await supabase.from('lead_config').upsert({
        id: e.id, type: e.type, slug: e.slug, label: e.label,
        emoji: e.emoji ?? null, color: e.color ?? null,
        display_order: e.displayOrder, active: e.active,
        updated_at: new Date().toISOString(),
      })
      if (error) throw error
    },
    delete: (id: string) => deleteOne('lead_config', id),
  },

  notifications: {
    fetchForUser: async (userId: string): Promise<AppNotification[]> => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data as Array<{
        id: string; user_id: string; type: string; title: string
        body: string | null; resource_id: string | null; resource_type: string | null
        read: boolean; created_at: string
      }>).map(r => ({
        id: r.id, userId: r.user_id, type: r.type as NotificationType,
        title: r.title, body: r.body ?? undefined,
        resourceId: r.resource_id ?? undefined, resourceType: r.resource_type ?? undefined,
        read: r.read, createdAt: r.created_at,
      }))
    },
    markRead: async (id: string) => {
      const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id)
      if (error) throw error
    },
    markAllRead: async (userId: string) => {
      const { error } = await supabase
        .from('notifications').update({ read: true })
        .eq('user_id', userId).eq('read', false)
      if (error) throw error
    },
  },

  leadLists: {
    fetchAll: () => fetchAll<LeadListRow, LeadList>('lead_lists', toLeadList),
    upsert:   (l: LeadList) => upsertOne('lead_lists', fromLeadList(l)),
    delete:   (id: string)  => deleteOne('lead_lists', id),
    updateCount: async (id: string, count: number) => {
      const { error } = await supabase
        .from('lead_lists').update({ total_count: count, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
  },

  leadListMembers: {
    fetchForList: async (listId: string): Promise<LeadListMember[]> => {
      const PAGE = 1000
      const result: LeadListMemberRow[] = []
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from('lead_list_members').select('*').eq('list_id', listId)
          .order('imported_at', { ascending: false }).range(from, from + PAGE - 1)
        if (error) { toast.error('Erro ao carregar membros'); throw error }
        result.push(...(data as LeadListMemberRow[]))
        if (data.length < PAGE) break
        from += PAGE
      }
      return result.map(toLeadListMember)
    },
    fetchForContact: async (contactId: string): Promise<LeadListMember[]> => {
      const { data, error } = await supabase
        .from('lead_list_members').select('*').eq('contact_id', contactId)
        .order('imported_at', { ascending: false })
      if (error) throw error
      return (data as LeadListMemberRow[]).map(toLeadListMember)
    },
    insertMany: async (members: Omit<LeadListMember, 'id' | 'importedAt'>[]) => {
      const rows = members.map(m => ({
        list_id: m.listId, contact_id: m.contactId,
        import_batch: m.importBatch ?? null, raw_phone: m.rawPhone ?? null,
      }))
      // upsert com onConflict ignora duplicatas na mesma lista
      const { error } = await supabase
        .from('lead_list_members').upsert(rows, { onConflict: 'list_id,contact_id', ignoreDuplicates: true })
      if (error) throw error
    },
    checkExisting: async (contactIds: string[], listId: string): Promise<string[]> => {
      const CHUNK = 500
      const result: string[] = []
      for (let i = 0; i < contactIds.length; i += CHUNK) {
        const chunk = contactIds.slice(i, i + CHUNK)
        const { data, error } = await supabase
          .from('lead_list_members').select('contact_id').eq('list_id', listId)
          .in('contact_id', chunk)
        if (error) throw error
        result.push(...(data as { contact_id: string }[]).map(r => r.contact_id))
      }
      return result
    },
  },

  campaignLists: {
    fetchAll: () => fetchAll<CampaignListRow, CampaignList>('campaign_lists', toCampaignList),
    fetchForCampaign: async (campaignId: string): Promise<CampaignList[]> => {
      const { data, error } = await supabase
        .from('campaign_lists').select('*').eq('campaign_id', campaignId)
        .order('added_at')
      if (error) throw error
      return (data as CampaignListRow[]).map(toCampaignList)
    },
    upsert: (cl: CampaignList) => upsertOne('campaign_lists', {
      id: cl.id, campaign_id: cl.campaignId, list_id: cl.listId, added_at: cl.addedAt,
    }),
    delete: (id: string) => deleteOne('campaign_lists', id),
    deleteForCampaign: async (campaignId: string) => {
      const { error } = await supabase.from('campaign_lists').delete().eq('campaign_id', campaignId)
      if (error) throw error
    },
  },

  dispatches: {
    fetchForContact: async (contactId: string): Promise<LeadCampaignDispatch[]> => {
      const { data, error } = await supabase
        .from('lead_campaign_dispatches').select('*').eq('contact_id', contactId)
        .order('dispatched_at', { ascending: false })
      if (error) throw error
      return (data as LeadCampaignDispatchRow[]).map(toDispatch)
    },
    insert: async (d: Omit<LeadCampaignDispatch, 'id' | 'dispatchedAt' | 'warmupScore'>) => {
      const { error } = await supabase.from('lead_campaign_dispatches').insert({
        contact_id: d.contactId, campaign_id: d.campaignId,
        list_id: d.listId ?? null, broker_id: d.brokerId ?? getCurrentUserId(),
        message_index: d.messageIndex ?? null, channel: d.channel,
        notes: d.notes ?? null, warmup_score: 0,
      })
      if (error) throw error
    },
    fetchForCampaign: async (campaignId: string): Promise<LeadCampaignDispatch[]> => {
      const { data, error } = await supabase
        .from('lead_campaign_dispatches').select('*').eq('campaign_id', campaignId)
        .order('dispatched_at', { ascending: false })
      if (error) throw error
      return (data as LeadCampaignDispatchRow[]).map(toDispatch)
    },
  },

  campaignLeads: {
    fetchAll:   () => fetchAllPaginated<CampaignLeadRow, CampaignLead>('campaign_leads', toCampaignLead),
    fetchSince: (sinceIso: string) => fetchSince<CampaignLeadRow, CampaignLead>('campaign_leads', sinceIso, toCampaignLead),
    // upsert: usado apenas para INSERÇÃO de novas linhas (addBulk/add)
    upsert:   (l: CampaignLead)   => upsertOne('campaign_leads', fromCampaignLead(l)),
    // updateRow: usado para ATUALIZAR linhas existentes — usa .update() que tem
    // comportamento RLS mais confiável que upsert (INSERT ON CONFLICT DO UPDATE)
    // quando o broker_id da linha é diferente do auth.uid() do corretor.
    // Usa .select('id') para detectar 0 linhas afetadas (falha silenciosa de RLS).
    updateRow: async (l: CampaignLead) => {
      const row = fromCampaignLead(l)
      const { data, error } = await supabase
        .from('campaign_leads')
        .update(row)
        .eq('id', l.id)
        .select('id')
      if (error) throw error
      if (!data || data.length === 0) {
        throw new Error(`Sem permissão para atualizar lead ${l.id} — verifique autenticação`)
      }
    },
    upsertMany: async (leads: CampaignLead[]) => {
      const { error } = await supabase
        .from('campaign_leads')
        .upsert(leads.map(fromCampaignLead), { onConflict: 'id' })
      if (error) throw error
    },
    delete:   (id: string)        => deleteOne('campaign_leads', id),
    deleteForCampaign: async (campaignId: string) => {
      const { error } = await supabase
        .from('campaign_leads')
        .delete()
        .eq('campaign_id', campaignId)
      if (error) throw error
    },
    transferBroker: async (campaignId: string, brokerId: string | null) => {
      // updated_at marca a transferência para o sync incremental dos outros usuários
      const { error } = await supabase
        .from('campaign_leads')
        .update({ broker_id: brokerId ?? getCurrentUserId(), updated_at: new Date().toISOString() })
        .eq('campaign_id', campaignId)
      if (error) throw error
    },
  },

  campaignParticipants: {
    fetchForCampaign: async (campaignId: string): Promise<CampaignParticipant[]> => {
      const { data, error } = await supabase
        .from('campaign_participants').select('*').eq('campaign_id', campaignId)
      if (error) throw error
      return (data as CampaignParticipantRow[]).map(toCampaignParticipant)
    },
    upsert: async (p: CampaignParticipant): Promise<void> => {
      const { error } = await supabase.from('campaign_participants').upsert({
        id: p.id, campaign_id: p.campaignId, broker_id: p.brokerId,
        role: p.role, added_at: p.addedAt,
      }, { onConflict: 'id' })
      if (error) throw error
    },
    delete: async (id: string): Promise<void> => {
      const { error } = await supabase.from('campaign_participants').delete().eq('id', id)
      if (error) throw error
    },
  },

  weekSnapshots: {
    fetchForBroker: async (brokerId: string): Promise<import('../types').WeekSnapshot[]> => {
      const { data, error } = await supabase
        .from('week_snapshots')
        .select('*')
        .eq('broker_id', brokerId)
        .order('week_start', { ascending: false })
      if (error) throw error
      return (data as Array<{
        id: string; week_start: string; week_end: string
        entries: import('../types').WeekSnapshotEntry[]; score: number; saved_at: string
      }>).map(r => ({
        id: r.id, weekStart: r.week_start, weekEnd: r.week_end,
        entries: r.entries, score: r.score, savedAt: r.saved_at,
      }))
    },
    upsert: async (snap: import('../types').WeekSnapshot, brokerId: string): Promise<void> => {
      const { error } = await supabase.from('week_snapshots').upsert({
        id: snap.id, week_start: snap.weekStart, week_end: snap.weekEnd,
        entries: snap.entries, score: snap.score, saved_at: snap.savedAt,
        broker_id: brokerId,
      }, { onConflict: 'week_start,broker_id' })
      if (error) throw error
    },
    fetchForAdmin: async (): Promise<Array<import('../types').WeekSnapshot & { brokerId: string }>> => {
      const { data, error } = await supabase
        .from('week_snapshots')
        .select('*')
        .order('week_start', { ascending: false })
      if (error) throw error
      return (data as Array<{
        id: string; week_start: string; week_end: string
        entries: import('../types').WeekSnapshotEntry[]; score: number; saved_at: string; broker_id: string
      }>).map(r => ({
        id: r.id, weekStart: r.week_start, weekEnd: r.week_end,
        entries: r.entries, score: r.score, savedAt: r.saved_at, brokerId: r.broker_id,
      }))
    },
  },

  campaignActivity: {
    // Todas as campanhas — alimenta a contagem de performance por corretor
    // (RLS: corretor enxerga só as próprias atividades; admin enxerga tudo)
    fetchAll: async (limit = 5000): Promise<CampaignActivity[]> => {
      const { data, error } = await supabase
        .from('campaign_activity_log').select('*')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data as CampaignActivityRow[]).map(toCampaignActivity)
    },
    fetchForCampaign: async (campaignId: string, limit = 500, since?: string): Promise<CampaignActivity[]> => {
      let q = supabase
        .from('campaign_activity_log').select('*')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (since) q = q.gte('created_at', since)
      const { data, error } = await q
      if (error) throw error
      return (data as CampaignActivityRow[]).map(toCampaignActivity)
    },
    insert: async (a: Omit<CampaignActivity, 'createdAt'>): Promise<void> => {
      const { error } = await supabase.from('campaign_activity_log').insert({
        id: a.id, campaign_id: a.campaignId,
        lead_id:    a.leadId    ?? null,
        lead_name:  a.leadName  ?? null,
        broker_id:  a.brokerId  ?? getCurrentUserId(),
        broker_name: a.brokerName ?? null,
        action_type: a.actionType,
        metadata:    a.metadata ?? null,
      })
      if (error) throw error
    },
  },
}

// ─── Helpers autônomos ────────────────────────────────────────────────────────

/**
 * Registra um follow-up no histórico do contato em `lead_campaign_dispatches`.
 * Best-effort: retorna silenciosamente se o contato não for encontrado pelo telefone.
 * Nunca lança exceção — o disparo principal não deve ser bloqueado por isso.
 */
export async function saveFollowupToContact(params: {
  phone:      string
  campaignId: string
  brokerId:   string
  step:       number   // 0-based, igual a messageIndex
}): Promise<void> {
  // Normaliza o telefone para busca (apenas dígitos)
  const digits = params.phone.replace(/\D/g, '')

  // Tenta localizar o contato por telefone (ignora não encontrado)
  const { data: contact } = await supabase
    .from('contacts')
    .select('id')
    .or(`phone.eq.${params.phone},phone.eq.${digits}`)
    .maybeSingle()

  if (!contact) return

  await supabase.from('lead_campaign_dispatches').insert({
    id:            generateId(),
    contact_id:    contact.id,
    campaign_id:   params.campaignId,
    list_id:       null,
    broker_id:     params.brokerId,
    dispatched_at: new Date().toISOString(),
    message_index: params.step,
    channel:       'whatsapp',
    notes:         `Follow-up ${params.step + 1}/5`,
    warmup_score:  0,
  })
  // Erro silencioso — não bloqueia o fluxo de disparo
}
