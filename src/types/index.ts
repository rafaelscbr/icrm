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

export type PropertyType   = 'apartment' | 'house' | 'commercial' | 'land'
export type PropertyStatus = 'opportunity' | 'market_price' | 'above_market'
export type PropertyKind   = 'ready' | 'off_plan'

export interface Property {
  id: string
  kind: PropertyKind        // 'ready' = pronto | 'off_plan' = na planta
  name: string
  developmentName?: string  // nome do empreendimento (off_plan)
  type: PropertyType
  neighborhood: string
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
export type TaskCategory  = 'visita' | 'agenciamento' | 'proposta' | 'outro'

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
  createdAt: string
}

// ─── Campanhas de Prospecção Ativa ───────────────────────────────────────────

export type FunnelStage    = 'new' | 'sent' | 'attended' | 'scheduled' | 'presentation' | 'proposal' | 'sale'
export type LeadSituation  = 'no_interest' | 'stop_messages' | 'invalid'
export type CampaignStatus = 'active' | 'paused' | 'finished'

export interface Campaign {
  id: string
  name: string
  message: string       // mensagem padrão com suporte a {nome}
  status: CampaignStatus
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
  proposalValue?: number
  propertyId?: string
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
