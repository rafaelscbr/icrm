import { useState, FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Button } from '../../components/ui/Button'
import { Sale, SaleType } from '../../types'
import { useSalesStore } from '../../store/useSalesStore'
import { useContactsStore } from '../../store/useContactsStore'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { ContactForm } from '../contacts/ContactForm'
import { formatCurrencyFull } from '../../lib/formatters'
import toast from 'react-hot-toast'

interface SaleFormProps {
  isOpen: boolean
  onClose: () => void
  sale?: Sale
}

export function SaleForm({ isOpen, onClose, sale }: SaleFormProps) {
  const { add, update } = useSalesStore()
  const { contacts } = useContactsStore()
  const { properties } = usePropertiesStore()

  const isEditing = Boolean(sale)
  const today = new Date().toISOString().split('T')[0]

  const [clientId, setClientId] = useState(sale?.clientId ?? '')
  const [clientSearch, setClientSearch] = useState(sale ? (contacts.find(c => c.id === sale.clientId)?.name ?? '') : '')
  const [showClientDrop, setShowClientDrop] = useState(false)

  const [propertyId, setPropertyId] = useState(sale?.propertyId ?? '')
  const [propertyName, setPropertyName] = useState(sale?.propertyName ?? '')
  const [showPropDrop, setShowPropDrop] = useState(false)

  const [date, setDate] = useState(sale?.date ?? today)
  const [value, setValue] = useState(sale?.value ? String(sale.value) : '')
  const [type, setType] = useState<SaleType>(sale?.type ?? 'ready')
  const [notes, setNotes] = useState(sale?.notes ?? '')

  const [newContactOpen, setNewContactOpen] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const filteredClients = clientSearch.trim()
    ? contacts.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
    : contacts.slice(0, 5)

  const filteredProps = propertyName.trim()
    ? properties.filter(p => p.name.toLowerCase().includes(propertyName.toLowerCase()))
    : properties.slice(0, 5)

  function parseValue(v: string) {
    return Number(v.replace(/\D/g, ''))
  }

  function validate() {
    const errs: Record<string, string> = {}
    if (!clientId) errs.client = 'Selecione um cliente'
    if (!propertyName.trim()) errs.property = 'Informe o empreendimento'
    if (!date) errs.date = 'Data é obrigatória'
    if (!value || parseValue(value) === 0) errs.value = 'Valor inválido'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!validate()) return

    const data = {
      clientId,
      propertyId: propertyId || undefined,
      propertyName: propertyName.trim(),
      date,
      value: parseValue(value),
      type,
      notes: notes.trim() || undefined,
    }

    if (isEditing && sale) {
      update(sale.id, data)
      toast.success('Venda atualizada')
    } else {
      add(data)
      toast.success(`Venda registrada — ${formatCurrencyFull(parseValue(value))}`)
    }
    onClose()
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? 'Editar Venda' : 'Nova Venda'}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {/* Client */}
          <div className="flex flex-col gap-1.5 relative">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Cliente <span className="text-red-400">*</span>
            </p>
            <input
              value={clientSearch}
              autoFocus
              onChange={e => { setClientSearch(e.target.value); setClientId(''); setShowClientDrop(true) }}
              onFocus={() => setShowClientDrop(true)}
              onBlur={() => setTimeout(() => setShowClientDrop(false), 150)}
              placeholder="Buscar contato..."
              className={`w-full bg-white/5 border rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${errors.client ? 'border-red-500/50' : 'border-white/10'}`}
            />
            {errors.client && <p className="text-xs text-red-400">{errors.client}</p>}
            {showClientDrop && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#1A1D27] border border-white/10 rounded-xl shadow-xl z-10 overflow-hidden">
                {filteredClients.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={() => { setClientId(c.id); setClientSearch(c.name); setShowClientDrop(false) }}
                    className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    {c.name}
                  </button>
                ))}
                <button
                  type="button"
                  onMouseDown={() => { setShowClientDrop(false); setNewContactOpen(true) }}
                  className="w-full text-left px-4 py-2.5 text-xs text-indigo-400 hover:bg-indigo-500/10 border-t border-white/5 flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Plus size={12} /> Criar novo contato
                </button>
              </div>
            )}
          </div>

          {/* Property */}
          <div className="flex flex-col gap-1.5 relative">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Empreendimento / Imóvel <span className="text-red-400">*</span>
            </p>
            <input
              value={propertyName}
              onChange={e => { setPropertyName(e.target.value); setPropertyId(''); setShowPropDrop(true) }}
              onFocus={() => setShowPropDrop(true)}
              onBlur={() => setTimeout(() => setShowPropDrop(false), 150)}
              placeholder="Buscar imóvel ou digitar nome..."
              className={`w-full bg-white/5 border rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${errors.property ? 'border-red-500/50' : 'border-white/10'}`}
            />
            {errors.property && <p className="text-xs text-red-400">{errors.property}</p>}
            {showPropDrop && filteredProps.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#1A1D27] border border-white/10 rounded-xl shadow-xl z-10 overflow-hidden">
                {filteredProps.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onMouseDown={() => { setPropertyId(p.id); setPropertyName(p.name); setShowPropDrop(false) }}
                    className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    {p.name}
                    <span className="text-slate-600 ml-2 text-xs">{p.neighborhood}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Date + Type */}
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Data"
              required
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              error={errors.date}
            />
            <Select
              label="Tipo"
              required
              value={type}
              onChange={e => setType(e.target.value as SaleType)}
            >
              <option value="ready">Pronto</option>
              <option value="off_plan">Planta</option>
            </Select>
          </div>

          {/* Value */}
          <Input
            label="Valor"
            required
            value={value}
            onChange={e => setValue(e.target.value)}
            error={errors.value}
            placeholder="450000"
          />

          {/* Notes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Observações</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Informações adicionais..."
              rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button type="submit" className="flex-1">{isEditing ? 'Salvar alterações' : 'Registrar venda'}</Button>
          </div>
        </form>
      </Modal>

      <ContactForm
        isOpen={newContactOpen}
        onClose={() => setNewContactOpen(false)}
        defaultTags={['buyer']}
        onCreated={(c) => { setClientId(c.id); setClientSearch(c.name) }}
      />
    </>
  )
}
