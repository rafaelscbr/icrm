import { useState } from 'react'
import { MessageCircle, FileText, ChevronDown } from 'lucide-react'
import { LeadParecerModal } from './LeadParecerModal'
import { CampaignLead, Campaign } from '../../types'
import { useCampaignLeadsStore } from '../../store/useCampaignLeadsStore'
import { FUNNEL_STAGES, SITUATION_CONFIG } from './config'
import { formatPhone, whatsappUrl } from '../../lib/formatters'
import toast from 'react-hot-toast'

interface KanbanTabProps {
  leads:    CampaignLead[]
  campaign: Campaign
}

const COLUMN_PAGE = 20   // quantos cards mostrar inicialmente por coluna

function LeadCard({
  lead, campaign, onParecer,
}: { lead: CampaignLead; campaign: Campaign; onParecer: (l: CampaignLead) => void }) {
  const { markContacted } = useCampaignLeadsStore()
  const situation = SITUATION_CONFIG.find(s => s.value === lead.situation)

  function handleWhatsApp(e: React.MouseEvent) {
    e.stopPropagation()
    const msg = campaign.message.replace(/\{nome\}/gi, lead.name)
    window.open(whatsappUrl(lead.phone, msg), '_blank')
    const wasNew = lead.funnelStage === 'new'
    markContacted(lead.id)
    if (wasNew) toast.success('1ª mensagem registrada!')
  }

  return (
    <div
      onClick={() => onParecer(lead)}
      className="bg-white/4 hover:bg-white/7 border border-white/8 hover:border-white/15 rounded-xl p-3 cursor-pointer transition-all group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-medium text-slate-200 truncate flex-1">{lead.name}</p>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={handleWhatsApp}
            className="p-1 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"
            title="WhatsApp"
          >
            <MessageCircle size={11} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onParecer(lead) }}
            className="p-1 rounded-lg bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors"
            title="Parecer"
          >
            <FileText size={11} />
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-500 tabular-nums">{formatPhone(lead.phone)}</p>

      {situation && (
        <span className={`mt-2 inline-block text-[10px] font-medium px-1.5 py-0.5 rounded ${situation.bg} ${situation.color}`}>
          {situation.label}
        </span>
      )}

      {lead.proposalValue && lead.funnelStage === 'proposal' && (
        <p className="text-xs text-amber-400 font-medium mt-1">
          R$ {lead.proposalValue.toLocaleString('pt-BR')}
        </p>
      )}
    </div>
  )
}

// Coluna individual com paginação própria
function KanbanColumn({
  stage, leads, campaign, onParecer,
}: {
  stage: typeof FUNNEL_STAGES[number]
  leads: CampaignLead[]
  campaign: Campaign
  onParecer: (l: CampaignLead) => void
}) {
  const [visible, setVisible] = useState(COLUMN_PAGE)
  const shown  = leads.slice(0, visible)
  const hasMore = visible < leads.length

  return (
    <div className="flex-shrink-0 w-60 flex flex-col">
      {/* Cabeçalho */}
      <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl ${stage.bg} border ${stage.border} mb-3`}>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${stage.dot}`} />
          <span className={`text-xs font-semibold ${stage.color}`}>{stage.label}</span>
        </div>
        <span className={`text-xs font-bold tabular-nums ${stage.color} opacity-70`}>
          {leads.length.toLocaleString('pt-BR')}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 flex-1">
        {leads.length === 0 ? (
          <div className="flex items-center justify-center py-8 border border-dashed border-white/8 rounded-xl">
            <p className="text-xs text-slate-700">Nenhum lead</p>
          </div>
        ) : (
          <>
            {shown.map(lead => (
              <LeadCard
                key={lead.id}
                lead={lead}
                campaign={campaign}
                onParecer={onParecer}
              />
            ))}

            {hasMore && (
              <button
                onClick={() => setVisible(v => v + COLUMN_PAGE)}
                className="flex items-center justify-center gap-1.5 py-2 text-xs text-slate-500 hover:text-slate-300 border border-dashed border-white/10 hover:border-white/20 rounded-xl transition-all cursor-pointer"
              >
                <ChevronDown size={12} />
                Ver mais {Math.min(COLUMN_PAGE, leads.length - visible).toLocaleString('pt-BR')} de {(leads.length - visible).toLocaleString('pt-BR')}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export function KanbanTab({ leads, campaign }: KanbanTabProps) {
  const [parecerLead, setParecerLead] = useState<CampaignLead | undefined>()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-[500px]">
        {FUNNEL_STAGES.map(stage => (
          <KanbanColumn
            key={stage.value}
            stage={stage}
            leads={leads.filter(l => l.funnelStage === stage.value)}
            campaign={campaign}
            onParecer={setParecerLead}
          />
        ))}
      </div>

      <LeadParecerModal
        isOpen={Boolean(parecerLead)}
        onClose={() => setParecerLead(undefined)}
        lead={parecerLead}
        campaign={campaign}
      />
    </div>
  )
}
