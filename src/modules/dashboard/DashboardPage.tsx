import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, Building2, TrendingUp, DollarSign, Cake,
  ArrowRight, Gift, MessageCircle, Sparkles, Circle, CheckCircle2,
  AlertTriangle, Clock, CalendarCheck, Siren, ClipboardCheck,
  ListTodo, Snowflake, RefreshCw, Megaphone, Zap, ThumbsUp,
  ChevronDown, ChevronUp,
} from 'lucide-react'
import { Task, Contact, Property, Lead, LeadFunnelStage, FunnelStage, calcSaleCommissions } from '../../types'
import { TaskForm } from '../tasks/TaskForm'
import { LeadModal } from '../leads/LeadModal'
import { PageLayout } from '../../components/layout/PageLayout'
import { Card } from '../../components/ui/Card'
import { StatCard } from '../../components/shared/StatCard'
import { Avatar } from '../../components/ui/Avatar'
import { PeriodSelector } from '../../components/shared/PeriodSelector'
import { useContactsStore } from '../../store/useContactsStore'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { useSalesStore } from '../../store/useSalesStore'
import { useTasksStore } from '../../store/useTasksStore'
import { usePeriodStore, matchesPeriod } from '../../store/usePeriodStore'
import { useLeadsStore } from '../../store/useLeadsStore'
import { useLeadInteractionsStore } from '../../store/useLeadInteractionsStore'
import { useCampaignsStore } from '../../store/useCampaignsStore'
import { useCampaignLeadsStore } from '../../store/useCampaignLeadsStore'
import { useAuthStore } from '../../store/useAuthStore'
import { usePresenceStore, pageLabel } from '../../store/usePresenceStore'
import { formatCurrency, formatCurrencyFull, formatDate, getBirthdayDay, whatsappUrl } from '../../lib/formatters'

// ─── Constantes ───────────────────────────────────────────────────────────────

const REAL_TYPES = new Set(['ligacao', 'whatsapp', 'email', 'visita', 'reuniao', 'nota'])
const COOLING_DAYS = 2

const STAGE_LABELS: Partial<Record<LeadFunnelStage, { label: string; color: string }>> = {
  lead:        { label: 'Lead',        color: 'text-t2'  },
  followup:    { label: 'Followup',    color: 'text-blue-400'   },
  atendimento: { label: 'Atendimento', color: 'text-violet-400' },
  visita:      { label: 'Visita',      color: 'text-amber-400'  },
  proposta:    { label: 'Proposta',    color: 'text-orange-400' },
  venda:       { label: 'Venda',       color: 'text-green-400'  },
}

// ─── Pipeline de Campanhas ────────────────────────────────────────────────────

const CAMPAIGN_STAGES: Array<{
  stage: FunnelStage
  label: string
  shortLabel: string
  bg: string
  text: string
  border: string
}> = [
  { stage: 'new',          label: 'Para Ativar',   shortLabel: 'Ativar',   bg: 'bg-amber-500/12',   text: 'text-amber-400',   border: 'border-amber-500/25' },
  { stage: 'sent',         label: 'Em Abordagem',  shortLabel: 'Abordagem', bg: 'bg-blue-500/12',    text: 'text-blue-400',    border: 'border-blue-500/25'  },
  { stage: 'attended',     label: 'Demonstrou Interesse', shortLabel: 'Interesse', bg: 'bg-cyan-500/12', text: 'text-cyan-400', border: 'border-cyan-500/25' },
  { stage: 'scheduled',    label: 'Visita Agendada', shortLabel: 'Visita', bg: 'bg-violet-500/12',  text: 'text-violet-400',  border: 'border-violet-500/25'},
  { stage: 'presentation', label: 'Apresentação',  shortLabel: 'Apresentação', bg: 'bg-purple-500/12', text: 'text-purple-400', border: 'border-purple-500/25' },
  { stage: 'proposal',     label: 'Em Proposta',   shortLabel: 'Proposta', bg: 'bg-orange-500/12',  text: 'text-orange-400',  border: 'border-orange-500/25'},
]

function CampaignFunnelWidget({ onNavigate }: { onNavigate: (id: string) => void }) {
  const { campaigns }         = useCampaignsStore()
  const { leads: campLeads }  = useCampaignLeadsStore()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const activeCampaigns = campaigns.filter(c => c.status === 'active')
  if (activeCampaigns.length === 0) return null

  // Totais gerais (todas as campanhas ativas)
  const activeLeads = campLeads.filter(l => activeCampaigns.some(c => c.id === l.campaignId))

  const totalPerStage = CAMPAIGN_STAGES.map(({ stage }) => ({
    stage,
    count: activeLeads.filter(l => l.funnelStage === stage && !l.situation).length,
  }))
  const totalSales = activeLeads.filter(l => l.funnelStage === 'sale').length
  const grandTotal = activeLeads.length

  return (
    <div className="rounded-xl border border-line bg-page overflow-hidden mb-6 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-line">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-purple-500/15 rounded-lg flex items-center justify-center">
            <Megaphone size={15} className="text-purple-400" />
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-widest text-t4 uppercase">Pipeline de Campanhas</p>
            <h2 className="text-sm font-bold text-t1 leading-none mt-0.5">
              {activeCampaigns.length} campanha{activeCampaigns.length !== 1 ? 's' : ''} ativa{activeCampaigns.length !== 1 ? 's' : ''} · {grandTotal.toLocaleString('pt-BR')} leads
            </h2>
          </div>
        </div>
        {totalSales > 0 && (
          <div className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 px-3 py-1.5 rounded-xl">
            <span className="text-green-400 text-xs font-bold tabular-nums">{totalSales}</span>
            <span className="text-green-500/70 text-[10px]">venda{totalSales !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Funil geral */}
      <div className="px-5 pt-4 pb-3 border-b border-line">
        <p className="text-[10px] font-bold text-t4 uppercase tracking-widest mb-3">Resumo geral</p>
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
          {CAMPAIGN_STAGES.map(({ stage, shortLabel, bg, text, border }) => {
            const count = totalPerStage.find(s => s.stage === stage)?.count ?? 0
            const pct   = grandTotal > 0 ? Math.round(count / grandTotal * 100) : 0
            return (
              <div key={stage} className={`flex flex-col items-center gap-1 rounded-xl p-3 border ${bg} ${border}`}>
                <p className={`text-[10px] font-bold uppercase tracking-wide ${text}`}>{shortLabel}</p>
                <p className="text-2xl font-black text-t1 tabular-nums leading-none">{count.toLocaleString('pt-BR')}</p>
                <p className="text-[10px] text-t4 tabular-nums">{pct}%</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Por campanha */}
      <div className="flex flex-col divide-y divide-line">
        {activeCampaigns.map(campaign => {
          const cLeads    = campLeads.filter(l => l.campaignId === campaign.id)
          const total     = cLeads.length
          const expanded  = expandedId === campaign.id
          const stageCounts = CAMPAIGN_STAGES.map(({ stage }) => ({
            stage,
            count: cLeads.filter(l => l.funnelStage === stage && !l.situation).length,
          }))
          const sales = cLeads.filter(l => l.funnelStage === 'sale').length

          return (
            <div key={campaign.id} className="hover:bg-s2/40 transition-colors">
              {/* Row header */}
              <button
                onClick={() => setExpandedId(expanded ? null : campaign.id)}
                className="w-full flex items-center gap-3 px-5 py-3 text-left cursor-pointer"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-t1 truncate">{campaign.name}</p>
                  <p className="text-[11px] text-t4 mt-0.5">{total.toLocaleString('pt-BR')} leads · {sales > 0 ? `${sales} venda${sales !== 1 ? 's' : ''}` : 'Sem vendas ainda'}</p>
                </div>

                {/* Mini funnel preview */}
                <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
                  {CAMPAIGN_STAGES.slice(0, 4).map(({ stage, text, bg }) => {
                    const cnt = stageCounts.find(s => s.stage === stage)?.count ?? 0
                    if (cnt === 0) return null
                    return (
                      <span key={stage} className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${bg} ${text}`}>
                        {cnt}
                      </span>
                    )
                  })}
                </div>

                <button
                  onClick={e => { e.stopPropagation(); onNavigate(campaign.id) }}
                  className="flex-shrink-0 text-[10px] text-brand/60 hover:text-brand border border-brand/20 hover:border-brand/50 px-2 py-1 rounded-lg transition-colors mr-1"
                >
                  Abrir
                </button>

                {expanded
                  ? <ChevronUp size={14} className="text-t4 flex-shrink-0" />
                  : <ChevronDown size={14} className="text-t4 flex-shrink-0" />
                }
              </button>

              {/* Expanded funnel */}
              {expanded && (
                <div className="px-5 pb-4">
                  <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 mt-1">
                    {CAMPAIGN_STAGES.map(({ stage, shortLabel, bg, text, border }) => {
                      const cnt = stageCounts.find(s => s.stage === stage)?.count ?? 0
                      const pct = total > 0 ? Math.round(cnt / total * 100) : 0
                      return (
                        <div key={stage} className={`flex flex-col items-center gap-1 rounded-xl p-2.5 border ${bg} ${border}`}>
                          <p className={`text-[10px] font-bold uppercase tracking-wide ${text}`}>{shortLabel}</p>
                          <p className="text-xl font-black text-t1 tabular-nums leading-none">{cnt}</p>
                          <p className="text-[10px] text-t4">{pct}%</p>
                        </div>
                      )
                    })}
                  </div>

                  {/* Conversão progressiva */}
                  <div className="mt-3 flex items-center gap-1 overflow-x-auto">
                    {CAMPAIGN_STAGES.map(({ stage, shortLabel, text }, idx) => {
                      const cur  = stageCounts.find(s => s.stage === stage)?.count ?? 0
                      const prev = idx > 0
                        ? (stageCounts.find(s => s.stage === CAMPAIGN_STAGES[idx - 1].stage)?.count ?? 0)
                        : total
                      const conv = prev > 0 ? Math.round(cur / prev * 100) : 0
                      return (
                        <div key={stage} className="flex items-center gap-1 flex-shrink-0">
                          {idx > 0 && (
                            <span className="text-[10px] text-t4 tabular-nums">→ {conv}%</span>
                          )}
                          <div className="flex flex-col items-center">
                            <span className={`text-[9px] font-bold uppercase tracking-wide ${text}`}>{shortLabel}</span>
                            <span className="text-xs font-bold text-t1">{cur}</span>
                          </div>
                        </div>
                      )
                    })}
                    {sales > 0 && (
                      <>
                        <span className="text-[10px] text-t4">→</span>
                        <div className="flex flex-col items-center">
                          <span className="text-[9px] font-bold uppercase tracking-wide text-green-400">Vendas</span>
                          <span className="text-xs font-bold text-green-400">{sales}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Helpers de data ──────────────────────────────────────────────────────────

function daysAgo(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86_400_000
}
function daysOverdue(dueDate: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.floor((today.getTime() - new Date(dueDate + 'T00:00:00').getTime()) / 86_400_000)
}
function dueDateLabel(dueDate?: string): { text: string; color: string } {
  if (!dueDate) return { text: 'Sem prazo', color: 'text-t4' }
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diffDays = Math.round((new Date(dueDate + 'T00:00:00').getTime() - today.getTime()) / 86_400_000)
  if (diffDays === 0) return { text: 'Hoje!', color: 'text-amber-400' }
  if (diffDays === 1) return { text: 'Amanhã', color: 'text-yellow-400' }
  if (diffDays <= 7)  return { text: `Em ${diffDays} dias`, color: 'text-t2' }
  return { text: dueDate.split('-').reverse().join('/'), color: 'text-t3' }
}

// ─── Alertas de leads ─────────────────────────────────────────────────────────

function LeadAlertsWidget({
  onOpenLead, onNavigate,
}: { onOpenLead: (lead: Lead) => void; onNavigate: () => void }) {
  const { leads } = useLeadsStore()
  const { byLead } = useLeadInteractionsStore()

  const alertLeads = useMemo(() => {
    const active = leads.filter(l => !l.discardReason && l.funnelStage !== 'venda')
    return active
      .map(l => {
        const ints    = byLead[l.id] ?? []
        const lastReal = ints.find(i => REAL_TYPES.has(i.type))
        const days    = daysAgo(lastReal?.interactedAt ?? l.createdAt)
        return { lead: l, days }
      })
      .filter(({ days }) => days > COOLING_DAYS)
      .sort((a, b) => b.days - a.days)
  }, [leads, byLead])

  if (alertLeads.length === 0) return null

  return (
    <div className="rounded-xl border border-sky-400/30 bg-sky-500/5 overflow-hidden mb-6 animate-slide-up">
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-sky-400/15">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-sky-500/15 rounded-xl flex items-center justify-center">
            <Snowflake size={15} className="text-sky-400 animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-sky-300 leading-none">Leads sem contato</h2>
            <p className="text-[11px] text-sky-500/70 mt-0.5">Precisam de atenção agora</p>
          </div>
          <span className="ml-1 bg-sky-500/20 text-sky-300 text-xs font-bold px-2.5 py-1 rounded-xl border border-sky-400/25 tabular-nums">
            {alertLeads.length}
          </span>
        </div>
        <button onClick={onNavigate} className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors cursor-pointer">
          Ver funil <ArrowRight size={12} />
        </button>
      </div>

      <div className="flex flex-col divide-y divide-sky-400/8">
        {alertLeads.slice(0, 7).map(({ lead, days }) => {
          const stageConf = STAGE_LABELS[lead.funnelStage]
          const daysInt   = Math.floor(days)
          const daysBadge = daysInt > 7
            ? 'text-red-400 bg-red-500/10 border-red-500/20'
            : daysInt > 4
              ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
              : 'text-sky-400 bg-sky-500/10 border-sky-500/20'
          return (
            <div
              key={lead.id}
              onClick={() => onOpenLead(lead)}
              className="flex items-center gap-3 px-5 py-3 hover:bg-sky-500/5 transition-colors cursor-pointer"
            >
              <div className="w-8 h-8 rounded-lg bg-s3/50 border border-line flex items-center justify-center text-sm font-bold text-t2 flex-shrink-0">
                {lead.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-t1 truncate">{lead.name}</p>
                <span className={`text-[10px] ${stageConf?.color ?? 'text-t3'}`}>{stageConf?.label ?? lead.funnelStage}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border tabular-nums ${daysBadge}`}>{daysInt}d</span>
                <a
                  href={whatsappUrl(lead.phone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="p-1.5 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-400 transition-colors"
                >
                  <MessageCircle size={12} />
                </a>
              </div>
            </div>
          )
        })}
        {alertLeads.length > 7 && (
          <div className="px-5 py-2.5 text-center">
            <button onClick={onNavigate} className="text-xs text-t4 hover:text-sky-400 transition-colors cursor-pointer">
              +{alertLeads.length - 7} leads mais precisam de contato →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tarefas em atraso ────────────────────────────────────────────────────────

function OverdueCard({
  tasks, contacts, properties, onNavigate,
}: { tasks: Task[]; contacts: Contact[]; properties: Property[]; onNavigate: () => void }) {
  if (tasks.length === 0) return null
  return (
    <div className="relative rounded-xl border border-red-500/40 bg-red-500/5 ring-1 ring-red-500/20 overflow-hidden mb-6 animate-slide-up">
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-red-500/20">
        <div className="flex items-center gap-2.5">
          <div className="relative w-8 h-8 bg-red-500/20 rounded-xl flex items-center justify-center">
            <Siren size={15} className="text-red-400 animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-red-300 leading-none">Tarefas em atraso</h2>
            <p className="text-[11px] text-red-500/70 mt-0.5">Atenção imediata necessária</p>
          </div>
          <span className="ml-1 bg-red-500/25 text-red-300 text-xs font-bold px-2.5 py-1 rounded-xl border border-red-500/30 tabular-nums animate-pulse">{tasks.length}</span>
        </div>
        <button onClick={onNavigate} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors cursor-pointer">
          Resolver <ArrowRight size={12} />
        </button>
      </div>
      <div className="flex flex-col divide-y divide-red-500/10">
        {tasks.map(t => {
          const days     = daysOverdue(t.dueDate!)
          const contact  = contacts.find(c => c.id === t.contactId)
          const property = properties.find(p => p.id === t.propertyId)
          return (
            <div key={t.id} onClick={onNavigate} className="flex items-center gap-3 px-5 py-3 hover:bg-red-500/8 transition-colors cursor-pointer">
              <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-red-500/15 flex items-center justify-center">
                <AlertTriangle size={13} className="text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-t1 truncate">{t.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {contact  && <span className="text-xs text-t3 flex items-center gap-0.5"><Users size={9} /> {contact.name}</span>}
                  {property && <span className="text-xs text-t3 flex items-center gap-0.5"><Building2 size={9} /> {property.name}</span>}
                </div>
              </div>
              <span className="flex-shrink-0 flex items-center gap-1 text-xs font-bold text-red-400 bg-red-500/15 px-2 py-0.5 rounded-lg border border-red-500/20">
                <Clock size={10} /> {days === 1 ? '1 dia' : `${days} dias`} atraso
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Próximas tarefas ─────────────────────────────────────────────────────────

function UpcomingCard({
  tasks, contacts, properties, onNavigate,
}: { tasks: Task[]; contacts: Contact[]; properties: Property[]; onNavigate: () => void }) {
  const shown = tasks.slice(0, 6)
  return (
    <div className="relative rounded-xl border border-line bg-surface overflow-hidden mb-6 animate-slide-up">
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-line">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500/15 rounded-lg flex items-center justify-center">
            <CalendarCheck size={15} className="text-blue-400" />
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-widest text-t4 uppercase">Próximas Tarefas</p>
            <h2 className="text-sm font-bold text-t1 leading-none mt-0.5">
              {tasks.length > 0 ? `${tasks.length} agendada${tasks.length !== 1 ? 's' : ''}` : 'Agenda livre'}
            </h2>
          </div>
        </div>
        <button onClick={onNavigate} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors cursor-pointer">
          Ver todas <ArrowRight size={12} />
        </button>
      </div>
      {tasks.length === 0 ? (
        <div className="flex flex-col items-center py-8 gap-2">
          <CheckCircle2 size={30} className="text-green-500/40" />
          <p className="text-sm text-t3">Nenhuma tarefa futura por enquanto</p>
          <button onClick={onNavigate} className="text-xs text-brand hover:text-brand-text transition-colors cursor-pointer mt-1">+ Criar tarefa →</button>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-line">
          {shown.map(t => {
            const due      = dueDateLabel(t.dueDate)
            const contact  = contacts.find(c => c.id === t.contactId)
            const property = properties.find(p => p.id === t.propertyId)
            return (
              <div key={t.id} onClick={onNavigate} className="flex items-center gap-3 px-5 py-3 hover:bg-s2/60 transition-colors cursor-pointer">
                <Circle size={16} className="text-t4 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-t1 truncate">{t.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {contact  && <span className="text-xs text-t4 flex items-center gap-0.5"><Users size={9} /> {contact.name}</span>}
                    {property && <span className="text-xs text-t4 flex items-center gap-0.5"><Building2 size={9} /> {property.name}</span>}
                  </div>
                </div>
                {t.dueDate && (
                  <span className={`flex-shrink-0 flex items-center gap-1 text-xs font-medium tabular-nums ${due.color}`}>
                    <Clock size={10} /> {due.text}
                  </span>
                )}
              </div>
            )
          })}
          {tasks.length > 6 && (
            <div className="px-5 py-2.5 text-center">
              <button onClick={onNavigate} className="text-xs text-t4 hover:text-brand transition-colors cursor-pointer">
                +{tasks.length - 6} mais tarefas →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Leads congelados em campanhas ───────────────────────────────────────────

const FROZEN_STAGES    = ['attended', 'scheduled', 'presentation', 'proposal'] as const
const FROZEN_LABELS: Record<string, string> = { attended: 'Interesse', scheduled: 'Agendado', presentation: 'Apresentação', proposal: 'Proposta' }

function FrozenLeadsWidget({ onNavigate }: { onNavigate: (id: string) => void }) {
  const { campaigns } = useCampaignsStore()
  const { leads }     = useCampaignLeadsStore()

  const frozen = useMemo(() => {
    return leads
      .filter(l => (FROZEN_STAGES as readonly string[]).includes(l.funnelStage) && !l.situation)
      .map(l => {
        const ref  = l.stageUpdatedAt ?? l.updatedAt ?? l.createdAt
        const days = Math.floor((Date.now() - new Date(ref).getTime()) / 86_400_000)
        return { ...l, days }
      })
      .filter(l => l.days >= 2)
      .sort((a, b) => b.days - a.days)
  }, [leads])

  if (frozen.length === 0) return null

  const byCampaign = frozen.reduce<Record<string, typeof frozen>>((acc, l) => {
    if (!acc[l.campaignId]) acc[l.campaignId] = []
    acc[l.campaignId].push(l)
    return acc
  }, {})

  return (
    <div className="rounded-xl border border-blue-400/30 bg-blue-500/5 ring-1 ring-blue-400/15 overflow-hidden mb-6 animate-slide-up">
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-blue-400/15">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-500/15 rounded-xl flex items-center justify-center">
            <Snowflake size={15} className="text-blue-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-blue-300 leading-none">Leads congelados</h2>
            <p className="text-[11px] text-blue-500/70 mt-0.5">Sem movimento há +2 dias nas campanhas</p>
          </div>
          <span className="ml-1 bg-blue-500/20 text-blue-300 text-xs font-bold px-2.5 py-1 rounded-xl border border-blue-400/25 tabular-nums">{frozen.length}</span>
        </div>
      </div>
      <div className="flex flex-col divide-y divide-blue-400/8">
        {Object.entries(byCampaign).slice(0, 3).map(([cid, cLeads]) => {
          const campaign = campaigns.find(c => c.id === cid)
          return (
            <div key={cid} className="px-5 py-3 hover:bg-blue-500/5 transition-colors cursor-pointer" onClick={() => onNavigate(cid)}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-t2">{campaign?.name ?? 'Campanha'}</p>
                <span className="text-[10px] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-400/20">{cLeads.length} lead{cLeads.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex flex-col gap-1">
                {cLeads.slice(0, 3).map(l => (
                  <div key={l.id} className="flex items-center gap-2">
                    <span className="text-[10px] text-t3 w-24 truncate">{l.name}</span>
                    <span className="text-[10px] text-blue-400/70 bg-blue-500/8 px-1.5 py-0.5 rounded border border-blue-400/15">{FROZEN_LABELS[l.funnelStage] ?? l.funnelStage}</span>
                    <span className="text-[10px] text-t4 ml-auto">{l.days}d sem mov.</span>
                  </div>
                ))}
                {cLeads.length > 3 && <p className="text-[10px] text-t4">+{cLeads.length - 3} mais</p>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Potencial de recompra ────────────────────────────────────────────────────

function RepurchaseWidget({ onNavigate }: { onNavigate: () => void }) {
  const { contacts } = useContactsStore()
  const { sales }    = useSalesStore()
  const candidates = useMemo(() => {
    return contacts
      .filter(c => c.tags.includes('buyer'))
      .map(c => {
        const clientSales = sales.filter(s => s.clientId === c.id).sort((a, b) => b.date.localeCompare(a.date))
        const lastSale    = clientSales[0]
        const daysSince   = lastSale ? Math.floor((Date.now() - new Date(lastSale.date).getTime()) / 86_400_000) : null
        return { contact: c, lastSale, daysSince, totalSales: clientSales.length }
      })
      .filter(c => c.daysSince !== null && c.daysSince >= 180)
      .sort((a, b) => (b.daysSince ?? 0) - (a.daysSince ?? 0))
  }, [contacts, sales])
  if (candidates.length === 0) return null

  return (
    <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 overflow-hidden mb-6 animate-slide-up">
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-emerald-500/15">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-emerald-500/15 rounded-xl flex items-center justify-center">
            <RefreshCw size={15} className="text-emerald-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-t1 leading-none">Potencial de recompra</h2>
            <p className="text-[11px] text-t3 mt-0.5">Clientes que compraram há +6 meses</p>
          </div>
          <span className="ml-1 bg-emerald-500/15 text-emerald-400 text-xs font-bold px-2.5 py-1 rounded-xl border border-emerald-500/20 tabular-nums">{candidates.length}</span>
        </div>
        <button onClick={onNavigate} className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors cursor-pointer">
          Ver contatos <ArrowRight size={12} />
        </button>
      </div>
      <div className="flex flex-col divide-y divide-emerald-500/8">
        {candidates.slice(0, 5).map(({ contact: c, lastSale, daysSince, totalSales }) => (
          <div key={c.id} className="flex items-center gap-3 px-5 py-3 hover:bg-emerald-500/5 transition-colors">
            <Avatar name={c.name} photoUrl={c.photoUrl} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-t1 truncate">{c.name}</p>
              <p className="text-[10px] text-t3">{totalSales} compra{totalSales !== 1 ? 's' : ''} · última: {lastSale ? formatDate(lastSale.date) : '—'}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[10px] text-emerald-400/70 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/15">{daysSince}d sem compra</span>
              <a href={whatsappUrl(c.phone)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="p-1.5 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-400 transition-colors">
                <MessageCircle size={12} />
              </a>
            </div>
          </div>
        ))}
        {candidates.length > 5 && (
          <div className="px-5 py-2 text-center">
            <button onClick={onNavigate} className="text-[11px] text-t4 hover:text-emerald-400 transition-colors cursor-pointer">+{candidates.length - 5} outros candidatos →</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Corretores online (admin only) ──────────────────────────────────────────

const PAGE_ICONS: Record<string, string> = {
  '/':            '📊',
  '/leads':       '🎯',
  '/contatos':    '👥',
  '/imoveis':     '🏠',
  '/vendas':      '💰',
  '/campanhas':   '📣',
  '/tarefas':     '✅',
  '/performance': '📈',
  '/permuta':     '🔄',
  '/metas':       '🎯',
  '/admin':       '⚙️',
  '/admin/logs':  '📋',
}

function OnlineBrokersPanel() {
  const { onlineBrokers } = usePresenceStore()
  const brokers = onlineBrokers.filter(b => b.role === 'broker')

  if (brokers.length === 0) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-line bg-s2/30">
        <span className="w-2 h-2 rounded-full bg-slate-500 flex-shrink-0" />
        <p className="text-sm text-t3">Nenhum corretor online por enquanto.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {brokers.map(b => {
        const hasLocation  = b.lat != null && b.lng != null
        const mapsUrl      = hasLocation ? `https://www.google.com/maps?q=${b.lat},${b.lng}` : undefined
        const locationText = [b.city, b.region, b.country].filter(Boolean).join(', ')
        return (
          <div key={b.userId} className="flex items-center gap-3 px-4 py-3 bg-s2/50 rounded-xl border border-line">
            <div className="relative flex-shrink-0">
              <div className="w-9 h-9 rounded-full bg-brand/20 flex items-center justify-center text-sm font-bold text-brand">
                {b.name.charAt(0).toUpperCase()}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-s1 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-t1 truncate">{b.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xs">{PAGE_ICONS[b.currentPage] ?? '🖥️'}</span>
                <span className="text-xs text-t3">{pageLabel(b.currentPage)}</span>
                {locationText && (
                  <>
                    <span className="text-t4">·</span>
                    <span className="text-xs text-t4 truncate">{locationText}</span>
                    <span className="text-[9px] text-t4 uppercase tracking-wide">
                      {b.locationSource === 'gps' ? 'GPS' : 'IP'}
                    </span>
                  </>
                )}
              </div>
            </div>
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                className="flex-shrink-0 text-[10px] text-brand/70 hover:text-brand border border-brand/20 hover:border-brand/50 px-2 py-1 rounded-lg transition-colors"
              >
                Ver mapa
              </a>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Dashboard principal ──────────────────────────────────────────────────────

export function DashboardPage() {
  const navigate = useNavigate()
  const [taskFormOpen,  setTaskFormOpen]  = useState(false)
  const [selectedLead,  setSelectedLead]  = useState<Lead | null>(null)
  const { isAdmin } = useAuthStore()

  const { contacts, load: loadContacts, getBirthdaysThisMonth } = useContactsStore()
  const { properties, load: loadProperties }                    = usePropertiesStore()
  const { sales, load: loadSales, getByPeriod, getValueByPeriod } = useSalesStore()
  const { tasks, load: loadTasks, getUpcoming, getOverdue }     = useTasksStore()
  const { load: loadCampaigns }    = useCampaignsStore()
  const { load: loadCampLeads }    = useCampaignLeadsStore()
  const { load: loadMyLeads }      = useLeadsStore()
  const { loadAll: loadInteractions } = useLeadInteractionsStore()
  const { startDate, endDate, getLabel } = usePeriodStore()

  useEffect(() => {
    loadContacts(); loadProperties(); loadSales(); loadTasks()
    loadCampaigns(); loadCampLeads(); loadMyLeads(); loadInteractions()
  }, [])

  const periodLabel   = getLabel()
  const salesInPeriod = getByPeriod(startDate, endDate)
  const valueInPeriod = getValueByPeriod(startDate, endDate)
  const totalAccumulated      = sales.filter(s => s.date <= endDate).reduce((acc, s) => acc + s.value, 0)
  const totalAccumulatedCount = sales.filter(s => s.date <= endDate).length
  const recentSales   = salesInPeriod.slice(0, 5)
  const upcomingTasks = getUpcoming()
  const overdueTasks  = getOverdue()
  const birthdays     = getBirthdaysThisMonth()
  const periodComm    = salesInPeriod.reduce((a, s) => a + calcSaleCommissions(s).totalCommission, 0)
  const periodBroker  = salesInPeriod.reduce((a, s) => a + calcSaleCommissions(s).brokerCommission, 0)
  const tasksDoneInPeriod    = tasks.filter(t => t.status === 'done' && t.completedAt && matchesPeriod(t.completedAt.split('T')[0], startDate, endDate)).length
  const tasksPendingInPeriod = tasks.filter(t => t.status !== 'done' && t.dueDate && matchesPeriod(t.dueDate, startDate, endDate)).length

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Bom dia'
    if (h < 18) return 'Boa tarde'
    return 'Boa noite'
  }
  const todayFormatted = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <PageLayout
      title={`${greeting()}, Rafael`}
      subtitle={todayFormatted.charAt(0).toUpperCase() + todayFormatted.slice(1)}
      ctaLabel="Nova Tarefa"
      onCta={() => setTaskFormOpen(true)}
    >
      {/* Period selector */}
      <div className="flex items-center justify-between mb-6 px-1">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-4 rounded-full bg-blue-500" />
          <p className="text-xs text-t3">Período: <span className="text-t1 font-semibold">{periodLabel}</span></p>
        </div>
        <PeriodSelector />
      </div>

      {/* 0. Corretores online — visível só para admin */}
      {isAdmin && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-t3">Corretores Online</h2>
          </div>
          <OnlineBrokersPanel />
        </div>
      )}

      {/* 1. Pipeline de Campanhas */}
      <CampaignFunnelWidget onNavigate={id => navigate(`/campanhas?id=${id}`)} />

      {/* 2. Alertas de leads sem contato */}
      <LeadAlertsWidget
        onOpenLead={setSelectedLead}
        onNavigate={() => navigate('/leads')}
      />

      {/* 3. Tarefas em atraso */}
      <OverdueCard
        tasks={overdueTasks}
        contacts={contacts}
        properties={properties}
        onNavigate={() => navigate('/tarefas')}
      />

      {/* 4. KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <div className="relative bg-page border border-line rounded-xl overflow-hidden hover:-translate-y-0.5 transition-all hover:border-line-strong hover:shadow-2xl hover:shadow-black/40">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-violet-500" />
          <div className="p-5">
            <p className="text-[11px] font-semibold text-t3 uppercase tracking-widest mb-3">Tarefas — {periodLabel}</p>
            <div className="flex items-center gap-4 mb-3">
              <div className="flex-1">
                <p className="text-3xl font-black text-t1 tabular-nums leading-none">{tasksDoneInPeriod}</p>
                <p className="text-[10px] text-t4 mt-1 flex items-center gap-1"><ClipboardCheck size={9} className="text-green-500" /> realizadas</p>
              </div>
              <div className="w-px h-8 bg-line flex-shrink-0" />
              <div className="flex-1">
                <p className="text-3xl font-black text-violet-300 tabular-nums leading-none">{tasksPendingInPeriod}</p>
                <p className="text-[10px] text-t4 mt-1 flex items-center gap-1"><ListTodo size={9} className="text-violet-500" /> pendentes</p>
              </div>
            </div>
            <div className="h-1 bg-s3/50 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-green-500 transition-all duration-700" style={{ width: `${tasksDoneInPeriod + tasksPendingInPeriod > 0 ? Math.round(tasksDoneInPeriod / (tasksDoneInPeriod + tasksPendingInPeriod) * 100) : 0}%` }} />
            </div>
          </div>
        </div>
        <StatCard label="Imóveis ativos" value={properties.length} sub={`${properties.filter(p => p.status === 'opportunity').length} oportunidades`} icon={<Building2 size={16} />} accent="blue" />
        <StatCard label="Volume acumulado" value={formatCurrency(totalAccumulated)} sub={`${totalAccumulatedCount} venda${totalAccumulatedCount !== 1 ? 's' : ''} até ${periodLabel}`} icon={<DollarSign size={16} />} accent="green" />
        <StatCard label={`Vendas — ${periodLabel}`} value={formatCurrency(valueInPeriod)} sub={`${salesInPeriod.length} venda${salesInPeriod.length !== 1 ? 's' : ''} no período`} icon={<TrendingUp size={16} />} accent="purple" />
      </div>

      {/* 5. Comissões do período */}
      {salesInPeriod.length > 0 && (
        <div className="grid grid-cols-2 gap-4 mb-8">
          <StatCard label={`Comissão gerada — ${periodLabel}`} value={formatCurrencyFull(periodComm)} sub="soma das comissões negociadas" icon={<DollarSign size={18} />} accent="purple" />
          <StatCard label={`Sua comissão — ${periodLabel}`} value={formatCurrencyFull(periodBroker)} sub="sua parte no período" icon={<TrendingUp size={18} />} accent="green" />
        </div>
      )}

      {/* 6. Aniversários + Últimas vendas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card accent="yellow" className="animate-slide-up">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 bg-yellow-500/15 rounded-lg flex items-center justify-center"><Cake size={14} className="text-yellow-400" /></div>
            <h2 className="text-sm font-semibold text-t1">Aniversários do mês</h2>
            {birthdays.length > 0 && (
              <span className="ml-auto bg-yellow-500/20 text-yellow-400 text-xs font-bold px-2 py-0.5 rounded-lg border border-yellow-500/30">{birthdays.length}</span>
            )}
          </div>
          {birthdays.length === 0 ? (
            <div className="flex flex-col items-center py-6 gap-2">
              <Gift size={28} className="text-t4" />
              <p className="text-xs text-t4 text-center">Nenhum aniversário este mês</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {birthdays.slice(0, 5).map(c => (
                <div key={c.id} className="flex items-center gap-3 group">
                  <Avatar name={c.name} photoUrl={c.photoUrl} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-t1 truncate font-medium">{c.name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-yellow-400 tabular-nums">{getBirthdayDay(c.birthdate!).replace(/^0/, '')}/{c.birthdate!.split('-')[1]}</span>
                    <a href={whatsappUrl(c.phone)} target="_blank" rel="noopener noreferrer" className="opacity-0 group-hover:opacity-100 p-1 rounded-lg bg-green-500/10 text-green-400 transition-all">
                      <MessageCircle size={12} />
                    </a>
                  </div>
                </div>
              ))}
              {birthdays.length > 5 && <p className="text-xs text-t4 text-center pt-1">+{birthdays.length - 5} mais</p>}
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-green-500/15 rounded-lg flex items-center justify-center"><TrendingUp size={14} className="text-green-400" /></div>
              <h2 className="text-sm font-semibold text-t1">Últimas vendas</h2>
            </div>
            <button onClick={() => navigate('/vendas')} className="text-xs text-brand hover:text-brand-text flex items-center gap-1 transition-colors cursor-pointer hover:gap-2">
              Ver todas <ArrowRight size={12} />
            </button>
          </div>
          {recentSales.length === 0 ? (
            <div className="flex flex-col items-center py-8 gap-2">
              <div className="w-12 h-12 bg-s3/50 rounded-xl flex items-center justify-center"><Sparkles size={20} className="text-t4" /></div>
              <p className="text-sm text-t3">Nenhuma venda registrada ainda</p>
              <button onClick={() => navigate('/vendas?new=1')} className="text-xs text-brand hover:text-brand-text transition-colors cursor-pointer mt-1">Registrar primeira venda →</button>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {recentSales.map(s => {
                const client = contacts.find(c => c.id === s.clientId)
                return (
                  <div key={s.id} className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-s2/60 transition-colors -mx-3">
                    <Avatar name={client?.name ?? s.propertyName} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-t1 truncate">{client?.name ?? '—'}</p>
                      <p className="text-xs text-t3 truncate">{s.propertyName}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-green-400 tabular-nums">{formatCurrencyFull(s.value)}</p>
                      <p className="text-xs text-t4">{formatDate(s.date)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* 7. Próximas tarefas */}
      <UpcomingCard tasks={upcomingTasks} contacts={contacts} properties={properties} onNavigate={() => navigate('/tarefas')} />

      {/* 8. Leads congelados em campanhas */}
      <FrozenLeadsWidget onNavigate={id => navigate(`/campanhas?id=${id}`)} />

      {/* 9. Potencial de recompra */}
      <RepurchaseWidget onNavigate={() => navigate('/contatos')} />

      {/* Modais */}
      <TaskForm isOpen={taskFormOpen} onClose={() => setTaskFormOpen(false)} />
      {selectedLead && <LeadModal lead={selectedLead} onClose={() => setSelectedLead(null)} />}
    </PageLayout>
  )
}
