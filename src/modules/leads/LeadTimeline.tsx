import { useState, useEffect } from 'react'
import { Plus, Trash2, Loader2 } from 'lucide-react'
import { LeadInteractionType, LeadInteractionOutcome } from '../../types'
import { useLeadInteractionsStore } from '../../store/useLeadInteractionsStore'
import toast from 'react-hot-toast'

// ── Config ────────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<LeadInteractionType, {
  label: string; emoji: string; color: string; bg: string; border: string
}> = {
  ligacao:  { label: 'Ligação',  emoji: '📞', color: 'text-blue-400',   bg: 'bg-blue-500/12',   border: 'border-blue-500/25'   },
  whatsapp: { label: 'WhatsApp', emoji: '💬', color: 'text-green-400',  bg: 'bg-green-500/12',  border: 'border-green-500/25'  },
  email:    { label: 'Email',    emoji: '📧', color: 'text-cyan-400',   bg: 'bg-cyan-500/12',   border: 'border-cyan-500/25'   },
  visita:   { label: 'Visita',   emoji: '🏠', color: 'text-amber-400',  bg: 'bg-amber-500/12',  border: 'border-amber-500/25'  },
  reuniao:  { label: 'Reunião',  emoji: '🤝', color: 'text-violet-400', bg: 'bg-violet-500/12', border: 'border-violet-500/25' },
  nota:     { label: 'Nota',     emoji: '📝', color: 'text-slate-400',  bg: 'bg-slate-500/12',  border: 'border-slate-500/25'  },
}

const OUTCOME_CONFIG: Record<LeadInteractionOutcome, { label: string; emoji: string; color: string }> = {
  interessado:      { label: 'Interessado',      emoji: '✅', color: 'text-green-400'  },
  nao_interessado:  { label: 'Não interessado',  emoji: '❌', color: 'text-red-400'    },
  agendado:         { label: 'Agendado',         emoji: '📅', color: 'text-blue-400'   },
  sem_resposta:     { label: 'Sem resposta',     emoji: '📵', color: 'text-slate-400'  },
  proposta_enviada: { label: 'Proposta enviada', emoji: '📋', color: 'text-amber-400'  },
  fechado:          { label: 'Fechado',          emoji: '🎉', color: 'text-emerald-400'},
  reagendado:       { label: 'Reagendado',       emoji: '🔄', color: 'text-violet-400' },
}

const TYPES: LeadInteractionType[]    = ['ligacao', 'whatsapp', 'email', 'visita', 'reuniao', 'nota']
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
  const isToday  = d.toDateString() === now.toDateString()
  const isThisYear = d.getFullYear() === now.getFullYear()
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (isToday) return `Hoje às ${time}`
  if (isThisYear) return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} às ${time}`
  return `${d.toLocaleDateString('pt-BR')} às ${time}`
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  leadId: string
}

export function LeadTimeline({ leadId }: Props) {
  const { loadForLead, add, remove, getForLead, loaded } = useLeadInteractionsStore()

  const [type,        setType]        = useState<LeadInteractionType>('ligacao')
  const [outcome,     setOutcome]     = useState<LeadInteractionOutcome | ''>('')
  const [description, setDescription]= useState('')
  const [datetime,    setDatetime]    = useState(localDatetimeValue())
  const [saving,      setSaving]      = useState(false)
  const [showForm,    setShowForm]    = useState(false)

  useEffect(() => { loadForLead(leadId) }, [leadId])

  const interactions = getForLead(leadId)
  const isLoaded     = loaded.has(leadId)

  async function handleSave() {
    setSaving(true)
    try {
      add({
        leadId,
        type,
        description: description.trim() || undefined,
        outcome:     outcome || undefined,
        interactedAt: new Date(datetime).toISOString(),
      })
      toast.success('Interação registrada')
      setDescription('')
      setOutcome('')
      setDatetime(localDatetimeValue())
      setShowForm(false)
    } finally {
      setSaving(false)
    }
  }

  function handleRemove(id: string) {
    remove(id, leadId)
    toast.success('Interação removida')
  }

  return (
    <div className="space-y-4">

      {/* ── Botão abrir form ──────────────────────────────────────────────── */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-semibold text-violet-300 hover:text-white bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/25 hover:border-violet-500/40 border-dashed rounded-xl transition-all"
        >
          <Plus size={13} />
          Registrar nova interação
        </button>
      ) : (

        /* ── Formulário ──────────────────────────────────────────────────── */
        <div className="bg-white/3 border border-white/10 rounded-xl p-4 space-y-3">

          {/* Tipo */}
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Tipo de interação</p>
            <div className="grid grid-cols-3 gap-1.5">
              {TYPES.map(t => {
                const c = TYPE_CONFIG[t]
                return (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-xs font-medium transition-all ${
                      type === t
                        ? `${c.bg} ${c.border} ${c.color}`
                        : 'bg-white/3 border-white/8 text-slate-600 hover:text-slate-300 hover:border-white/15'
                    }`}
                  >
                    <span>{c.emoji}</span> {c.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Data/hora */}
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Data e hora</p>
            <input
              type="datetime-local"
              value={datetime}
              onChange={e => setDatetime(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/40 [color-scheme:dark]"
            />
          </div>

          {/* Resultado */}
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Resultado (opcional)</p>
            <div className="flex flex-wrap gap-1.5">
              {OUTCOMES.map(o => {
                const c = OUTCOME_CONFIG[o]
                return (
                  <button
                    key={o}
                    onClick={() => setOutcome(outcome === o ? '' : o)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-all ${
                      outcome === o
                        ? `bg-white/10 border-white/20 ${c.color}`
                        : 'bg-white/3 border-white/8 text-slate-600 hover:text-slate-400'
                    }`}
                  >
                    <span>{c.emoji}</span> {c.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Descrição */}
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Observações (opcional)</p>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="O que aconteceu nessa interação?"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40 resize-none"
            />
          </div>

          {/* Ações */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 py-2 text-xs text-slate-500 hover:text-slate-300 bg-white/3 border border-white/8 rounded-lg transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg transition-all"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              Registrar
            </button>
          </div>
        </div>
      )}

      {/* ── Timeline ─────────────────────────────────────────────────────── */}
      {!isLoaded ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={16} className="animate-spin text-slate-600" />
        </div>
      ) : interactions.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-xs text-slate-600">Nenhuma interação registrada</p>
          <p className="text-[10px] text-slate-700 mt-1">Registre ligações, visitas e conversas acima</p>
        </div>
      ) : (
        <div className="relative">
          {/* linha vertical da timeline */}
          <div className="absolute left-3.5 top-2 bottom-2 w-px bg-white/8" />

          <div className="space-y-3">
            {interactions.map(item => {
              const tc = TYPE_CONFIG[item.type]
              const oc = item.outcome ? OUTCOME_CONFIG[item.outcome] : null
              return (
                <div key={item.id} className="flex gap-3 group">
                  {/* dot */}
                  <div className={`w-7 h-7 rounded-full border flex items-center justify-center flex-shrink-0 z-10 ${tc.bg} ${tc.border}`}>
                    <span className="text-[11px]">{tc.emoji}</span>
                  </div>

                  {/* card */}
                  <div className="flex-1 min-w-0 bg-white/3 hover:bg-white/4 border border-white/6 rounded-xl p-3 transition-colors">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[11px] font-semibold ${tc.color}`}>{tc.label}</span>
                        {oc && (
                          <span className={`text-[10px] font-medium ${oc.color}`}>
                            {oc.emoji} {oc.label}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-[10px] text-slate-600">
                          {formatInteractionDate(item.interactedAt)}
                        </span>
                        <button
                          onClick={() => handleRemove(item.id)}
                          className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-slate-700 hover:text-red-400 transition-all"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>

                    {item.description && (
                      <p className="text-xs text-slate-400 leading-relaxed">{item.description}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
