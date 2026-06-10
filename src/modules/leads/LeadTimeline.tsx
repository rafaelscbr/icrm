import { useState, useEffect } from 'react'
import { Plus, Trash2, Loader2, Clock, MessageCircle, Phone, Mail, Home, Users, FileText, ArrowRight, XCircle, CheckCircle2 } from 'lucide-react'
import { LeadInteractionType, LeadInteractionOutcome } from '../../types'
import { useLeadInteractionsStore } from '../../store/useLeadInteractionsStore'
import { useLeadsStore } from '../../store/useLeadsStore'
import { NextStepSuggestion } from './NextStepSuggestion'
import toast from 'react-hot-toast'

// ── Config ────────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<LeadInteractionType, {
  label: string
  Icon: React.ElementType
  color: string
  bg: string
  border: string
}> = {
  ligacao:      { label: 'Ligação',     Icon: Phone,         color: 'text-blue-400',   bg: 'bg-s3/60',   border: 'border-blue-500/25'   },
  whatsapp:     { label: 'WhatsApp',    Icon: MessageCircle, color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/25'  },
  email:        { label: 'Email',       Icon: Mail,          color: 'text-sky-400',    bg: 'bg-sky-500/10',    border: 'border-sky-500/25'    },
  visita:       { label: 'Visita',      Icon: Home,          color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/25'  },
  reuniao:      { label: 'Reunião',     Icon: Users,         color: 'text-brand', bg: 'bg-indigo-500/10', border: 'border-indigo-500/25' },
  nota:         { label: 'Nota',        Icon: FileText,      color: 'text-t2',         bg: 'bg-slate-500/10',  border: 'border-slate-500/25'  },
  stage_change: { label: 'Etapa',       Icon: ArrowRight,    color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/25' },
  discard:      { label: 'Descartado',  Icon: XCircle,       color: 'text-rose-400',   bg: 'bg-rose-500/10',   border: 'border-rose-500/25'   },
  tarefa:       { label: 'Tarefa',      Icon: CheckCircle2,  color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25' },
}

const OUTCOME_CONFIG: Record<LeadInteractionOutcome, { label: string; color: string; bg: string; border: string }> = {
  interessado:      { label: 'Interessado',      color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25' },
  nao_interessado:  { label: 'Não interessado',  color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/25'     },
  agendado:         { label: 'Agendado',         color: 'text-blue-400',    bg: 'bg-s3/60',    border: 'border-blue-500/25'    },
  sem_resposta:     { label: 'Sem resposta',     color: 'text-t3',   bg: 'bg-slate-500/10',   border: 'border-slate-500/25'   },
  proposta_enviada: { label: 'Proposta enviada', color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/25'   },
  fechado:          { label: 'Fechado',          color: 'text-emerald-300', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30' },
  reagendado:       { label: 'Reagendado',       color: 'text-violet-400',  bg: 'bg-violet-500/10',  border: 'border-violet-500/25'  },
}

const TYPES: LeadInteractionType[] = ['ligacao', 'whatsapp', 'email', 'visita', 'reuniao', 'nota']
const OUTCOMES: LeadInteractionOutcome[] = [
  'interessado', 'nao_interessado', 'agendado',
  'sem_resposta', 'proposta_enviada', 'fechado', 'reagendado',
]

function localDatetimeValue(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatInteractionDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const itemDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const isThisYear = d.getFullYear() === now.getFullYear()
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (itemDay.getTime() === today.getTime()) return `Hoje, ${time}`
  if (itemDay.getTime() === yesterday.getTime()) return `Ontem, ${time}`
  if (isThisYear) return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) + `, ${time}`
  return d.toLocaleDateString('pt-BR') + `, ${time}`
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  leadId: string
}

export function LeadTimeline({ leadId }: Props) {
  const { loadForLead, add, remove, getForLead, loaded } = useLeadInteractionsStore()
  const lead = useLeadsStore(s => s.leads.find(l => l.id === leadId))

  const [type,        setType]        = useState<LeadInteractionType>('whatsapp')
  const [outcome,     setOutcome]     = useState<LeadInteractionOutcome | ''>('')
  const [description, setDescription] = useState('')
  const [datetime,    setDatetime]    = useState(localDatetimeValue())
  const [saving,      setSaving]      = useState(false)
  const [showForm,    setShowForm]    = useState(false)
  // Ciclo interação → tarefa: sugestão de próximo passo após salvar
  const [suggestFor,  setSuggestFor]  = useState<{ type: LeadInteractionType; outcome?: LeadInteractionOutcome } | null>(null)

  useEffect(() => { loadForLead(leadId) }, [leadId])

  const interactions = getForLead(leadId)
  const isLoaded     = loaded.has(leadId)
  const selectedType = TYPE_CONFIG[type]

  async function handleSave() {
    setSaving(true)
    try {
      await add({
        leadId,
        type,
        description: description.trim() || undefined,
        outcome: outcome || undefined,
        interactedAt: new Date(datetime).toISOString(),
      })
      toast.success('Interação registrada')
      setSuggestFor({ type, outcome: outcome || undefined })
      setDescription('')
      setOutcome('')
      setDatetime(localDatetimeValue())
      setShowForm(false)
    } catch {
      // erro já toastado pela camada db — não exibe sucesso
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(id: string) {
    try {
      await remove(id, leadId)
      toast.success('Interação removida')
    } catch {
      // erro já toastado pela camada db
    }
  }

  return (
    <div className="space-y-5">

      {/* Sugestão de próximo passo após registrar interação */}
      {suggestFor && lead && (
        <NextStepSuggestion
          lead={lead}
          interactionType={suggestFor.type}
          outcome={suggestFor.outcome}
          onDone={() => setSuggestFor(null)}
        />
      )}

      {/* ── Trigger button ───────────────────────────────────────────────── */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-2.5 py-3 text-sm font-medium text-blue-400 hover:text-blue-300 hover:bg-s3/60 border border-blue-500/20 hover:border-blue-500/35 border-dashed rounded-xl transition-all duration-200"
        >
          <Plus size={15} />
          Registrar nova interação
        </button>
      ) : (

        /* ── Form ────────────────────────────────────────────────────────── */
        <div className="rounded-xl border border-line overflow-hidden">

          {/* Form header */}
          <div className="px-4 py-3 bg-s2/50 border-b border-line flex items-center justify-between">
            <span className="text-xs font-semibold text-t2 uppercase tracking-wider">Nova Interação</span>
            <button
              onClick={() => setShowForm(false)}
              className="text-xs text-t3 hover:text-t2 transition-colors"
            >
              Cancelar
            </button>
          </div>

          <div className="p-4 space-y-5">

            {/* Tipo */}
            <div>
              <p className="text-[11px] font-semibold text-t3 uppercase tracking-widest mb-2.5">Tipo de contato</p>
              <div className="grid grid-cols-3 gap-2">
                {TYPES.map(t => {
                  const c = TYPE_CONFIG[t]
                  const isSelected = type === t
                  return (
                    <button
                      key={t}
                      onClick={() => setType(t)}
                      className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border text-xs font-medium transition-all ${
                        isSelected
                          ? `${c.bg} ${c.border} ${c.color}`
                          : 'bg-s2/50 border-line text-t3 hover:text-t2 hover:border-line-input hover:bg-s2'
                      }`}
                    >
                      <c.Icon size={15} />
                      {c.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Data e hora */}
            <div>
              <p className="text-[11px] font-semibold text-t3 uppercase tracking-widest mb-2">Data e hora</p>
              <div className="relative">
                <Clock size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-t3 pointer-events-none" />
                <input
                  type="datetime-local"
                  value={datetime}
                  onChange={e => setDatetime(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 bg-s3/50 border border-line rounded-xl text-sm text-t1 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/40 transition-all [color-scheme:dark]"
                />
              </div>
            </div>

            {/* Resultado */}
            <div>
              <div className="flex items-baseline gap-2 mb-2.5">
                <p className="text-[11px] font-semibold text-t3 uppercase tracking-widest">Resultado</p>
                <span className="text-[11px] text-t4">(opcional)</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {OUTCOMES.map(o => {
                  const c = OUTCOME_CONFIG[o]
                  const isSelected = outcome === o
                  return (
                    <button
                      key={o}
                      onClick={() => setOutcome(isSelected ? '' : o)}
                      className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-all ${
                        isSelected
                          ? `${c.bg} ${c.border} ${c.color}`
                          : 'bg-s2/50 border-line text-t3 hover:text-t2 hover:border-line-input hover:bg-s3/50'
                      }`}
                    >
                      {c.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Observações */}
            <div>
              <div className="flex items-baseline gap-2 mb-2">
                <p className="text-[11px] font-semibold text-t3 uppercase tracking-widest">Observações</p>
                <span className="text-[11px] text-t4">(opcional)</span>
              </div>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                placeholder={`Detalhes sobre a ${selectedType.label.toLowerCase()}…`}
                className="w-full bg-s3/50 border border-line rounded-xl px-3.5 py-3 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/40 resize-none transition-all leading-relaxed"
              />
            </div>

            {/* Submit */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl transition-all shadow-lg shadow-blue-600/20 active:scale-[0.99]"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              Registrar interação
            </button>
          </div>
        </div>
      )}

      {/* ── Timeline list ─────────────────────────────────────────────────── */}
      {!isLoaded ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <Loader2 size={18} className="animate-spin text-t4" />
          <span className="text-xs text-t4">Carregando histórico…</span>
        </div>
      ) : interactions.length === 0 ? (
        <div className="text-center py-12 space-y-1">
          <div className="w-10 h-10 rounded-xl bg-s2/60 border border-line flex items-center justify-center mx-auto mb-3">
            <Clock size={18} className="text-t4" />
          </div>
          <p className="text-sm font-medium text-t3">Nenhuma interação registrada</p>
          <p className="text-xs text-t4">Registre ligações, visitas e conversas acima</p>
        </div>
      ) : (
        <div>
          <p className="text-[11px] font-semibold text-t4 uppercase tracking-widest mb-4 px-0.5">
            {interactions.length} {interactions.length === 1 ? 'interação' : 'interações'}
          </p>

          <div className="relative">
            {/* Linha da timeline */}
            <div className="absolute left-[17px] top-4 bottom-4 w-px bg-line" />

            <div className="space-y-3">
              {interactions.map(item => {
                const tc = TYPE_CONFIG[item.type]
                const oc = item.outcome ? OUTCOME_CONFIG[item.outcome] : null
                return (
                  <div key={item.id} className="flex gap-4 group">

                    {/* Ícone */}
                    <div className={`w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0 z-10 shadow-sm ${tc.bg} ${tc.border}`}>
                      <tc.Icon size={14} className={tc.color} />
                    </div>

                    {/* Card */}
                    <div className="flex-1 min-w-0 bg-s2/50 hover:bg-s3/50 border border-line hover:border-line-strong rounded-xl p-3.5 transition-all">

                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className={`text-xs font-semibold ${tc.color}`}>{tc.label}</span>
                          {oc && (
                            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${oc.bg} ${oc.border} ${oc.color}`}>
                              {oc.label}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="text-[11px] text-t4 whitespace-nowrap">
                            {formatInteractionDate(item.interactedAt)}
                          </span>
                          <button
                            onClick={() => handleRemove(item.id)}
                            className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center text-t4 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>

                      {item.description && (
                        <p className="text-sm text-t2 leading-relaxed">{item.description}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
