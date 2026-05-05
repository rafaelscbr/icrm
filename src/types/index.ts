export type ContactTag = 'owner' | 'investor' | 'buyer'

export interface Contact {
  id: string
  name: string
  phone: string
  company?: string
  birthdate?: string
  photoUrl?: string
  tags: ContactTag[]
  hasChildren: boolean
  childrenNames?: string
  isMarried: boolean
  spouseName?: string
  createdAt: string
  updatedAt: string
}

export type PropertyType   = 'apartment' | 'apartment_duplex' | 'penthouse_duplex' | 'house' | 'commercial' | 'land'
export type PropertyStatus = 'opportunity' | 'market_price' | 'above_market'
export type PropertyKind   = 'ready' | 'off_plan'

export interface Property {
  id: string
  kind: PropertyKind        // 'ready' = pronto | 'off_plan' = na planta
  name: string
  developmentName?: string  // nome do empreendimento (off_plan)
  type: PropertyType
  neighborhood: string
  city?: string             // cidade
  address?: string          // rua / logradouro
  complement?: string       // complemento
  unit?: string             // unidade (ex: Apto 203) — aplicável a apartamentos
  bedrooms?: number         // dormitórios
  suites?: number           // suítes
  areaSqm?: number          // área em m²
  condoFee?: number         // valor do condomínio (R$)
  notes?: string            // observações livres
  value: number             // para off_plan = ticket médio
  status: PropertyStatus
  ownerId?: string          // não aplicável para off_plan
  images: string[]
  createdAt: string
  updatedAt: string
}

export type TaskStatus    = 'pending' | 'done' | 'cancelled'
export type TaskPriority  = 'low' | 'medium' | 'high'
export type TaskCategory  = 'visita' | 'agenciamento' | 'proposta' | 'busca_imovel' | 'campanhas' | 'administrativo' | 'prospeccao_imoveis' | 'outro'

export interface ChecklistItem {
  id: string
  text: string
  done: boolean
}

export interface Task {
  id: string
  title: string
  description?: string
  dueDate?: string
  dueTime?: string
  status: TaskStatus
  priority: TaskPriority
  category?: TaskCategory   // categoriza a tarefa para avançar metas
  completedAt?: string      // data em que foi marcada como done
  contactId?: string
  propertyId?: string
  googleEventId?: string
  checklist?: ChecklistItem[]   // stored in localStorage, not in Supabase
  createdAt: string
  updatedAt: string
}

export type SaleType = 'off_plan' | 'ready'

export interface Sale {
  id: string
  clientId: string
  propertyId?: string
  propertyName: string
  date: string
  value: number
  type: SaleType
  notes?: string
  // Comissão
  commissionPct?:   number   // % da venda (ex: 5 = 5%)
  commissionFixed?: number   // valor fixo (alternativa ao %)
  brokerPct?:       number   // % do corretor (default 40)
  createdAt: string
}

/** Calcula comissão total e comissão do corretor a partir de uma venda */
export function calcSaleCommissions(s: Sale) {
  const total  = s.commissionFixed ?? (s.value * (s.commissionPct ?? 0) / 100)
  const broker = total * ((s.brokerPct ?? 40) / 100)
  return { totalCommission: total, brokerCommission: broker }
}

// ─── Campanhas de Prospecção Ativa ───────────────────────────────────────────

export type FunnelStage    = 'new' | 'sent' | 'attended' | 'scheduled' | 'presentation' | 'proposal' | 'sale'
export type LeadSituation  = 'no_interest' | 'stop_messages' | 'invalid'
export type CampaignStatus = 'active' | 'paused' | 'finished'

export interface Campaign {
  id: string
  name: string
  message: string         // mensagem principal (template 1)
  messages?: string[]     // templates adicionais (2, 3, …) — armazenados como JSONB no banco
  status: CampaignStatus
  averageTicket?: number                               // ticket médio do produto (R$)
  conversionRates?: Partial<Record<FunnelStage, number>> // % de conversão por etapa (0-100)
  createdAt: string
  updatedAt: string
}

export interface CampaignLead {
  id: string
  campaignId: string
  name: string
  phone: string
  email?: string
  extra?: string        // colunas opcionais do XLSX
  funnelStage: FunnelStage
  situation?: LeadSituation
  notes?: string
  firstContactAt?: string
  lastMessage?: string
  proposalValue?: number
  propertyId?: string
  stageUpdatedAt?: string  // quando a etapa foi alterada pela última vez
  createdAt: string
  updatedAt: string
}

// ─── Produtividade Diária ────────────────────────────────────────────────────

export interface DailyLog {
  id: string
  date: string            // YYYY-MM-DD
  newLeads: number        // target: 5/dia
  ownerCalls: number      // target: 5/dia
  funnelFollowup: boolean // followup do funil de WhatsApp
  notes?: string
  closed: boolean
  closedAt?: string
  createdAt: string
  updatedAt: string
}

export const DAILY_TARGETS = {
  newLeads:   5,
  ownerCalls: 5,
} as const

// ─── Metas ───────────────────────────────────────────────────────────────────

export type GoalCategory = 'visita' | 'agenciamento' | 'proposta' | 'venda'
export type GoalPeriod   = 'weekly' | 'monthly'

export interface Goal {
  id: string
  name: string
  category: GoalCategory
  target: number        // quantidade alvo por período
  period: GoalPeriod
  active: boolean
  createdAt: string
  updatedAt: string
}

// ─── Histórico semanal ────────────────────────────────────────────────────────

export interface WeekSnapshotEntry {
  goalId:   string
  goalName: string
  category: GoalCategory
  target:   number
  achieved: number
}

export interface WeekSnapshot {
  id:        string   // weekStart (YYYY-MM-DD) — PK
  weekStart: string   // Monday YYYY-MM-DD
  weekEnd:   string   // Sunday YYYY-MM-DD
  entries:   WeekSnapshotEntry[]
  score:     number   // 0–100
  savedAt:   string
}
