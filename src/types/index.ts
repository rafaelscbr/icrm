export type ContactTag = 'owner' | 'investor' | 'buyer'

export interface BaseLeadProfile {
  type?:     string
  region?:   string
  valueMin?: number
  valueMax?: number
  bedrooms?: number
  source?:   string
}

// Um único bem que o contato quer dar em permuta
export interface PermutaItem {
  id: string
  type: 'imovel' | 'carro'
  // campos de imóvel
  region?: string
  value?: number
  // campos de carro
  carModel?: string
  carValue?: number
}

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
  // Permuta — lista de bens para permuta (imóveis e/ou carros)
  permutaItems: PermutaItem[]
  // Base de leads frios
  isBaseLead?:       boolean
  baseLeadProfile?:  BaseLeadProfile
  /** Marcado como contato inválido em alguma campanha — exibir alerta no cadastro */
  invalidContact?:   boolean
  brokerId?: string
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
  // Permuta
  acceptsPermuta?: boolean
  permutaTypes?: Array<'imovel' | 'carro'>
  permutaRegions?: string[]
  createdById?: string   // quem cadastrou — controla quem pode editar
  createdAt: string
  updatedAt: string
}

export type TaskStatus    = 'pending' | 'done' | 'cancelled'
export type TaskPriority  = 'low' | 'medium' | 'high'
export type TaskCategory  = 'visita' | 'agenciamento' | 'proposta' | 'busca_imovel' | 'campanhas' | 'administrativo' | 'prospeccao_imoveis' | 'souza_financeiro' | 'outro'

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
  checklist?: ChecklistItem[]   // stored in tasks.checklist (JSONB)
  brokerId?: string
  assignedToId?: string   // delegação 1:1: pessoa para quem a tarefa foi delegada
  participants?: string[] // compartilhamento N:N: IDs dos usuários com acesso compartilhado
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
  brokerId?:        string | null
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
export type LeadSituation  =
  | 'no_interest'
  | 'stop_messages'
  | 'invalid_contact' // Contato inválido (unifica: número inexistente, sem WhatsApp, telefone inválido)

/** Situações que indicam telefone inutilizável e devolvem 1 crédito de disparo */
export const INVALID_PHONE_SITUATIONS = new Set<LeadSituation>([
  'invalid_contact',
])
export type CampaignStatus = 'active' | 'paused' | 'finished'

export interface Campaign {
  id: string
  name: string
  message: string         // mensagem principal (template 1)
  messages?: string[]     // templates adicionais (2, 3, …) — armazenados como JSONB no banco
  status: CampaignStatus
  averageTicket?: number                               // ticket médio do produto (R$)
  conversionRates?: Partial<Record<FunnelStage, number>> // % de conversão por etapa (0-100)
  brokerId?:        string | null
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
  transferredAt?: string          // quando foi migrado para o funil principal
  transferredToLeadId?: string    // ID do lead criado no funil principal
  brokerId?: string
  // Rastreabilidade de disparos
  lastSentById?:   string
  lastSentByName?: string
  lastSentAt?:     string
  // Delegação
  assignedToId?:   string
  assignedToName?: string
  // Contador de disparos (incrementado a cada disparo nesta campanha)
  dispatchCount?: number
  createdAt: string
  updatedAt: string
}

export type CampaignParticipantRole = 'owner' | 'collaborator'

export interface CampaignParticipant {
  id:         string
  campaignId: string
  brokerId:   string
  role:       CampaignParticipantRole
  addedAt:    string
}

export type CampaignActivityType = 'dispatch' | 'stage_change' | 'transfer' | 'assignment'

export interface CampaignActivity {
  id:          string
  campaignId:  string
  leadId?:     string
  leadName?:   string
  brokerId?:   string
  brokerName?: string
  actionType:  CampaignActivityType
  metadata?:   Record<string, unknown>
  createdAt:   string
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
export type LeadDiscardReason = string
export type LeadInteractionType  = 'ligacao' | 'whatsapp' | 'email' | 'visita' | 'reuniao' | 'nota' | 'stage_change' | 'discard'
export type LeadInteractionOutcome = 'interessado' | 'nao_interessado' | 'agendado' | 'sem_resposta' | 'proposta_enviada' | 'fechado' | 'reagendado'

export interface LeadInteraction {
  id:           string
  leadId:       string
  type:         LeadInteractionType
  description?: string
  outcome?:     LeadInteractionOutcome
  interactedAt: string
  createdAt:    string
  brokerId?:    string   // quem realizou a interação
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
  // Permuta
  permutaType?: 'imovel' | 'carro'
  permutaPropertyRegion?: string
  permutaPropertyValue?: number
  permutaCarModel?: string
  permutaCarValue?: number
  // Radar de Interesse
  radarPropertyType?: string
  radarRegion?: string
  radarValueMin?: number
  radarValueMax?: number
  radarAreaMin?: number
  radarBedrooms?: number
  kanbanOrder?: number      // float para ordenação manual dentro da coluna (maior = primeiro)
  stageChangedAt?: string   // quando entrou na etapa atual — base para tempo em etapa
  brokerId?:      string | null
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

// ─── Base de Leads ────────────────────────────────────────────────────────────

export type LeadListStatus = 'active' | 'archived'

export interface LeadList {
  id:             string
  name:           string
  description?:   string
  productProfile?: BaseLeadProfile
  totalCount:     number
  status:         LeadListStatus
  brokerId?:      string
  createdAt:      string
  updatedAt:      string
}

export interface LeadListMember {
  id:          string
  listId:      string
  contactId:   string
  importedAt:  string
  importBatch?: string
  rawPhone?:   string
}

export interface CampaignList {
  id:         string
  campaignId: string
  listId:     string
  addedAt:    string
}

export interface LeadCampaignDispatch {
  id:           string
  contactId:    string
  campaignId:   string
  listId?:      string
  brokerId?:    string
  dispatchedAt: string
  messageIndex?: number
  channel:      string
  notes?:       string
  warmupScore:  number
}

// ─── Eventos de Contato (histórico persistente) ───────────────────────────────

export type ContactEventType =
  | 'added_to_list'
  | 'added_to_campaign'
  | 'dispatch_sent'
  | 'entered_funnel'
  | 'funnel_stage_change'
  | 'sale'
  | 'import_skipped'

export interface ContactEvent {
  id:         string
  contactId:  string
  eventType:  ContactEventType
  title:      string
  metadata?:  Record<string, unknown>
  brokerId?:  string
  createdAt:  string
}

// ─── Notificações ─────────────────────────────────────────────────────────────

export type NotificationType = 'task_assigned'

export interface AppNotification {
  id: string
  userId: string
  type: NotificationType
  title: string
  body?: string        // ex: título da tarefa
  resourceId?: string  // ex: task UUID
  resourceType?: string // 'task'
  read: boolean
  createdAt: string
}
