import { useState } from 'react'
import { Calendar, Clock, Home, CheckCircle2 } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Lead } from '../../types'
import { useTasksStore } from '../../store/useTasksStore'
import { formatPhone } from '../../lib/formatters'
import toast from 'react-hot-toast'

interface Props {
  isOpen:  boolean
  onClose: () => void
  lead:    Lead
}

export function VisitaTaskModal({ isOpen, onClose, lead }: Props) {
  const { add } = useTasksStore()

  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().split('T')[0]

  const [date,  setDate]  = useState(tomorrow)
  const [time,  setTime]  = useState('10:00')
  const [notes, setNotes] = useState('')

  function handleCreate() {
    add({
      title:      `Visita: ${lead.name}`,
      description: [
        lead.phone ? `Tel: ${formatPhone(lead.phone)}` : '',
        notes.trim(),
      ].filter(Boolean).join('\n') || undefined,
      dueDate:   date,
      dueTime:   time || undefined,
      status:    'pending',
      priority:  'high',
      category:  'visita',
      propertyId: lead.propertyId,
      contactId:  lead.contactId,
    })
    toast.success('Tarefa de visita criada!')
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Agendar Visita" size="sm">
      <div className="flex flex-col gap-5">

        {/* Lead info */}
        <div className="flex items-center gap-3 p-3 bg-info-bg border border-info-line rounded-xl">
          <div className="w-9 h-9 rounded-xl bg-info-bg flex items-center justify-center flex-shrink-0">
            <Home size={16} className="text-info" />
          </div>
          <div>
            <p className="text-sm font-semibold text-t1">{lead.name}</p>
            <p className="text-xs text-t3">{formatPhone(lead.phone)} · Visita agendada</p>
          </div>
        </div>

        {/* Data */}
        <div>
          <label htmlFor="visitataskmodal-61" className="font-label text-[11px] font-bold uppercase tracking-[0.14em] text-t4 block mb-2">
            <Calendar size={11} className="inline mr-1.5" />
            Data da visita
          </label>
          <input id="visitataskmodal-61"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full bg-s3/50 border border-line rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-info-line"
          />
        </div>

        {/* Horário */}
        <div>
          <label htmlFor="visitataskmodal-75" className="font-label text-[11px] font-bold uppercase tracking-[0.14em] text-t4 block mb-2">
            <Clock size={11} className="inline mr-1.5" />
            Horário
          </label>
          <input id="visitataskmodal-75"
            type="time"
            value={time}
            onChange={e => setTime(e.target.value)}
            className="w-full bg-s3/50 border border-line rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-info-line"
          />
        </div>

        {/* Observações */}
        <div>
          <label htmlFor="visitataskmodal-89" className="font-label text-[11px] font-bold uppercase tracking-[0.14em] text-t4 block mb-2">
            Observações (opcional)
          </label>
          <textarea id="visitataskmodal-89"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="Endereço, imóvel a visitar, ponto de encontro..."
            className="w-full bg-s3/50 border border-line rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-info-line resize-none"
          />
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Pular por agora
          </Button>
          <Button
            className="flex-1 flex items-center justify-center gap-2 bg-info hover:bg-info"
            onClick={handleCreate}
          >
            <CheckCircle2 size={14} />
            Criar Tarefa de Visita
          </Button>
        </div>

      </div>
    </Modal>
  )
}
