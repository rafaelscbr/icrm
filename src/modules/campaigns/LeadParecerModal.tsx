import { useState, useEffect } from 'react'
import { CheckCircle2, GitMerge, Sparkles, ArrowRight, Loader2 } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { CampaignLead, FunnelStage, Lead, LeadSituation, INVALID_PHONE_SITUATIONS } from '../../types'
import { useCampaignLeadsStore } from '../../store/useCampaignLeadsStore'
import { useDisparosStore } from '../../store/useDisparosStore'
import { useAuthStore } from '../../store/useAuthStore'
import { Campaign } from '../../types'
import { FUNNEL_STAGES, SITUATION_CONFIG } from './config'
import { formatPhone } from '../../lib/formatters'
import { TransferToFunnelModal } from './TransferToFunnelModal'
import { VisitaTaskModal } from './VisitaTaskModal'
import { supabase } from '../../lib/supabase'
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
  const { profile }          = useAuthStore()

  const [stage,          setStageLocal]   = useState<FunnelStage>('new')
  const [situation,      setSituationL]   = useState<LeadSituation | undefined>()
  const [notes,          setNotes]        = useState('')
  const [isSaving,       setIsSaving]     = useState(false)
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

    const isInvalidPhone = situation ? INVALID_PHONE_SITUATIONS.has(situation) : false
    const effectiveStage: FunnelStage = isInvalidPhone ? 'new' : stage
    const stageChanged  = effectiveStage !== prevStage

    const extraFields: Partial<CampaignLead> = {
      situation,
      notes: notes.trim() || undefined,
    }

    setIsSaving(true)
    try {
      // Banco deve confirmar antes de qualquer atualização na interface.
      // Timeout de 12s: em redes lentas (mobile) o fetch pode ficar pendurado
      // indefinidamente — o timeout garante que o modal nunca trava em "Salvando…".
      const actorBy = profile ? { id: profile.id, name: profile.name } : undefined
      const saveOp = stageChanged
        ? setStage(lead.id, effectiveStage, extraFields, actorBy)
        : update(lead.id, extraFields)

      await Promise.race([
        saveOp,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 12_000)
        ),
      ])
    } catch {
      // Erro (DB falhou ou timeout) — modal permanece aberto para nova tentativa.
      setIsSaving(false)
      toast.error('Não foi possível salvar o parecer. Verifique sua conexão e tente novamente.')
      return
    }

    // Banco confirmou — operações secundárias com timeout de segurança.
    const prevWasInvalid = prevSituation ? INVALID_PHONE_SITUATIONS.has(prevSituation) : false
    try {
      if (isInvalidPhone && !prevWasInvalid) {
        await Promise.race([
          (async () => {
            await refund(lead.id)
            await supabase
              .from('contacts')
              .update({ invalid_contact: true })
              .eq('phone', lead.phone)
          })(),
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 8000)
          ),
        ])
        toast.success('Parecer salvo · 1 crédito devolvido ao limite do dia')
      } else if (stage === 'scheduled' && prevStage !== 'scheduled') {
        toast.success('Agendamento registrado! Transfira este lead para o funil principal.')
      } else {
        toast.success('Parecer salvo com sucesso')
      }
    } catch {
      // Parecer salvo — mas operação secundária (devolução de crédito) falhou
      toast('Parecer salvo. Crédito não devolvido — verifique sua conexão e tente novamente.', {
        duration: 8000,
      })
    } finally {
      setIsSaving(false)
      onClose()
    }
  }

const stagesWithoutNew = FUNNEL_STAGES.filter(s => s.value !== 'new')

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Parecer do Lead" size="md">
      {lead && (
        <div className="flex flex-col gap-6">

          {/* Lead identity */}
          <div className="flex items-center gap-3 p-3 bg-s2/60 rounded-[14px] border border-line">
            <div className="w-9 h-9 bg-s2 border border-line rounded-[12px] flex items-center justify-center font-heading text-sm font-bold text-t2 flex-shrink-0">
              {lead.name[0].toUpperCase()}
            </div>
            <div>
              <p className="font-heading text-sm font-bold text-t1 tracking-[-0.01em]">{lead.name}</p>
              <p className="font-label text-xs text-t3 tabular-nums tracking-wide">{formatPhone(lead.phone)}</p>
            </div>
          </div>

          {/* Funnel stage */}
          <div>
            <p className="font-label text-[10px] font-medium text-t3 uppercase tracking-[0.12em] mb-3">Etapa do funil</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Etapa do funil">
              {stagesWithoutNew.map(s => {
                const active = stage === s.value
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setStageLocal(s.value)}
                    role="radio"
                    aria-checked={active}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-[14px] border text-sm font-medium transition-all duration-150 cursor-pointer
                      ${active
                        ? `${s.bg} ${s.border} ${s.color}`
                        : 'bg-s2/50 border-line text-t3 hover:border-line-strong hover:text-t2'
                      }`}
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${active ? s.dot : 'bg-s3'}`} />
                    {s.label}
                    {active && <CheckCircle2 size={12} strokeWidth={1.6} className="ml-auto" />}
                  </button>
                )
              })}
            </div>
          </div>


          {/* Situation */}
          <div>
            <p className="font-label text-[10px] font-medium text-t3 uppercase tracking-[0.12em] mb-3">Situação (opcional)</p>
            <div className="flex flex-col gap-2" role="radiogroup" aria-label="Situação do lead">
              {SITUATION_CONFIG.map(s => {
                const active = situation === s.value
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setSituationL(active ? undefined : s.value)}
                    role="radio"
                    aria-checked={active}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-[14px] border text-sm transition-all duration-150 cursor-pointer text-left
                      ${active
                        ? `${s.bg} border-line-strong ${s.color}`
                        : 'bg-s2/50 border-line text-t3 hover:border-line-input hover:text-t2'
                      }`}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0
                      ${active ? 'border-current bg-current' : 'border-line-strong'}`}>
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
            <label htmlFor="parecer-notes" className="font-label text-[10px] font-medium text-t3 uppercase tracking-[0.12em]">Observações</label>
            <textarea
              id="parecer-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Anotações sobre este lead…"
              className="w-full bg-s3/50 border border-line rounded-[14px] px-3 py-2.5 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand-tint resize-none"
            />
          </div>

          {/* Sugestão de migração quando seleciona 'scheduled' e ainda não migrou */}
          {stage === 'scheduled' && !lead.transferredAt && (
            <div className="flex items-start gap-3 p-3.5 bg-brand-tint border border-brand/40 rounded-[14px]">
              <Sparkles size={14} strokeWidth={1.6} className="text-brand flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-heading text-xs font-bold text-t1">Pronto para o funil principal</p>
                <p className="text-[11px] text-t3 mt-0.5 leading-relaxed">
                  Lead agendado — migre agora com histórico e produto vinculado para contar na pipeline de visitas.
                </p>
                <button
                  type="button"
                  onClick={() => setShowTransfer(true)}
                  className="mt-2 flex items-center gap-1.5 font-heading text-[11px] font-bold text-brand-text hover:text-brand transition-colors"
                >
                  <ArrowRight size={11} strokeWidth={1.6} />
                  Migrar para o funil principal
                </button>
              </div>
            </div>
          )}

          {/* Já migrado — info */}
          {lead.transferredAt && (
            <div className="flex items-center gap-2.5 p-3 bg-s2/60 border border-line rounded-[14px]">
              <GitMerge size={13} strokeWidth={1.6} className="text-t4 flex-shrink-0" />
              <p className="text-xs text-t3">
                Migrado para o funil principal em <span className="font-label tabular-nums">{new Date(lead.transferredAt).toLocaleDateString('pt-BR')}</span>
              </p>
            </div>
          )}

          {/* Transferir para Funil Principal */}
          <div className="pt-1 border-t border-line">
            <button
              type="button"
              onClick={() => setShowTransfer(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 font-heading text-xs font-bold text-t2 hover:text-t1 bg-s2 hover:bg-s3 border border-line hover:border-line-strong rounded-[14px] transition-all duration-150"
            >
              <GitMerge size={13} strokeWidth={1.6} />
              {lead.transferredAt ? 'Migrar novamente para o Funil' : 'Enviar para o Funil Principal'}
            </button>
          </div>

          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={onClose} disabled={isSaving}>Cancelar</Button>
            <Button className="flex-1 flex items-center justify-center gap-2" onClick={handleSave} disabled={isSaving}>
              {isSaving ? <><Loader2 size={13} className="animate-spin" /> Salvando…</> : 'Salvar parecer'}
            </Button>
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
