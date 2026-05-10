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
  messageIndex?: number   // índice do template usado (0 = Mensagem 1, 1 = Mensagem 2, …)
  proposalValue?: number
  propertyId?: string
  stageUpdatedAt?: string  // quando a etapa foi alterada pela última vez
  source?: 'manual' | 'import' | 'meta_ads'
  metaAdName?: string
  viewedAt?: string        // null = lead Meta não visualizado ainda
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

// ─── Leads ───────────────────────────────────────────────────────────────────

export type LeadOrigin       = 'felicita' | 'meta_ads' | 'portal' | 'offline' | 'campanha'
export type LeadFunnelStage  = 'lead' | 'followup' | 'atendimento' | 'visita' | 'proposta' | 'venda'
export type LeadDiscardReason    = 'sem_condicao' | 'fora_de_nicho' | 'parou_de_responder' | 'nunca_respondeu' | 'telefone_invalido'
export type LeadInteractionType  = 'ligacao' | 'whatsapp' | 'email' | 'visita' | 'reuniao' | 'nota'
export type LeadInteractionOutcome = 'interessado' | 'nao_interessado' | 'agendado' | 'sem_resposta' | 'proposta_enviada' | 'fechado' | 'reagendado'

export interface LeadInteraction {
  id:           string
  leadId:       string
  type:         LeadInteractionType
  description?: string
  outcome?:     LeadInteractionOutcome
  interactedAt: string
  createdAt:    string
}

export interface Lead {
  id: string
  name: string
  phone: string
  email?: string
  origin: LeadOrigin
  funnelStage: LeadFunnelStage
  followupStep: number        // 1-5 quando funnelStage === 'followup'; 0 = não iniciado
  discardReason?: LeadDiscardReason
  discardedAt?: string
  propertyId?: string
  propertyName?: string       // nome livre quando imóvel não está cadastrado
  averageTicket?: number      // preenchido automaticamente pelo imóvel ou manualmente
  contactId?: string          // preenchido ao converter lead em contato
  convertedAt?: string
  visitaTaskId?: string       // ID da tarefa de visita criada automaticamente
  flagged?: boolean           // prioridade máxima — destaca o card no funil
  notes?: string
  createdAt: string
  updatedAt: string
}

// ─── Configuração de leads (motivos de descarte + origens) ───────────────────

export type LeadConfigType = 'discard_reason' | 'origin'

export interface LeadConfigEntry {
  id: string
  type: LeadConfigType
  slug: string        // valor salvo no banco (ex: 'sem_condicao')
  label: string       // label exibido na UI
  emoji?: string
  color?: string      // classe Tailwind (ex: 'text-rose-400')
  displayOrder: number
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
