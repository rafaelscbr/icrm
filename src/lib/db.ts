import { supabase } from './supabase'
import {
  Contact, Property, Sale, Task, Goal, DailyLog, Campaign, CampaignLead,
  ContactTag, FunnelStage, LeadSituation,
} from '../types'

// ─── Row types (snake_case vindos do Supabase) ────────────────────────────────

interface ContactRow {
  id: string; name: string; phone: string
  company: string | null; birthdate: string | null; photo_url: string | null
  tags: string[]; has_children: boolean; children_names: string | null
  is_married: boolean; spouse_name: string | null
  created_at: string; updated_at: string
}

interface PropertyRow {
  id: string; kind: string; name: string; type: string; neighborhood: string
  value: number; status: string; owner_id: string | null
  development_name: string | null; images: string[]
  created_at: string; updated_at: string
}

interface SaleRow {
  id: string; client_id: string; property_id: string | null
  property_name: string; date: string; value: number; type: string
  notes: string | null; created_at: string
}

interface TaskRow {
  id: string; title: string; description: string | null
  due_date: string | null; due_time: string | null
  status: string; priority: string; category: string | null
  completed_at: string | null; contact_id: string | null
  property_id: string | null; google_event_id: string | null
  created_at: string; updated_at: string
}

interface GoalRow {
  id: string; name: string; category: string; target: number
  period: string; active: boolean; created_at: string; updated_at: string
}

interface DailyLogRow {
  id: string; date: string; new_leads: number; owner_calls: number
  funnel_followup: boolean; notes: string | null; closed: boolean
  closed_at: string | null; created_at: string; updated_at: string
}

interface CampaignRow {
  id: string; name: string; message: string; status: string
  created_at: string; updated_at: string
}

interface CampaignLeadRow {
  id: string; campaign_id: string; name: string; phone: string
  email: string | null; extra: string | null; funnel_stage: string
  situation: string | null; notes: string | null
  first_contact_at: string | null; proposal_value: number | null
  property_id: string | null; created_at: string; updated_at: string
}

// ─── Mappers: row → tipo do app ───────────────────────────────────────────────

function toContact(r: ContactRow): Contact {
  return {
    id: r.id, name: r.name, phone: r.phone,
    company: r.company ?? undefined, birthdate: r.birthdate ?? undefined,
    photoUrl: r.photo_url ?? undefined, tags: r.tags as ContactTag[],
    hasChildren: r.has_children, childrenNames: r.children_names ?? undefined,
    isMarried: r.is_married, spouseName: r.spouse_name ?? undefined,
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
    created_at: c.createdAt, updated_at: c.updatedAt,
  }
}

function toProperty(r: PropertyRow): Property {
  return {
    id: r.id, kind: r.kind as Property['kind'], name: r.name,
    type: r.type as Property['type'], neighborhood: r.neighborhood,
    value: r.value, status: r.status as Property['status'],
    ownerId: r.owner_id ?? undefined, developmentName: r.development_name ?? undefined,
    images: r.images ?? [], createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

function fromProperty(p: Property): PropertyRow {
  return {
    id: p.id, kind: p.kind, name: p.name, type: p.type,
    neighborhood: p.neighborhood, value: p.value, status: p.status,
    owner_id: p.ownerId ?? null, development_name: p.developmentName ?? null,
    images: p.images, created_at: p.createdAt, updated_at: p.updatedAt,
  }
}

function toSale(r: SaleRow): Sale {
  return {
    id: r.id, clientId: r.client_id, propertyId: r.property_id ?? undefined,
    propertyName: r.property_name, date: r.date, value: r.value,
    type: r.type as Sale['type'], notes: r.notes ?? undefined, createdAt: r.created_at,
  }
}

function fromSale(s: Sale): SaleRow {
  return {
    id: s.id, client_id: s.clientId, property_id: s.propertyId ?? null,
    property_name: s.propertyName, date: s.date, value: s.value,
    type: s.type, notes: s.notes ?? null, created_at: s.createdAt,
  }
}

function toTask(r: TaskRow): Task {
  return {
    id: r.id, title: r.title, description: r.description ?? undefined,
    dueDate: r.due_date ?? undefined, dueTime: r.due_time ?? undefined,
    status: r.status as Task['status'], priority: r.priority as Task['priority'],
    category: r.category as Task['category'] ?? undefined,
    completedAt: r.completed_at ?? undefined, contactId: r.contact_id ?? undefined,
    propertyId: r.property_id ?? undefined, googleEventId: r.google_event_id ?? undefined,
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
    period: g.period, active: g.active, created_at: g.createdAt, updated_at: g.updatedAt,
  }
}

function toDailyLog(r: DailyLogRow): DailyLog {
  return {
    id: r.id, date: r.date, newLeads: r.new_leads, ownerCalls: r.owner_calls,
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
    created_at: l.createdAt, updated_at: l.updatedAt,
  }
}

function toCampaign(r: CampaignRow): Campaign {
  return {
    id: r.id, name: r.name, message: r.message,
    status: r.status as Campaign['status'],
    createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

function fromCampaign(c: Campaign): CampaignRow {
  return {
    id: c.id, name: c.name, message: c.message, status: c.status,
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
    proposalValue: r.proposal_value ?? undefined, propertyId: r.property_id ?? undefined,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

function fromCampaignLead(l: CampaignLead): CampaignLeadRow {
  return {
    id: l.id, campaign_id: l.campaignId, name: l.name, phone: l.phone,
    email: l.email ?? null, extra: l.extra ?? null,
    funnel_stage: l.funnelStage, situation: l.situation ?? null,
    notes: l.notes ?? null, first_contact_at: l.firstContactAt ?? null,
    proposal_value: l.proposalValue ?? null, property_id: l.propertyId ?? null,
    created_at: l.createdAt, updated_at: l.updatedAt,
  }
}

// ─── Operações genéricas ──────────────────────────────────────────────────────

async function fetchAll<R, T>(table: string, mapper: (r: R) => T): Promise<T[]> {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as R[]).map(mapper)
}

async function upsertOne<R>(table: string, row: R): Promise<void> {
  const { error } = await supabase.from(table).upsert(row as object)
  if (error) throw error
}

async function deleteOne(table: string, id: string): Promise<void> {
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) throw error
}

// ─── API pública ──────────────────────────────────────────────────────────────

export const db = {
  contacts: {
    fetchAll: () => fetchAll<ContactRow, Contact>('contacts', toContact),
    upsert:   (c: Contact)  => upsertOne('contacts', fromContact(c)),
    delete:   (id: string)  => deleteOne('contacts', id),
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
    fetchAll: () => fetchAll<TaskRow, Task>('tasks', toTask),
    upsert:   (t: Task)     => upsertOne('tasks', fromTask(t)),
    delete:   (id: string)  => deleteOne('tasks', id),
  },

  goals: {
    fetchAll: () => fetchAll<GoalRow, Goal>('goals', toGoal),
    upsert:   (g: Goal)     => upsertOne('goals', fromGoal(g)),
    delete:   (id: string)  => deleteOne('goals', id),
  },

  dailyLogs: {
    fetchAll: () => fetchAll<DailyLogRow, DailyLog>('daily_logs', toDailyLog),
    upsert:   (l: DailyLog) => upsertOne('daily_logs', fromDailyLog(l)),
    delete:   (id: string)  => deleteOne('daily_logs', id),
  },

  campaigns: {
    fetchAll: () => fetchAll<CampaignRow, Campaign>('campaigns', toCampaign),
    upsert:   (c: Campaign) => upsertOne('campaigns', fromCampaign(c)),
    delete:   (id: string)  => deleteOne('campaigns', id),
  },

  campaignLeads: {
    fetchAll: () => fetchAll<CampaignLeadRow, CampaignLead>('campaign_leads', toCampaignLead),
    upsert:   (l: CampaignLead)   => upsertOne('campaign_leads', fromCampaignLead(l)),
    upsertMany: async (leads: CampaignLead[]) => {
      const { error } = await supabase
        .from('campaign_leads')
        .upsert(leads.map(fromCampaignLead))
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
  },
}
