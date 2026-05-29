import { useState, useEffect } from 'react'
import { ArrowRight, AlertTriangle, CheckCircle2, GitMerge, ExternalLink } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { CampaignLead, FunnelStage, LeadFunnelStage, Campaign } from '../../types'
import { useLeadsStore } from '../../store/useLeadsStore'
import { useCampaignLeadsStore } from '../../store/useCampaignLeadsStore'
import { formatPhone } from '../../lib/formatters'
import { STAGE_CONFIG } from '../leads/LeadKanban'
import toast from 'react-hot-toast'

// ── Mapeamento de etapas: campanha → funil principal ──────────────────────────

const STAGE_MAP: Record<FunnelStage, LeadFunnelStage> = {
  new:          'lead',
  sent:         'followup',
  attended:     'atendimento',
  scheduled:    'visita',
  presentation: 'visita',
  proposal:     'proposta',
  sale:         'venda',
}

const FUNNEL_STAGES: LeadFunnelStage[] = ['lead', 'followup', 'atendimento', 'visita', 'proposta', 'venda']

// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  isOpen:    boolean
  onClose:   () => void
  lead?:     CampaignLead
  campaign?: Campaign
}

export function TransferToFunnelModal({ isOpen, onClose, lead, campaign }: Props) {
  const { add, leads }             = useLeadsStore()
  const { markAsTransferred }      = useCampaignLeadsStore()

  const [funnelStage, setFunnelStage] = useState<LeadFunnelStage>('atendimento')
  const [ticket,      setTicket]      = useState('')
  const [notes,       setNotes]       = useState('')

  useEffect(() => {
    if (!isOpen || !lead) return
    setFunnelStage(STAGE_MAP[lead.funnelStage] ?? 'atendimento')
    setTicket(
      lead.proposalValue
        ? String(lead.proposalValue)
        : campaign?.averageTicket
          ? String(campaign.averageTicket)
          : ''
    )
    setNotes(lead.notes ?? '')
  }, [isOpen, lead, campaign])

  const duplicate = lead ? leads.find(l => l.phone === lead.phone) : undefined

  function handleTransfer() {
    if (!lead) return

    const newLead = add({
      name:          lead.name,
      phone:         lead.phone,
      email:         lead.email,
      origin:        'campanha',
      funnelStage,
      followupStep:  0,
      propertyId:    lead.propertyId,
      averageTicket: ticket ? Number(ticket.replace(/\D/g, '')) : undefined,
      notes:         [
        notes.trim(),
        campaign ? `Origem: campanha "${campaign.name}"` : '',
      ].filter(Boolean).join('\n') || undefined,
    })

    markAsTransferred(lead.id, newLead.id)
    toast.success(`${lead.name} migrado para o funil principal`)
    onClose()
  }

  if (!lead) return null

  const stageConf = STAGE_CONFIG[funnelStage]

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Enviar para o Funil Principal" size="md">
      <div className="flex flex-col gap-5">

        {/* Lead info */}
        <div className="flex items-center gap-3 p-3.5 bg-s2/60 border border-line rounded-xl">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/30 to-purple-500/20 flex items-center justify-center text-sm font-bold text-violet-200 flex-shrink-0">
            {lead.name[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-200 truncate">{lead.name}</p>
            <p className="text-xs text-slate-500">{formatPhone(lead.phone)}</p>
          </div>
          {campaign && (
            <div className="flex-shrink-0 text-right">
              <p className="text-[10px] text-slate-600">Campanha</p>
              <p className="text-xs text-slate-400 font-medium truncate max-w-[120px]">{campaign.name}</p>
            </div>
          )}
        </div>

        {/* Já transferido anteriormente */}
        {lead.transferredAt && (
          <div className="flex items-start gap-2.5 p-3.5 bg-violet-500/8 border border-violet-500/25 rounded-xl">
            <ExternalLink size={14} className="text-violet-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-violet-300">Já migrado para o funil principal</p>
              <p className="text-[11px] text-violet-400/70 mt-0.5">
                Este lead foi transferido em {new Date(lead.transferredAt).toLocaleDateString('pt-BR')}.
                Migrar novamente criará uma segunda entrada no funil.
              </p>
            </div>
          </div>
        )}

        {/* Duplicate warning */}
        {duplicate && (
          <div className="flex items-start gap-2.5 p-3.5 bg-amber-500/8 border border-amber-500/25 rounded-xl">
            <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-amber-300">Lead já existe no funil</p>
              <p className="text-[11px] text-amber-400/70 mt-0.5">
                Já há um lead com este telefone na etapa <span className="font-medium">{STAGE_CONFIG[duplicate.funnelStage].label}</span>.
                Você pode transferir mesmo assim — ficará como entrada duplicada.
              </p>
            </div>
          </div>
        )}

        {/* Etapa de entrada */}
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
            Etapa de entrada no funil
          </p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {FUNNEL_STAGES.map(stage => {
              const conf   = STAGE_CONFIG[stage]
              const active = funnelStage === stage
              return (
                <button
                  key={stage}
                  onClick={() => setFunnelStage(stage)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                    active
                      ? `${conf.bg} ${conf.border} ${conf.color}`
                      : 'bg-s2/50 border-line text-slate-500 hover:border-line-strong hover:text-slate-300'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? conf.dot : 'bg-slate-700'}`} />
                  {conf.label}
                  {active && <CheckCircle2 size={11} className="ml-auto flex-shrink-0" />}
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-slate-600 mt-2">
            Etapa mapeada automaticamente da campanha: <span className="text-slate-500 font-medium">{stageConf.label}</span>
          </p>
        </div>

        {/* Ticket médio */}
        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
            Ticket médio (opcional)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">R$</span>
            <input
              type="text"
              inputMode="numeric"
              value={ticket ? Number(ticket.replace(/\D/g, '')).toLocaleString('pt-BR') : ''}
              onChange={e => setTicket(e.target.value.replace(/\D/g, ''))}
              placeholder="0"
              className="w-full bg-s3/50 border border-line rounded-xl pl-10 pr-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            />
          </div>
        </div>

        {/* Notas */}
        <div>
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
            Notas (opcional)
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="Observações que vão para o lead no funil..."
            className="w-full bg-s3/50 border border-line rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none"
          />
        </div>

        {/* Flow preview */}
        <div className="flex items-center gap-2 px-3 py-2.5 bg-violet-500/5 border border-violet-500/15 rounded-xl">
          <GitMerge size={13} className="text-violet-400 flex-shrink-0" />
          <span className="text-[11px] text-slate-500">Campanha</span>
          <ArrowRight size={11} className="text-slate-700 flex-shrink-0" />
          <span className={`text-[11px] font-semibold ${stageConf.color}`}>{stageConf.label}</span>
          <span className="ml-auto text-[10px] text-slate-600">origem: campanha</span>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="flex-1 flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500"
            onClick={handleTransfer}
          >
            <ArrowRight size={14} />
            Transferir para Funil
          </Button>
        </div>

      </div>
    </Modal>
  )
}
