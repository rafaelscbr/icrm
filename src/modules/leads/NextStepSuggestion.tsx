import { useState } from 'react'
import { CalendarPlus, X } from 'lucide-react'
import { Lead, LeadInteractionType, LeadInteractionOutcome } from '../../types'
import { useTasksStore } from '../../store/useTasksStore'
import { getCurrentUserId } from '../../lib/auth'
import { localDateStr } from '../../lib/formatters'
import toast from 'react-hot-toast'

/**
 * Ciclo interação → tarefa: após registrar uma interação, sugere agendar o
 * próximo passo com um toque. Regra de produto: nenhum lead ativo fica sem
 * próxima ação agendada.
 */

// Sugestão de título + prazo padrão (em dias) conforme o resultado da interação
function suggestionFor(
  leadName: string,
  type: LeadInteractionType,
  outcome?: LeadInteractionOutcome,
): { title: string; defaultDays: number } | null {
  switch (outcome) {
    case 'nao_interessado':
    case 'fechado':
      return null // ciclo encerrado — não sugerir follow-up
    case 'sem_resposta':
      return { title: `Tentar contato novamente — ${leadName}`, defaultDays: 1 }
    case 'agendado':
      return { title: `Confirmar agendamento com ${leadName}`, defaultDays: 1 }
    case 'reagendado':
      return { title: `Confirmar novo horário com ${leadName}`, defaultDays: 1 }
    case 'proposta_enviada':
      return { title: `Cobrar retorno da proposta — ${leadName}`, defaultDays: 2 }
    case 'interessado':
      return { title: `Follow-up com ${leadName}`, defaultDays: 2 }
    default:
      return {
        title: type === 'ligacao' ? `Retornar ligação — ${leadName}` : `Follow-up com ${leadName}`,
        defaultDays: 2,
      }
  }
}

function addDays(days: number): string {
  return localDateStr(new Date(Date.now() + days * 86_400_000))
}

interface Props {
  lead: Lead
  interactionType: LeadInteractionType
  outcome?: LeadInteractionOutcome
  onDone: () => void
}

export function NextStepSuggestion({ lead, interactionType, outcome, onDone }: Props) {
  const { add: addTask, tasks } = useTasksStore()
  const [customDate, setCustomDate] = useState('')
  const [showCustom, setShowCustom] = useState(false)

  const suggestion = suggestionFor(lead.name, interactionType, outcome)

  // Já existe próximo passo agendado — não incomodar
  const hasPendingTask = lead.contactId
    ? tasks.some(t => t.contactId === lead.contactId && t.status === 'pending')
    : false

  if (!suggestion || hasPendingTask) return null

  function createTask(dueDate: string, label: string) {
    try {
      addTask({
        title:     suggestion!.title,
        dueDate,
        status:    'pending',
        priority:  'medium',
        category:  'outro',
        contactId: lead.contactId,
        propertyId: lead.propertyId,
        brokerId:  lead.brokerId ?? getCurrentUserId() ?? undefined,
      })
      toast.success(`Próximo passo agendado para ${label}`)
      onDone()
    } catch { /* erro já toastado */ }
  }

  const chips: { label: string; date: string }[] = [
    { label: 'Amanhã',          date: addDays(1) },
    { label: 'Em 2 dias',       date: addDays(2) },
    { label: 'Próxima semana',  date: addDays(7) },
  ]

  return (
    <div className="bg-brand-tint border border-brand/40 rounded-[14px] p-3 animate-in" role="region" aria-label="Agendar próximo passo">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <CalendarPlus size={13} strokeWidth={1.6} className="text-brand flex-shrink-0" />
          <div className="min-w-0">
            <p className="font-heading text-xs font-bold text-t1">Agendar próximo passo?</p>
            <p className="text-[11px] text-t3 truncate">{suggestion.title}</p>
          </div>
        </div>
        <button
          onClick={onDone}
          className="w-5 h-5 flex items-center justify-center rounded text-t4 hover:text-t2 transition-colors flex-shrink-0"
          aria-label="Agora não"
          title="Agora não"
        >
          <X size={12} strokeWidth={1.6} />
        </button>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {chips.map(c => (
          <button
            key={c.label}
            onClick={() => createTask(c.date, c.label.toLowerCase())}
            className={`px-2.5 py-1.5 rounded-full font-label text-[10px] uppercase tracking-[0.06em] border transition-all duration-150
              ${c.date === addDays(suggestion.defaultDays)
                ? 'bg-brand text-[#0F1730] border-brand font-semibold hover:bg-brand-dark'
                : 'bg-s2/60 border-line text-t2 hover:border-brand/40 hover:text-t1'
              }`}
          >
            {c.label}
          </button>
        ))}
        {showCustom ? (
          <span className="flex items-center gap-1.5">
            <label htmlFor="next-step-date" className="sr-only">Data do próximo passo</label>
            <input
              id="next-step-date"
              type="date"
              autoFocus
              min={localDateStr()}
              value={customDate}
              onChange={e => setCustomDate(e.target.value)}
              className="bg-s2 border border-line rounded-full px-2.5 py-1 text-[11px] text-t1 focus:outline-none focus:border-brand"
            />
            <button
              onClick={() => customDate && createTask(customDate, new Date(customDate + 'T12:00:00').toLocaleDateString('pt-BR'))}
              disabled={!customDate}
              className="px-2.5 py-1.5 rounded-full font-label text-[10px] uppercase tracking-[0.06em] bg-brand text-[#0F1730] font-semibold disabled:opacity-40 transition-all duration-150"
            >
              OK
            </button>
          </span>
        ) : (
          <button
            onClick={() => setShowCustom(true)}
            className="px-2.5 py-1.5 rounded-full font-label text-[10px] uppercase tracking-[0.06em] border border-dashed border-line text-t3 hover:text-t1 hover:border-brand/40 transition-all duration-150"
          >
            Escolher data
          </button>
        )}
      </div>
    </div>
  )
}
