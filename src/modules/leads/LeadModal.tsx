import { useState } from 'react'
import {
  X, Phone, Mail, MessageCircle, ArrowRight, UserCheck,
  Building2, DollarSign, Trash2, RotateCcw, Edit2,
  Calendar, Tag, AlertTriangle, CheckCircle2, Clock, ClipboardList, Flame,
} from 'lucide-react'
import { Lead, LeadDiscardReason } from '../../types'
import { useLeadsStore } from '../../store/useLeadsStore'
import { useContactsStore } from '../../store/useContactsStore'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { useLeadInteractionsStore } from '../../store/useLeadInteractionsStore'
import { formatPhone, formatCurrencyFull, whatsappUrl } from '../../lib/formatters'
import { LeadForm } from './LeadForm'
import { TaskForm } from '../tasks/TaskForm'
import { LeadTimeline } from './LeadTimeline'
import toast from 'react-hot-toast'

const DISCARD_REASONS: { value: LeadDiscardReason; label: string; icon: string }[] = [
  { value: 'sem_condicao',        label: 'Sem condição financeira', icon: '💸' },
  { value: 'fora_de_nicho',       label: 'Fora do nicho de atuação', icon: '🎯' },
  { value: 'parou_de_responder',  label: 'Parou de responder',      icon: '🔇' },
  { value: 'nunca_respondeu',     label: 'Nunca respondeu',         icon: '📵' },
  { value: 'telefone_invalido',   label: 'Telefone inválido',       icon: '❌' },
]

const STAGE_CONFIG = {
  lead:        { label: 'Lead',        color: 'text-slate-300',  bg: 'bg-slate-500/20',   border: 'border-slate-500/30'   },
  followup:    { label: 'Followup',    color: 'text-blue-300',   bg: 'bg-blue-500/20',    border: 'border-blue-500/30'    },
  atendimento: { label: 'Atendimento', color: 'text-violet-300', bg: 'bg-violet-500/20',  border: 'border-violet-500/30'  },
  visita:      { label: 'Visita',      color: 'text-amber-300',  bg: 'bg-amber-500/20',   border: 'border-amber-500/30'   },
  proposta:    { label: 'Proposta',    color: 'text-orange-300', bg: 'bg-orange-500/20',  border: 'border-orange-500/30'  },
  venda:       { label: 'Venda',       color: 'text-green-300',  bg: 'bg-green-500/20',   border: 'border-green-500/30'   },
}

const ORIGIN_CONFIG: Record<string, { label: string; emoji: string; color: string }> = {
  felicita:  { label: 'Felicità',  emoji: '✨', color: 'text-rose-400'   },
  meta_ads:  { label: 'Meta ADS',  emoji: '📱', color: 'text-blue-400'   },
  portal:    { label: 'Portal',    emoji: '🌐', color: 'text-cyan-400'   },
  offline:   { label: 'Offline',   emoji: '🤝', color: 'text-amber-400'  },
  campanha:  { label: 'Campanha',  emoji: '📣', color: 'text-violet-400' },
}

interface LeadModalProps {
  lead: Lead
  onClose: () => void
}

export function LeadModal({ lead: initialLead, onClose }: LeadModalProps) {
  const { discard, restore, remove, convertToContact, advanceFollowup, toggleFlag, leads } = useLeadsStore()
  // Always read the live version from the store so edits are reflected immediately
  const lead = leads.find(l => l.id === initialLead.id) ?? initialLead

  const { add: addContact, getById } = useContactsStore()
  const { add: addInteraction } = useLeadInteractionsStore()
  const { properties } = usePropertiesStore()

  const [activeTab, setActiveTab] = useState<'detalhes' | 'historico'>('detalhes')
  const [showDiscard, setShowDiscard] = useState(false)
  const [selectedReason, setSelectedReason] = useState<LeadDiscardReason | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showTaskForm, setShowTaskForm] = useState(false)

  const property = lead.propertyId ? properties.find(p => p.id === lead.propertyId) : undefined
  const contact = lead.contactId ? getById(lead.contactId) : undefined
  const stageConf = STAGE_CONFIG[lead.funnelStage]
  const originConf = ORIGIN_CONFIG[lead.origin]

  const isDiscarded = !!lead.discardReason
  const isLinked = !!lead.contactId   // already linked to a contact (new arch or converted)

  function handleWhatsApp() {
    window.open(whatsappUrl(lead.phone), '_blank')
    advanceFollowup(lead.id)
    const nextStep = lead.funnelStage === 'lead' ? 1 : Math.min(lead.followupStep + 1, 5)
    addInteraction({
      leadId: lead.id,
      type: 'whatsapp',
      description: 'Interagiu via WhatsApp',
      interactedAt: new Date().toISOString(),
    })
    toast.success(`Interação registrada · ${lead.funnelStage === 'lead' ? '1ª' : `${nextStep}ª`} mensagem`)
  }

  function handleWhatsAppOpen() {
    window.open(whatsappUrl(lead.phone), '_blank')
  }

  function handleDiscard() {
    if (!selectedReason) { toast.error('Selecione um motivo'); return }
    discard(lead.id, selectedReason)
    toast.success('Lead descartado')
    setShowDiscard(false)
    onClose()
  }

  function handleConvert() {
    if (isLinked) return
    const newContact = addContact({
      name: lead.name,
      phone: lead.phone,
      company: undefined,
      birthdate: undefined,
      photoUrl: undefined,
      tags: [],
      hasChildren: false,
      childrenNames: undefined,
      isMarried: false,
      spouseName: undefined,
    })
    convertToContact(lead.id, newContact.id)
    toast.success('Lead convertido em contato!')
  }

  function handleRestore() {
    restore(lead.id)
    toast.success('Lead restaurado')
    onClose()
  }

  function handleDelete() {
    remove(lead.id)
    toast.success('Lead excluído')
    onClose()
  }

  const followupLabel = lead.funnelStage === 'followup' && lead.followupStep > 0
    ? `${lead.followupStep}ª mensagem`
    : null

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full max-w-md modal-surface rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
          {/* Header */}
          <div className={`px-5 py-4 border-b border-white/10 ${isDiscarded ? 'bg-red-500/5' : lead.flagged ? 'bg-gradient-to-r from-amber-500/10 to-orange-500/5' : 'bg-gradient-to-r from-white/3 to-transparent'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-base font-black ${isDiscarded ? 'bg-red-500/20 text-red-300' : lead.flagged ? 'bg-amber-500/20 border border-amber-500/30 text-amber-200' : 'bg-white/8 border border-white/10 text-slate-200'}`}>
                  {lead.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-100 leading-tight">{lead.name}</h2>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${stageConf.bg} ${stageConf.color} ${stageConf.border}`}>
                      {stageConf.label}
                      {followupLabel && <span className="opacity-70">· {followupLabel}</span>}
                    </span>
                    {isLinked && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/25">
                        <CheckCircle2 size={9} /> Contato vinculado
                      </span>
                    )}
                    {isDiscarded && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/25">
                        <AlertTriangle size={9} /> Descartado
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/8 text-slate-500 hover:text-slate-200 transition-colors flex-shrink-0">
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 px-5 pt-3 pb-0 border-b border-white/6">
            {(['detalhes', 'historico'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg border-b-2 transition-all ${
                  activeTab === tab
                    ? 'text-blue-400 border-blue-500'
                    : 'text-slate-500 border-transparent hover:text-slate-300'
                }`}
              >
                {tab === 'detalhes' ? 'Detalhes' : 'Histórico'}
              </button>
            ))}
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-4 max-h-[55vh] overflow-y-auto">
            {activeTab === 'historico' ? (
              <LeadTimeline leadId={lead.id} />
            ) : (<>

            {/* Contatos */}
            <div className="space-y-2">
              <a href={`tel:${lead.phone}`} className="flex items-center gap-3 group">
                <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 group-hover:bg-green-500/15 transition-colors">
                  <Phone size={13} className="text-slate-500 group-hover:text-green-400 transition-colors" />
                </div>
                <span className="text-sm text-slate-300 group-hover:text-green-400 transition-colors">{formatPhone(lead.phone)}</span>
              </a>
              {lead.email && (
                <a href={`mailto:${lead.email}`} className="flex items-center gap-3 group">
                  <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 group-hover:bg-violet-500/15 transition-colors">
                    <Mail size={13} className="text-slate-500 group-hover:text-blue-400 transition-colors" />
                  </div>
                  <span className="text-sm text-slate-300 group-hover:text-blue-400 transition-colors">{lead.email}</span>
                </a>
              )}
            </div>

            {/* Origem + Data */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Tag size={13} className="text-slate-500" />
                <span className={`text-sm font-medium ${originConf.color}`}>
                  {originConf.emoji} {originConf.label}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-500">
                <Calendar size={12} />
                <span className="text-xs">{new Date(lead.createdAt).toLocaleDateString('pt-BR')}</span>
              </div>
            </div>

            {/* Imóvel cadastrado */}
            {property && (
              <div className="bg-white/3 border border-white/8 rounded-xl p-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center flex-shrink-0">
                  <Building2 size={14} className="text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">{property.name}</p>
                  <p className="text-xs text-slate-500">{property.neighborhood} · {property.kind === 'off_plan' ? 'Lançamento' : 'Pronto'}</p>
                </div>
                <span className="text-sm font-semibold text-violet-400 flex-shrink-0">{formatCurrencyFull(property.value)}</span>
              </div>
            )}

            {/* Imóvel nome livre (não cadastrado) */}
            {!property && lead.propertyName && (
              <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                  <Building2 size={14} className="text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-amber-200 truncate">{lead.propertyName}</p>
                  <p className="text-xs text-amber-400/60">Imóvel não cadastrado no sistema</p>
                </div>
              </div>
            )}

            {/* Ticket sem imóvel */}
            {!property && !lead.propertyName && lead.averageTicket && (
              <div className="flex items-center gap-2 text-slate-400">
                <DollarSign size={14} className="text-violet-400" />
                <span className="text-sm">Ticket: <span className="font-semibold text-violet-300">{formatCurrencyFull(lead.averageTicket)}</span></span>
              </div>
            )}

            {/* Followup progress */}
            {lead.funnelStage === 'followup' && (
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3">
                <p className="text-xs font-medium text-blue-300 mb-2">Progresso do Followup</p>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map(step => (
                    <div
                      key={step}
                      className={`flex-1 h-1.5 rounded-full transition-all ${step <= lead.followupStep ? 'bg-blue-400' : 'bg-white/10'}`}
                    />
                  ))}
                </div>
                <p className="text-xs text-blue-400/70 mt-1.5">
                  {lead.followupStep === 0 ? 'Nenhuma mensagem enviada' : `${lead.followupStep} de 5 mensagens enviadas`}
                </p>
              </div>
            )}

            {/* Contato vinculado */}
            {contact && (
              <div className="bg-violet-500/5 border border-violet-500/20 rounded-xl p-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0 text-sm font-bold text-violet-300">
                  {contact.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-500">Contato no CRM</p>
                  <p className="text-sm font-medium text-slate-200 truncate">{contact.name}</p>
                  {contact.phone !== lead.phone && (
                    <p className="text-xs text-slate-500">{formatPhone(contact.phone)}</p>
                  )}
                </div>
                <UserCheck size={15} className="text-violet-400 flex-shrink-0" />
              </div>
            )}

            {/* Descarte */}
            {isDiscarded && lead.discardReason && (
              <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3">
                <p className="text-xs font-medium text-red-300 mb-1">Motivo do descarte</p>
                <p className="text-sm text-slate-300">
                  {DISCARD_REASONS.find(r => r.value === lead.discardReason)?.label}
                </p>
                {lead.discardedAt && (
                  <p className="text-xs text-slate-500 mt-1">
                    {new Date(lead.discardedAt).toLocaleDateString('pt-BR')}
                  </p>
                )}
              </div>
            )}

            {/* Notas */}
            {lead.notes && (
              <div className="bg-white/3 border border-white/8 rounded-xl p-3">
                <p className="text-xs font-medium text-slate-500 mb-1.5 flex items-center gap-1">
                  <Clock size={11} /> Observações
                </p>
                <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{lead.notes}</p>
              </div>
            )}

            </>)}
          </div>

          {/* Actions */}
          <div className="px-5 pb-5 space-y-2">
            {!isDiscarded && (
              <div className="flex gap-2">
                <button
                  onClick={handleWhatsApp}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white text-sm font-medium rounded-xl transition-all shadow-lg shadow-green-500/20 active:scale-[0.98]"
                  title="Abre o WhatsApp e registra interação"
                >
                  <MessageCircle size={15} />
                  Registrar & Abrir
                  {lead.funnelStage === 'followup' && lead.followupStep > 0 && (
                    <span className="text-xs opacity-80">· {lead.followupStep}ª</span>
                  )}
                </button>
                <button
                  onClick={handleWhatsAppOpen}
                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-green-300 hover:text-white bg-green-500/10 hover:bg-green-500/25 border border-green-500/25 hover:border-green-500/50 rounded-xl transition-all active:scale-[0.98]"
                  title="Só abre o WhatsApp (sem registrar)"
                >
                  <MessageCircle size={15} />
                </button>
              </div>
            )}

            {/* Linha 1: Editar + Tarefa + Prioridade */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowEdit(true)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm text-slate-400 hover:text-slate-200 bg-white/3 hover:bg-white/6 border border-white/8 rounded-xl transition-all"
              >
                <Edit2 size={13} /> Editar
              </button>
              <button
                onClick={() => setShowTaskForm(true)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm text-indigo-300 hover:text-indigo-200 bg-indigo-500/10 hover:bg-indigo-500/15 border border-indigo-500/20 rounded-xl transition-all"
              >
                <ClipboardList size={13} /> Tarefa
              </button>
              <button
                onClick={() => { toggleFlag(lead.id); toast.success(lead.flagged ? 'Prioridade removida' : '🔥 Prioridade máxima!') }}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 text-sm font-medium rounded-xl border transition-all ${
                  lead.flagged
                    ? 'bg-orange-500/20 border-orange-500/40 text-orange-300 hover:bg-orange-500/30'
                    : 'bg-white/3 border-white/8 text-slate-500 hover:text-orange-400 hover:border-orange-500/30 hover:bg-orange-500/10'
                }`}
                title={lead.flagged ? 'Remover prioridade máxima' : 'Marcar prioridade máxima'}
              >
                <Flame size={14} />
              </button>
            </div>

            {/* Linha 2: Criar contato (se aplicável) + Descartar / Restaurar */}
            <div className="flex items-center gap-2">
              {!isLinked && !isDiscarded && (
                <button
                  onClick={handleConvert}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm text-violet-300 hover:text-violet-200 bg-violet-500/10 hover:bg-violet-500/15 border border-violet-500/20 rounded-xl transition-all"
                >
                  <UserCheck size={13} /> Criar contato
                </button>
              )}
              {isDiscarded ? (
                <button
                  onClick={handleRestore}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm text-blue-300 hover:text-blue-200 bg-blue-500/10 hover:bg-blue-500/15 border border-blue-500/20 rounded-xl transition-all"
                >
                  <RotateCcw size={13} /> Restaurar
                </button>
              ) : (
                <button
                  onClick={() => setShowDiscard(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/15 border border-red-500/20 rounded-xl transition-all"
                >
                  <Trash2 size={13} /> Descartar
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Discard Modal */}
      {showDiscard && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => { setShowDiscard(false); setShowDeleteConfirm(false) }} />
          <div className="relative w-full max-w-sm modal-surface rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
            <div className="px-5 py-4 border-b border-white/8 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center">
                <AlertTriangle size={15} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Descartar Lead</h3>
                <p className="text-xs text-slate-500">Selecione o motivo ou exclua definitivamente</p>
              </div>
            </div>

            <div className="px-5 py-4 space-y-2">
              {DISCARD_REASONS.map(r => (
                <button
                  key={r.value}
                  onClick={() => setSelectedReason(r.value)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-sm text-left transition-all ${
                    selectedReason === r.value
                      ? 'bg-red-500/15 border-red-500/30 text-red-200'
                      : 'bg-white/3 border-white/8 text-slate-400 hover:bg-white/6 hover:text-slate-300'
                  }`}
                >
                  <span>{r.icon}</span>
                  {r.label}
                  {selectedReason === r.value && <ArrowRight size={13} className="ml-auto text-red-400" />}
                </button>
              ))}

              {/* Separador — excluir permanentemente */}
              <div className="pt-2 border-t border-white/6">
                {!showDeleteConfirm ? (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-red-900/40 bg-red-950/20 text-red-500 hover:bg-red-900/30 hover:text-red-400 text-sm text-left transition-all"
                  >
                    <Trash2 size={13} />
                    Excluir lead definitivamente
                  </button>
                ) : (
                  <div className="bg-red-950/30 border border-red-500/30 rounded-xl p-3 space-y-2">
                    <p className="text-xs text-red-300 font-medium">⚠️ Isso é permanente e não pode ser desfeito.</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="flex-1 py-1.5 text-xs text-slate-400 hover:text-slate-200 bg-white/5 rounded-lg border border-white/10 transition-all"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleDelete}
                        className="flex-1 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-all"
                      >
                        Sim, excluir
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 px-5 pb-4">
              <button
                onClick={() => { setShowDiscard(false); setShowDeleteConfirm(false) }}
                className="flex-1 py-2 text-sm text-slate-400 hover:text-slate-200 bg-white/3 hover:bg-white/6 rounded-xl border border-white/8 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleDiscard}
                disabled={!selectedReason}
                className="flex-1 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-all"
              >
                Descartar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Form */}
      <LeadForm isOpen={showEdit} onClose={() => setShowEdit(false)} lead={lead} />

      {/* Task Form — pre-linked to contact */}
      <TaskForm
        isOpen={showTaskForm}
        onClose={() => setShowTaskForm(false)}
        defaultContactId={lead.contactId}
      />
    </>
  )
}
