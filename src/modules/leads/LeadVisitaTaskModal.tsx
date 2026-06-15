import { useState } from 'react'
import { Calendar, Clock, CalendarCheck, MapPin } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Lead } from '../../types'
import { useTasksStore } from '../../store/useTasksStore'
import { useLeadsStore } from '../../store/useLeadsStore'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { formatPhone, formatCurrency } from '../../lib/formatters'
import { getCurrentUserId } from '../../lib/auth'
import toast from 'react-hot-toast'

interface Props {
  lead:    Lead
  onClose: () => void
}

/**
 * Sugerido ao mover um lead para a coluna "Visita" no funil principal.
 * Já chega praticamente preenchido — puxa produto e observações do lead
 * para a observação da tarefa, agilizando o agendamento.
 */
export function LeadVisitaTaskModal({ lead, onClose }: Props) {
  const addTask    = useTasksStore(s => s.add)
  const updateLead = useLeadsStore(s => s.update)
  const properties = usePropertiesStore(s => s.properties)

  const property    = lead.propertyId ? properties.find(p => p.id === lead.propertyId) : undefined
  const productName = property?.name ?? lead.propertyName ?? ''

  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().split('T')[0]

  const [date,  setDate]  = useState(tomorrow)
  const [time,  setTime]  = useState('10:00')
  const [notes, setNotes] = useState(() => {
    const lines: string[] = []
    if (productName)        lines.push(`Imóvel/Produto: ${productName}`)
    if (lead.averageTicket) lines.push(`Ticket médio: ${formatCurrency(lead.averageTicket)}`)
    const interesse = [lead.radarPropertyType, lead.radarRegion].filter(Boolean).join(' · ')
    if (interesse)          lines.push(`Interesse: ${interesse}`)
    if (lead.notes?.trim()) lines.push(`Obs. do lead: ${lead.notes.trim()}`)
    return lines.join('\n')
  })

  function handleCreate() {
    const task = addTask({
      title: `Visita — ${lead.name}`,
      description: [
        lead.phone ? `Tel: ${formatPhone(lead.phone)}` : '',
        notes.trim(),
      ].filter(Boolean).join('\n') || undefined,
      dueDate:    date,
      dueTime:    time || undefined,
      status:     'pending',
      priority:   'high',
      category:   'visita',
      contactId:  lead.contactId,
      propertyId: lead.propertyId,
      brokerId:   lead.brokerId ?? getCurrentUserId() ?? undefined,
    })
    // Vincula a tarefa ao lead (não sugere de novo nas próximas vezes)
    updateLead(lead.id, { visitaTaskId: task.id }).catch(() => { /* erro já tratado no store */ })
    toast.success('Tarefa de visita agendada!')
    onClose()
  }

  const inputCls = 'w-full bg-s3/50 border border-line rounded-xl px-3 py-2.5 text-sm text-t1 focus:outline-none focus:ring-2 focus:ring-amber-500/50'

  return (
    <Modal isOpen onClose={onClose} title="Agendar visita" size="sm">
      <div className="flex flex-col gap-5">

        {/* Lead info */}
        <div className="flex items-center gap-3 p-3 bg-amber-500/8 border border-amber-500/20 rounded-xl">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
            <MapPin size={16} className="text-amber-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-t1 truncate">{lead.name}</p>
            <p className="text-xs text-t3 truncate">
              {formatPhone(lead.phone)}{productName ? ` · ${productName}` : ''}
            </p>
          </div>
        </div>

        {/* Data + horário */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-t3 uppercase tracking-wider block mb-2">
              <Calendar size={11} className="inline mr-1.5" />
              Data
            </label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-semibold text-t3 uppercase tracking-wider block mb-2">
              <Clock size={11} className="inline mr-1.5" />
              Horário
            </label>
            <input type="time" value={time} onChange={e => setTime(e.target.value)} className={inputCls} />
          </div>
        </div>

        {/* Observações (pré-preenchidas) */}
        <div>
          <label className="text-xs font-semibold text-t3 uppercase tracking-wider block mb-2">
            Observações da visita
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={5}
            placeholder="Produto, ponto de encontro, observações do lead..."
            className={`${inputCls} resize-none leading-relaxed`}
          />
          <p className="text-[11px] text-t4 mt-1.5">Puxado do lead — edite se precisar.</p>
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Pular por agora
          </Button>
          <Button
            className="flex-1 flex items-center justify-center gap-2"
            onClick={handleCreate}
          >
            <CalendarCheck size={14} />
            Agendar visita
          </Button>
        </div>

      </div>
    </Modal>
  )
}
