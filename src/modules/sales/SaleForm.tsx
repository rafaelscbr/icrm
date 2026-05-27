import { useState, FormEvent, useMemo } from 'react'
import { Plus, BadgePercent, DollarSign } from 'lucide-react'
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

  const [clientId,      setClientId]      = useState(sale?.clientId ?? '')
  const [clientSearch,  setClientSearch]  = useState(sale ? (contacts.find(c => c.id === sale.clientId)?.name ?? '') : '')
  const [showClientDrop, setShowClientDrop] = useState(false)

  const [propertyId,   setPropertyId]   = useState(sale?.propertyId ?? '')
  const [propertyName, setPropertyName] = useState(sale?.propertyName ?? '')
  const [showPropDrop, setShowPropDrop] = useState(false)

  const [date,  setDate]  = useState(sale?.date ?? today)
  const [value, setValue] = useState(sale?.value ? String(sale.value) : '')
  const [type,  setType]  = useState<SaleType>(sale?.type ?? 'ready')
  const [notes, setNotes] = useState(sale?.notes ?? '')

  // Comissão
  const [commMode,     setCommMode]     = useState<'pct' | 'fixed'>(sale?.commissionFixed != null ? 'fixed' : 'pct')
  const [commPct,      setCommPct]      = useState(sale?.commissionPct   != null ? String(sale.commissionPct)   : '5')
  const [commFixed,    setCommFixed]    = useState(sale?.commissionFixed  != null ? String(sale.commissionFixed) : '')
  const [brokerPct,    setBrokerPct]    = useState(sale?.brokerPct        != null ? String(sale.brokerPct)       : '100')

  const [newContactOpen, setNewContactOpen] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const filteredClients = clientSearch.trim()
    ? contacts.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
    : contacts.slice(0, 5)

  const filteredProps = propertyName.trim()
    ? properties.filter(p => p.name.toLowerCase().includes(propertyName.toLowerCase()))
    : properties.slice(0, 5)

  function parseVal(v: string) { return Number(v.replace(/\D/g, '')) }
  function fmtInput(raw: string) {
    const d = raw.replace(/\D/g, '')
    if (!d) return ''
    return parseInt(d, 10).toLocaleString('pt-BR')
  }

  // Preview comissões em tempo real
  const preview = useMemo(() => {
    const saleVal = parseVal(value)
    if (!saleVal) return null
    const totalComm = commMode === 'pct'
      ? saleVal * (parseFloat(commPct) || 0) / 100
      : parseVal(commFixed)
    const brokerComm = totalComm * (parseFloat(brokerPct) || 0) / 100
    return { totalComm, brokerComm }
  }, [value, commMode, commPct, commFixed, brokerPct])

  function validate() {
    const errs: Record<string, string> = {}
    if (!clientId)                     errs.client   = 'Selecione um cliente'
    if (!propertyName.trim())          errs.property = 'Informe o empreendimento'
    if (!date)                         errs.date     = 'Data é obrigatória'
    if (!value || parseVal(value) === 0) errs.value  = 'Valor inválido'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!validate()) return

    const data: Omit<Sale, 'id' | 'createdAt'> = {
      clientId,
      propertyId:      propertyId || undefined,
      propertyName:    propertyName.trim(),
      date,
      value:           parseVal(value),
      type,
      notes:           notes.trim() || undefined,
      commissionPct:   commMode === 'pct'   ? (parseFloat(commPct) || undefined)   : undefined,
      commissionFixed: commMode === 'fixed' ? (parseVal(commFixed) || undefined)   : undefined,
      brokerPct:       parseFloat(brokerPct) || 40,
    }

    if (isEditing && sale) {
      update(sale.id, data)
      toast.success('Venda atualizada')
    } else {
      add(data)
      toast.success(`Venda registrada — ${formatCurrencyFull(parseVal(value))}`)
    }
    onClose()
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? 'Editar Venda' : 'Nova Venda'}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">

          {/* Cliente */}
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
              className={`w-full bg-s3/50 border rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${errors.client ? 'border-red-500/50' : 'border-line'}`}
            />
            {errors.client && <p className="text-xs text-red-400">{errors.client}</p>}
            {showClientDrop && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-page border border-line rounded-xl shadow-xl z-10 overflow-hidden">
                {filteredClients.map(c => (
                  <button key={c.id} type="button"
                    onMouseDown={() => { setClientId(c.id); setClientSearch(c.name); setShowClientDrop(false) }}
                    className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-s3/50 transition-colors cursor-pointer"
                  >{c.name}</button>
                ))}
                <button type="button"
                  onMouseDown={() => { setShowClientDrop(false); setNewContactOpen(true) }}
                  className="w-full text-left px-4 py-2.5 text-xs text-brand hover:bg-indigo-500/10 border-t border-line flex items-center gap-2 transition-colors cursor-pointer"
                ><Plus size={12} /> Criar novo contato</button>
              </div>
            )}
          </div>

          {/* Empreendimento */}
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
              className={`w-full bg-s3/50 border rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${errors.property ? 'border-red-500/50' : 'border-line'}`}
            />
            {errors.property && <p className="text-xs text-red-400">{errors.property}</p>}
            {showPropDrop && filteredProps.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-page border border-line rounded-xl shadow-xl z-10 overflow-hidden">
                {filteredProps.map(p => (
                  <button key={p.id} type="button"
                    onMouseDown={() => { setPropertyId(p.id); setPropertyName(p.name); setShowPropDrop(false) }}
                    className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-s3/50 transition-colors cursor-pointer"
                  >
                    {p.name}
                    <span className="text-slate-600 ml-2 text-xs">{p.neighborhood}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Data + Tipo */}
          <div className="grid grid-cols-2 gap-4">
            <Input label="Data" required type="date" value={date} onChange={e => setDate(e.target.value)} error={errors.date} />
            <Select label="Tipo" required value={type} onChange={e => setType(e.target.value as SaleType)}>
              <option value="ready">Pronto</option>
              <option value="off_plan">Planta</option>
            </Select>
          </div>

          {/* Valor da venda */}
          <div className="relative">
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
              Valor da venda <span className="text-red-400">*</span>
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-xs text-slate-500 font-medium select-none">R$</span>
              <input
                value={fmtInput(value)}
                onChange={e => setValue(e.target.value)}
                inputMode="numeric"
                placeholder="600.000"
                className={`w-full bg-s3/50 border rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${errors.value ? 'border-red-500/50' : 'border-line'}`}
              />
            </div>
            {errors.value && <p className="text-xs text-red-400 mt-1">{errors.value}</p>}
          </div>

          {/* ── Seção de comissão ── */}
          <div className="flex flex-col gap-3 p-4 rounded-xl bg-blue-500/5 border border-blue-500/15">
            <div className="flex items-center gap-2 mb-1">
              <BadgePercent size={13} className="text-violet-400" />
              <p className="text-xs font-semibold text-violet-300 uppercase tracking-wider">Comissão negociada</p>
            </div>

            {/* Modo: % ou valor fixo */}
            <div className="flex gap-2">
              {([['pct', 'Por % da venda'], ['fixed', 'Valor fixo (R$)']] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setCommMode(mode)}
                  className={`flex-1 text-xs py-2 rounded-xl border transition-all cursor-pointer ${
                    commMode === mode
                      ? 'bg-violet-500/20 border-violet-500/40 text-violet-300 font-semibold'
                      : 'bg-s3/50 border-line text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Input + presets de % */}
            {commMode === 'pct' ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={commPct}
                      onChange={e => setCommPct(e.target.value)}
                      className="w-full bg-s3/50 border border-line rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                      placeholder="5"
                    />
                  </div>
                  <span className="text-slate-400 text-sm font-medium">% do valor</span>
                </div>
                {/* Presets rápidos de % */}
                <div className="flex gap-1.5">
                  {['3', '4', '5', '6', '7'].map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setCommPct(p)}
                      className={`flex-1 text-xs py-1.5 rounded-lg border transition-all cursor-pointer ${
                        commPct === p
                          ? 'bg-violet-500/25 border-violet-500/50 text-violet-300 font-semibold'
                          : 'bg-s3/30 border-line text-slate-600 hover:text-slate-300 hover:border-slate-500'
                      }`}
                    >{p}%</button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="relative flex items-center">
                <span className="absolute left-3 text-xs text-slate-500 font-medium select-none">R$</span>
                <input
                  value={fmtInput(commFixed)}
                  onChange={e => setCommFixed(e.target.value)}
                  inputMode="numeric"
                  placeholder="30.000"
                  className="w-full bg-s3/50 border border-line rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>
            )}

            {/* Split — presets rápidos */}
            <div className="flex flex-col gap-2 pt-1 border-t border-violet-500/10">
              <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Divisão da comissão</p>
              <div className="flex gap-1.5">
                {([['100', 'Autônomo', '100%'], ['50', 'Parceria', '50/50'], ['40', 'Com imob.', '40%']] as const).map(([val, label, sub]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setBrokerPct(val)}
                    className={`flex-1 flex flex-col items-center py-2 rounded-xl border transition-all cursor-pointer ${
                      brokerPct === val
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                        : 'bg-s3/30 border-line text-slate-500 hover:text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    <span className="text-xs font-semibold">{label}</span>
                    <span className="text-[10px] opacity-70">{sub}</span>
                  </button>
                ))}
                {/* Input manual de split */}
                <div className="flex items-center gap-1 bg-s3/30 border border-line rounded-xl px-2">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={brokerPct}
                    onChange={e => setBrokerPct(e.target.value)}
                    className="w-10 bg-transparent text-xs text-slate-300 focus:outline-none text-center"
                    placeholder="—"
                  />
                  <span className="text-[10px] text-slate-600">%</span>
                </div>
              </div>
            </div>

            {/* Preview calculado */}
            {preview && preview.totalComm > 0 && (
              <div className="pt-1 border-t border-violet-500/15">
                {parseFloat(brokerPct) === 100 ? (
                  /* Modo autônomo: exibe só um valor */
                  <div className="bg-s2/50 rounded-xl px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <DollarSign size={14} className="text-emerald-400" />
                      <p className="text-xs text-slate-400">Sua comissão</p>
                    </div>
                    <p className="text-base font-bold text-emerald-400 tabular-nums">{formatCurrencyFull(preview.totalComm)}</p>
                  </div>
                ) : (
                  /* Modo split: exibe divisão */
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-s2/50 rounded-xl px-3 py-2.5 text-center">
                      <p className="text-[10px] text-slate-500 mb-0.5">Comissão total</p>
                      <p className="text-sm font-bold text-violet-400 tabular-nums">{formatCurrencyFull(preview.totalComm)}</p>
                    </div>
                    <div className="bg-s2/50 rounded-xl px-3 py-2.5 text-center">
                      <p className="text-[10px] text-slate-500 mb-0.5">Sua parte ({brokerPct}%)</p>
                      <p className="text-sm font-bold text-emerald-400 tabular-nums">{formatCurrencyFull(preview.brokerComm)}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Observações */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Observações</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Informações adicionais..."
              rows={2}
              className="w-full bg-s3/50 border border-line rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
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
