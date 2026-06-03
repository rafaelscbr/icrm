import { useState, useEffect } from 'react'
import { CheckCircle2, GitMerge, Sparkles, ArrowRight } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { CampaignLead, FunnelStage, Lead, LeadSituation, INVALID_PHONE_SITUATIONS } from '../../types'
import { useCampaignLeadsStore } from '../../store/useCampaignLeadsStore'
import { useDisparosStore } from '../../store/useDisparosStore'
import { Campaign } from '../../types'
import { FUNNEL_STAGES, SITUATION_CONFIG } from './config'
import { formatPhone } from '../../lib/formatters'
import { TransferToFunnelModal } from './TransferToFunnelModal'
import { VisitaTaskModal } from './VisitaTaskModal'
import toast from 'react-hot-toast'

interface LeadParecerModalProps {
  isOpen:   boolean
  onClose:  () => void
  lead?:    CampaignLead
  campaign?: Campaign
}

export function LeadParecerModal({ isOpen, onClose, lead, campaign }: LeadParecerModalProps) {
  const { update, setStage } = useCampaignLeadsStore()
  const { refund }           = useDisparosStore()

  const [stage,          setStageLocal]   = useState<FunnelStage>('new')
  const [situation,      setSituationL]   = useState<LeadSituation | undefined>()
  const [notes,          setNotes]        = useState('')
  const [showTransfer,   setShowTransfer]   = useState(false)
  const [visitaLead,     setVisitaLead]     = useState<Lead | undefined>()

  useEffect(() => {
    if (!isOpen || !lead) return
    setStageLocal(lead.funnelStage)
    setSituationL(lead.situation)
    setNotes(lead.notes ?? '')
  }, [lead, isOpen])

  async function handleSave() {
    if (!lead) return

    const prevSituation = lead.situation
    const prevStage     = lead.funnelStage

    // Telefone inválido → mantém na fila (stage 'new') para não sumir dos relatórios
    const isInvalidPhone = situation ? INVALID_PHONE_SITUATIONS.has(situation) : false
    const effectiveStage: FunnelStage = isInvalidPhone ? 'new' : stage
    const stageChanged  = effectiveStage !== prevStage

    const extraFields: Partial<CampaignLead> = {
      situation,
      notes: notes.trim() || undefined,
    }

    if (stageChanged) {
      setStage(lead.id, effectiveStage, extraFields)
    } else {
      update(lead.id, extraFields)
    }

    // Devolve 1 crédito ao limite diário se:
    // 1. A nova situação é de telefone inválido
    // 2. A situação ANTERIOR não era inválida (primeira vez que marca)
    const prevWasInvalid = prevSituation ? INVALID_PHONE_SITUATIONS.has(prevSituation) : false
    if (isInvalidPhone && !prevWasInvalid) {
      await refund(lead.id)
      toast.success('Parecer atualizado · 1 crédito devolvido ao limite do dia', { icon: '↩️' })
    } else if (stage === 'scheduled' && prevStage !== 'scheduled') {
      toast.success('Agendamento registrado! Transfira este lead para o funil principal.')
    } else {
      toast.success('Parecer atualizado')
    }

    onClose()
  }

const stagesWithoutNew = FUNNEL_STAGES.filter(s => s.value !== 'new')

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Parecer do Lead" size="md">
      {lead && (
        <div className="flex flex-col gap-6">

          {/* Lead identity */}
          <div className="flex items-center gap-3 p-3 bg-s2/60 rounded-xl border border-line">
            <div className="w-9 h-9 bg-brand-tint rounded-full flex items-center justify-center text-sm font-bold text-brand-text flex-shrink-0">
              {lead.name[0].toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-t1">{lead.name}</p>
              <p className="text-xs text-t3 tabular-nums">{formatPhone(lead.phone)}</p>
            </div>
          </div>

          {/* Funnel stage */}
          <div>
            <p className="text-xs font-medium text-t3 uppercase tracking-wider mb-3">Etapa do Funil</p>
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
                        : 'bg-s2/50 border-line text-t3 hover:border-line-strong hover:text-t2'
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


          {/* Situation */}
          <div>
            <p className="text-xs font-medium text-t3 uppercase tracking-wider mb-3">Situação (opcional)</p>
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
                        ? `${s.bg} border-line-strong ${s.color}`
                        : 'bg-s2/50 border-line text-t3 hover:border-line-input hover:text-t2'
                      }`}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0
                      ${active ? 'border-current bg-current' : 'border-slate-600'}`}>
                      {active && <div className="w-1.5 h-1.5 rounded-full page-bg" />}
                    </div>
                    {s.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-t3 uppercase tracking-wider">Observações</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Anotações sobre este lead..."
              className="w-full bg-s3/50 border border-line rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
            />
          </div>

          {/* Sugestão de migração quando seleciona 'scheduled' e ainda não migrou */}
          {stage === 'scheduled' && !lead.transferredAt && (
            <div className="flex items-start gap-3 p-3.5 bg-violet-500/8 border border-violet-500/30 rounded-xl">
              <Sparkles size={14} className="text-violet-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-violet-200">Pronto para o funil principal</p>
                <p className="text-[11px] text-t3 mt-0.5 leading-relaxed">
                  Lead agendado — migre agora com histórico e produto vinculado para contar na pipeline de visitas.
                </p>
                <button
                  type="button"
                  onClick={() => setShowTransfer(true)}
                  className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-violet-300 hover:text-violet-100 transition-colors"
                >
                  <ArrowRight size={11} />
                  Migrar para o funil principal
                </button>
              </div>
            </div>
          )}

          {/* Já migrado — info */}
          {lead.transferredAt && (
            <div className="flex items-center gap-2.5 p-3 bg-violet-500/5 border border-violet-500/15 rounded-xl">
              <GitMerge size={13} className="text-violet-400 flex-shrink-0" />
              <p className="text-xs text-violet-300/80">
                Migrado para o funil principal em {new Date(lead.transferredAt).toLocaleDateString('pt-BR')}
              </p>
            </div>
          )}

          {/* Transferir para Funil Principal */}
          <div className="pt-1 border-t border-line">
            <button
              type="button"
              onClick={() => setShowTransfer(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-violet-300 hover:text-white bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/25 hover:border-violet-500/40 rounded-xl transition-all"
            >
              <GitMerge size={13} />
              {lead.transferredAt ? 'Migrar novamente para o Funil' : 'Enviar para o Funil Principal'}
            </button>
          </div>

          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button className="flex-1" onClick={handleSave}>Salvar parecer</Button>
          </div>
        </div>
      )}

      <TransferToFunnelModal
        isOpen={showTransfer}
        onClose={() => setShowTransfer(false)}
        lead={lead}
        campaign={campaign}
        onTransferred={newLead => setVisitaLead(newLead)}
      />

      {visitaLead && (
        <VisitaTaskModal
          isOpen
          onClose={() => setVisitaLead(undefined)}
          lead={visitaLead}
        />
      )}
    </Modal>
  )
}
