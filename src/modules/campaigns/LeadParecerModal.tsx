import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Zap, DollarSign, ArrowRight } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { CampaignLead, FunnelStage, LeadSituation } from '../../types'
import { useCampaignLeadsStore } from '../../store/useCampaignLeadsStore'
import { useTasksStore } from '../../store/useTasksStore'
import { useContactsStore } from '../../store/useContactsStore'
import { Campaign } from '../../types'
import { FUNNEL_STAGES, SITUATION_CONFIG } from './config'
import { formatPhone } from '../../lib/formatters'
import toast from 'react-hot-toast'

interface LeadParecerModalProps {
  isOpen:   boolean
  onClose:  () => void
  lead?:    CampaignLead
  campaign?: Campaign
}

export function LeadParecerModal({ isOpen, onClose, lead, campaign }: LeadParecerModalProps) {
  const { update } = useCampaignLeadsStore()
  const tasksStore    = useTasksStore()
  const contactsStore = useContactsStore()
  const navigate      = useNavigate()

  const [stage,          setStageLocal]   = useState<FunnelStage>('new')
  const [situation,      setSituationL]   = useState<LeadSituation | undefined>()
  const [notes,          setNotes]        = useState('')
  const [proposalValue,  setProposalValue]= useState('')

  useEffect(() => {
    if (!isOpen || !lead) return
    setStageLocal(lead.funnelStage)
    setSituationL(lead.situation)
    setNotes(lead.notes ?? '')
    setProposalValue(lead.proposalValue ? String(lead.proposalValue) : '')
  }, [lead, isOpen])

  function handleSave() {
    if (!lead) return

    const prevStage = lead.funnelStage

    // Contato inexistente não pode ficar em etapa do funil
    const effectiveStage: FunnelStage = situation === 'invalid' ? 'new' : stage

    const patch: Partial<CampaignLead> = {
      funnelStage: effectiveStage,
      situation,
      notes: notes.trim() || undefined,
    }

    if (stage === 'proposal' && proposalValue) {
      patch.proposalValue = Number(proposalValue.replace(/\D/g, ''))
    }

    update(lead.id, patch)

    // Auto-create task when reaches "presentation" for the first time
    if (stage === 'presentation' && prevStage !== 'presentation') {
      tasksStore.add({
        title:       `Follow-up: ${lead.name}`,
        description: campaign ? `Campanha: ${campaign.name}` : undefined,
        priority:    'medium',
        status:      'pending',
        category:    'visita',
      })
      toast.success('Etapa atualizada · Tarefa de follow-up criada!')
    } else {
      toast.success('Parecer atualizado')
    }

    onClose()
  }

  function handleAddAsContact() {
    if (!lead) return
    const contact = contactsStore.add({
      name:        lead.name,
      phone:       lead.phone,
      tags:        [],
      hasChildren: false,
      isMarried:   false,
      company:     campaign?.name,
    })
    update(lead.id, { funnelStage: 'sale' })
    toast.success('Contato criado! Registre a venda.')
    navigate(`/vendas?new=1&clientId=${contact.id}&clientName=${encodeURIComponent(lead.name)}`)
    onClose()
  }

  const stagesWithoutNew = FUNNEL_STAGES.filter(s => s.value !== 'new')

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Parecer do Lead" size="md">
      {lead && (
        <div className="flex flex-col gap-6">

          {/* Lead identity */}
          <div className="flex items-center gap-3 p-3 bg-white/4 rounded-xl border border-white/8">
            <div className="w-9 h-9 bg-indigo-500/20 rounded-full flex items-center justify-center text-sm font-bold text-indigo-300 flex-shrink-0">
              {lead.name[0].toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-200">{lead.name}</p>
              <p className="text-xs text-slate-500 tabular-nums">{formatPhone(lead.phone)}</p>
            </div>
          </div>

          {/* Funnel stage */}
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Etapa do Funil</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {stagesWithoutNew.map(s => {
                const active = stage === s.value
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setStageLocal(s.value)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all cursor-pointer
                      ${active
                        ? `${s.bg} ${s.border} ${s.color}`
                        : 'bg-white/3 border-white/8 text-slate-500 hover:border-white/20 hover:text-slate-300'
                      }`}
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${active ? s.dot : 'bg-slate-700'}`} />
                    {s.label}
                    {active && <CheckCircle2 size={12} className="ml-auto" />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Proposal value (only for proposal stage) */}
          {stage === 'proposal' && (
            <div className="flex flex-col gap-1.5 p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign size={14} className="text-amber-400" />
                <p className="text-sm font-medium text-amber-300">Valor da Proposta</p>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">R$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={proposalValue}
                  onChange={e => setProposalValue(e.target.value.replace(/\D/g, ''))}
                  placeholder="0"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>
            </div>
          )}

          {/* Venda stage — add as contact */}
          {stage === 'sale' && (
            <div className="flex flex-col gap-3 p-4 bg-green-500/5 border border-green-500/20 rounded-xl">
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-green-400" />
                <p className="text-sm font-medium text-green-300">Registrar Venda</p>
              </div>
              <p className="text-xs text-slate-500">
                Para vincular ao módulo de vendas, adicione este lead como contato e crie a venda.
              </p>
              <Button
                type="button"
                onClick={handleAddAsContact}
                className="flex items-center gap-2 justify-center bg-green-600 hover:bg-green-500 text-sm"
              >
                Adicionar como Contato + Registrar Venda
                <ArrowRight size={13} />
              </Button>
            </div>
          )}

          {/* Situation */}
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Situação (opcional)</p>
            <div className="flex flex-col gap-2">
              {SITUATION_CONFIG.map(s => {
                const active = situation === s.value
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setSituationL(active ? undefined : s.value)}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm transition-all cursor-pointer text-left
                      ${active
                        ? `${s.bg} border-white/20 ${s.color}`
                        : 'bg-white/3 border-white/8 text-slate-500 hover:border-white/15 hover:text-slate-300'
                      }`}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0
                      ${active ? 'border-current bg-current' : 'border-slate-600'}`}>
                      {active && <div className="w-1.5 h-1.5 rounded-full bg-[#0F1117]" />}
                    </div>
                    {s.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Observações</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Anotações sobre este lead..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
            />
          </div>

          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button className="flex-1" onClick={handleSave}>Salvar parecer</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
