import { useEffect, useState, useMemo } from 'react'
import {
  Database, Megaphone, TrendingUp, ShoppingBag,
  MessageSquare, Clock, ChevronDown, ChevronUp,
} from 'lucide-react'
import { supabase }           from '../../lib/supabase'
import { useLeadListsStore }  from '../../store/useLeadListsStore'
import { useCampaignsStore }  from '../../store/useCampaignsStore'

interface Props {
  contactId: string
}

// ─── Tipos internos ────────────────────────────────────────────────────────────
interface ListMemberRow  { list_id: string; imported_at: string; import_batch: string | null }
interface CampaignLeadRow{ campaign_id: string; funnel_stage: string; created_at: string; transferred_at: string | null }
interface DispatchRow    { campaign_id: string; list_id: string | null; dispatched_at: string; message_index: number | null }
interface FunnelLeadRow  { funnel_stage: string; created_at: string; stage_changed_at: string | null }
interface SaleRow        { date: string; property_name: string; value: number }

type EventKind = 'list' | 'campaign' | 'dispatch' | 'funnel' | 'sale'

interface TimelineEvent {
  id:       string
  kind:     EventKind
  date:     string     // ISO
  title:    string
  subtitle?: string
  badge?:   string
}

// ─── Config visual ─────────────────────────────────────────────────────────────
const KIND_CONFIG: Record<EventKind, {
  icon:   React.ElementType
  color:  string
  bg:     string
  border: string
}> = {
  list:     { icon: Database,    color: 'text-blue-400',   bg: 'bg-s3/60',   border: 'border-blue-500/20'   },
  campaign: { icon: Megaphone,   color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
  dispatch: { icon: MessageSquare,color:'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
  funnel:   { icon: TrendingUp,  color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20'  },
  sale:     { icon: ShoppingBag, color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20'  },
}

const FUNNEL_LABELS: Record<string, string> = {
  lead: 'Lead', followup: 'Followup', atendimento: 'Atendimento',
  visita: 'Visita', proposta: 'Proposta', venda: 'Venda',
}

const CAMPAIGN_STAGE_LABELS: Record<string, string> = {
  new: 'Novo', sent: 'Enviado', attended: 'Atendido',
  scheduled: 'Agendado', presentation: 'Apresentação', proposal: 'Proposta', sale: 'Venda',
}

function formatPTBR(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatCurrencyShort(value: number): string {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (value >= 1_000)     return `R$ ${(value / 1_000).toFixed(0)}k`
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ─── Componente principal ──────────────────────────────────────────────────────
export function ContactCampaignHistory({ contactId }: Props) {
  const { lists }     = useLeadListsStore()
  const { campaigns } = useCampaignsStore()

  const [loading, setLoading] = useState(true)

  const [listMembers,   setListMembers]   = useState<ListMemberRow[]>([])
  const [campaignLeads, setCampaignLeads] = useState<CampaignLeadRow[]>([])
  const [dispatches,    setDispatches]    = useState<DispatchRow[]>([])
  const [funnelLeads,   setFunnelLeads]   = useState<FunnelLeadRow[]>([])
  const [salesRows,     setSalesRows]     = useState<SaleRow[]>([])

  const [expanded, setExpanded] = useState(true)
  const [showAll,  setShowAll]  = useState(false)

  useEffect(() => {
    if (!contactId) return
    setLoading(true)

    Promise.all([
      supabase.from('lead_list_members')
        .select('list_id,imported_at,import_batch')
        .eq('contact_id', contactId)
        .order('imported_at', { ascending: false }),

      // campaign_leads por phone — precisamos do contact para pegar o phone
      supabase.from('contacts').select('phone').eq('id', contactId).single(),

      supabase.from('lead_campaign_dispatches')
        .select('campaign_id,list_id,dispatched_at,message_index')
        .eq('contact_id', contactId)
        .order('dispatched_at', { ascending: false }),

      supabase.from('leads')
        .select('funnel_stage,created_at,stage_changed_at')
        .eq('contact_id', contactId)
        .is('discard_reason', null)
        .order('created_at', { ascending: false }),

      supabase.from('sales')
        .select('date,property_name,value')
        .eq('client_id', contactId)
        .order('date', { ascending: false }),
    ]).then(async ([membersRes, contactRes, dispRes, funnelRes, salesRes]) => {
      setListMembers((membersRes.data ?? []) as ListMemberRow[])
      setDispatches((dispRes.data ?? []) as DispatchRow[])
      setFunnelLeads((funnelRes.data ?? []) as FunnelLeadRow[])
      setSalesRows((salesRes.data ?? []) as SaleRow[])

      // campaign_leads por phone
      if (contactRes.data?.phone) {
        const { data: clData } = await supabase
          .from('campaign_leads')
          .select('campaign_id,funnel_stage,created_at,transferred_at')
          .eq('phone', contactRes.data.phone)
          .order('created_at', { ascending: false })
        setCampaignLeads((clData ?? []) as CampaignLeadRow[])
      }
    }).finally(() => setLoading(false))
  }, [contactId])

  // ── Situação atual ────────────────────────────────────────────────────────────
  const currentStatus = useMemo(() => {
    const items: { kind: EventKind; label: string; sub: string }[] = []

    if (funnelLeads.length > 0) {
      const fl    = funnelLeads[0]
      const stage = FUNNEL_LABELS[fl.funnel_stage] ?? fl.funnel_stage
      items.push({ kind: 'funnel', label: 'Funil principal', sub: `Etapa: ${stage}` })
    }

    campaignLeads.filter(cl => !cl.transferred_at).forEach(cl => {
      const camp  = campaigns.find(c => c.id === cl.campaign_id)
      const stage = CAMPAIGN_STAGE_LABELS[cl.funnel_stage] ?? cl.funnel_stage
      items.push({
        kind:  'campaign',
        label: camp?.name ?? 'Campanha',
        sub:   `Etapa: ${stage}`,
      })
    })

    return items
  }, [funnelLeads, campaignLeads, campaigns])

  // ── Timeline ──────────────────────────────────────────────────────────────────
  const timeline = useMemo<TimelineEvent[]>(() => {
    const events: TimelineEvent[] = []
    let uid = 0

    listMembers.forEach(m => {
      const list = lists.find(l => l.id === m.list_id)
      events.push({
        id:       `list-${uid++}`,
        kind:     'list',
        date:     m.imported_at,
        title:    `Adicionado à lista "${list?.name ?? 'Lista removida'}"`,
        subtitle: m.import_batch ? `Arquivo: ${m.import_batch}` : undefined,
      })
    })

    campaignLeads.forEach(cl => {
      const camp  = campaigns.find(c => c.id === cl.campaign_id)
      const stage = CAMPAIGN_STAGE_LABELS[cl.funnel_stage] ?? cl.funnel_stage
      events.push({
        id:       `camp-${uid++}`,
        kind:     'campaign',
        date:     cl.created_at,
        title:    `Entrou na campanha "${camp?.name ?? 'Campanha removida'}"`,
        subtitle: `Etapa atual: ${stage}`,
        badge:    cl.transferred_at ? 'Transferido' : undefined,
      })
    })

    dispatches.forEach(d => {
      const camp = campaigns.find(c => c.id === d.campaign_id)
      const msgN = d.message_index != null ? `Mensagem ${d.message_index + 1}` : 'Mensagem'
      events.push({
        id:       `disp-${uid++}`,
        kind:     'dispatch',
        date:     d.dispatched_at,
        title:    `Disparo recebido — ${msgN}`,
        subtitle: camp?.name,
      })
    })

    funnelLeads.forEach(fl => {
      const stage = FUNNEL_LABELS[fl.funnel_stage] ?? fl.funnel_stage
      events.push({
        id:       `funnel-${uid++}`,
        kind:     'funnel',
        date:     fl.stage_changed_at ?? fl.created_at,
        title:    'No funil principal',
        subtitle: `Etapa: ${stage}`,
      })
    })

    salesRows.forEach(s => {
      events.push({
        id:       `sale-${uid++}`,
        kind:     'sale',
        date:     s.date + 'T00:00:00',
        title:    `Comprou: ${s.property_name}`,
        subtitle: formatCurrencyShort(s.value),
        badge:    'Venda',
      })
    })

    return events.sort((a, b) => b.date.localeCompare(a.date))
  }, [listMembers, campaignLeads, dispatches, funnelLeads, salesRows, lists, campaigns])

  const displayedEvents = showAll ? timeline : timeline.slice(0, 5)
  const hasMore         = timeline.length > 5

  const totalItems = listMembers.length + campaignLeads.length + dispatches.length + funnelLeads.length + salesRows.length

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4">
        <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-t4">Carregando histórico…</span>
      </div>
    )
  }

  if (totalItems === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <Clock size={24} className="text-t4/50" />
        <p className="text-xs text-t4">Nenhum histórico encontrado para este contato.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Situação atual */}
      {currentStatus.length > 0 && (
        <div className="rounded-xl border border-line bg-s2/30 overflow-hidden">
          <div className="px-3 py-2 border-b border-line/50 bg-s2/50">
            <p className="text-[10px] font-bold text-t4 uppercase tracking-wider">Situação atual</p>
          </div>
          <div className="flex flex-col divide-y divide-line/40">
            {currentStatus.map((s, i) => {
              const cfg  = KIND_CONFIG[s.kind]
              const Icon = cfg.icon
              return (
                <div key={i} className="flex items-center gap-2.5 px-3 py-2.5">
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.bg} border ${cfg.border}`}>
                    <Icon size={11} className={cfg.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-t1 truncate">{s.label}</p>
                    <p className="text-[11px] text-t4">{s.sub}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="flex flex-col gap-0">
        {/* Cabeçalho recolhível */}
        <button
          onClick={() => setExpanded(p => !p)}
          className="flex items-center justify-between w-full py-1.5 group"
        >
          <p className="text-[10px] font-bold text-t4 uppercase tracking-wider flex items-center gap-1.5">
            <Clock size={10} />
            Linha do tempo
            <span className="normal-case font-normal text-t4/60">({timeline.length} eventos)</span>
          </p>
          {expanded
            ? <ChevronUp size={12} className="text-t4 group-hover:text-t2 transition-colors" />
            : <ChevronDown size={12} className="text-t4 group-hover:text-t2 transition-colors" />
          }
        </button>

        {expanded && (
          <div className="flex flex-col">
            {displayedEvents.map((event, idx) => {
              const cfg  = KIND_CONFIG[event.kind]
              const Icon = cfg.icon
              const isLast = idx === displayedEvents.length - 1

              return (
                <div key={event.id} className="flex gap-3">
                  {/* Linha vertical + ícone */}
                  <div className="flex flex-col items-center">
                    <div className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 border ${cfg.bg} ${cfg.border}`}>
                      <Icon size={12} className={cfg.color} />
                    </div>
                    {!isLast && <div className="w-px flex-1 bg-line/40 my-1" />}
                  </div>

                  {/* Conteúdo */}
                  <div className={`flex-1 min-w-0 pb-${isLast ? '0' : '3'}`}>
                    <div className="flex items-start gap-2 flex-wrap pt-1">
                      <p className="text-xs font-medium text-t2 flex-1 leading-snug">{event.title}</p>
                      {event.badge && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border flex-shrink-0
                          ${event.kind === 'sale'
                            ? 'bg-green-500/15 border-green-500/25 text-green-400'
                            : 'bg-violet-500/15 border-violet-500/25 text-violet-400'
                          }`}
                        >
                          {event.badge}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {event.subtitle && (
                        <span className="text-[11px] text-t4 truncate">{event.subtitle}</span>
                      )}
                      <span className="text-[10px] text-t4/60 flex items-center gap-0.5 flex-shrink-0">
                        <Clock size={8} /> {formatPTBR(event.date)}
                      </span>
                    </div>
                    {!isLast && <div className="h-2" />}
                  </div>
                </div>
              )
            })}

            {/* Ver mais / menos */}
            {hasMore && (
              <button
                onClick={() => setShowAll(p => !p)}
                className="flex items-center justify-center gap-1.5 mt-2 py-2 text-[11px] text-t4 hover:text-t2 border border-dashed border-line hover:border-line/80 rounded-xl transition-all"
              >
                {showAll
                  ? <><ChevronUp size={11} /> Ver menos</>
                  : <><ChevronDown size={11} /> Ver {timeline.length - 5} eventos anteriores</>
                }
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
