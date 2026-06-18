import { useState } from 'react'
import { Trophy, DollarSign } from 'lucide-react'
import toast from 'react-hot-toast'
import { Lead } from '../../types'
import { useLeadsStore } from '../../store/useLeadsStore'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { localDateStr } from '../../lib/formatters'

interface ConcludeSaleModalProps {
  lead: Lead
  onClose: () => void
}

/**
 * Encerra um lead ganho: captura valor + data e cria a venda no módulo Vendas
 * (via store.concludeSale). O lead sai do funil ativo e vira faturamento real.
 */
export function ConcludeSaleModal({ lead, onClose }: ConcludeSaleModalProps) {
  const { concludeSale } = useLeadsStore()
  const [valueRaw, setValueRaw] = useState(lead.averageTicket ? String(Math.round(lead.averageTicket)) : '')
  const [date, setDate]         = useState(localDateStr())
  const [saving, setSaving]     = useState(false)

  const value   = Number(valueRaw.replace(/\D/g, ''))
  const display = value > 0 ? value.toLocaleString('pt-BR') : ''
  const valid   = value > 0 && !!date

  async function handleConfirm() {
    if (!valid) { toast.error('Informe o valor da venda'); return }
    setSaving(true)
    try {
      await concludeSale(lead.id, { value, date })
      toast.success(`Venda concluída — R$ ${value.toLocaleString('pt-BR')}`)
      onClose()
    } catch {
      /* erro já toastado pela camada db — modal permanece aberto */
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Concluir venda"
      subtitle={`${lead.name} sai do funil e vira faturamento no módulo Vendas`}
      size="sm"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} className="flex-1" disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} className="flex-1" disabled={!valid || saving}>
            <Trophy size={14} /> {saving ? 'Concluindo…' : 'Concluir venda'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="conclude-value" className="text-xs font-medium text-t2">Valor da venda (R$) *</label>
          <div className="relative">
            <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-t3" />
            <input
              id="conclude-value"
              autoFocus
              inputMode="numeric"
              value={display}
              onChange={e => setValueRaw(e.target.value)}
              placeholder="Ex: 650.000"
              className="w-full bg-surface border border-line-input rounded-lg pl-9 pr-3 py-2.5 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand transition-all"
            />
          </div>
          {lead.averageTicket && (
            <p className="text-[11px] text-t4">Sugerido pelo ticket do produto — ajuste para o valor real fechado.</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="conclude-date" className="text-xs font-medium text-t2">Data da venda *</label>
          <input
            id="conclude-date"
            type="date"
            value={date}
            max={localDateStr()}
            onChange={e => setDate(e.target.value)}
            className="w-full bg-surface border border-line-input rounded-lg px-3 py-2.5 text-sm text-t1 focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-brand transition-all"
            style={{ colorScheme: 'dark' }}
          />
          <p className="text-[11px] text-t4">Define o mês em que a venda entra no VGL.</p>
        </div>
      </div>
    </Modal>
  )
}
