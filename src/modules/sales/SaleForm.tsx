import { useState, FormEvent, useMemo } from 'react'
import { Plus } from 'lucide-react'
import { SidePanel } from '../../components/ui/SidePanel'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { Sale, SaleType } from '../../types'
import { useSalesStore } from '../../store/useSalesStore'
import { useContactsStore } from '../../store/useContactsStore'
import { useContactSearch } from '../../hooks/useContactSearch'
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
  const { getById: getContact, mergeLocal } = useContactsStore()
  const { properties } = usePropertiesStore()

  const isEditing = Boolean(sale)
  const today = new Date().toISOString().split('T')[0]

  const [clientId,      setClientId]      = useState(sale?.clientId ?? '')
  const [clientSearch,  setClientSearch]  = useState(sale ? (getContact(sale.clientId)?.name ?? '') : '')
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

  // Busca no servidor (debounce) — evita carregar 12.543 contatos só para o combobox
  const { resultados: contactResults } = useContactSearch(clientSearch, 8)

  const filteredClients = clientSearch.trim()
    ? contactResults
    : []

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

  const [salvando, setSalvando] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (salvando || !validate()) return

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

    // Banco primeiro: antes a venda entrava na lista e a falha sumia no
    // console — a tela dizia "registrada" e a venda não existia.
    setSalvando(true)
    try {
      if (isEditing && sale) {
        await update(sale.id, data)
        toast.success('Venda atualizada')
      } else {
        await add(data)
        toast.success(`Venda registrada · ${formatCurrencyFull(parseVal(value))}`)
      }
      onClose()
    } catch { /* erro já avisado pela camada db — o painel fica aberto */ } finally {
      setSalvando(false)
    }
  }

  const sujo = !isEditing && Boolean(value || clientId || propertyName.trim() || notes.trim())

  const [showNotes, setShowNotes] = useState(Boolean(sale?.notes))
  const pctPresets = ['3', '4', '5', '6', '7']
  const splitPresets = [['100', 'Autônomo'], ['50', 'Parceria 50/50'], ['40', 'Com imobiliária 40%']] as const

  const pilula = (ativo: boolean) =>
    `px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors cursor-pointer ${
      ativo ? 'bg-brand-fill text-brand-fill-text' : 'bg-s2 text-t2 hover:bg-s3'}`

  // v9 "folha limpa": o valor é o título do formulário (é o que se quer
  // registrar), a comissão aparece calculada logo embaixo, e o resto vem em
  // linhas simples — sem caixa azul em volta da comissão, sem divisórias.
  return (
    <>
      <SidePanel
        size="md"
        isOpen={isOpen}
        onClose={onClose}
        title={isEditing ? 'Editar venda' : 'Nova venda'}
        confirmarSaida={sujo && !salvando}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" form="form-venda" carregando={salvando}>{isEditing ? 'Salvar alterações' : 'Registrar venda'}</Button>
          </div>
        }
      >
        <form id="form-venda" onSubmit={handleSubmit} className="flex flex-col gap-6">

          {/* Valor — o título */}
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-[22px] font-bold text-t4 select-none">R$</span>
              <input
                id="venda-valor"
                value={fmtInput(value)}
                onChange={e => setValue(e.target.value)}
                inputMode="numeric"
                placeholder="Valor da venda"
                aria-label="Valor da venda"
                aria-invalid={errors.value ? true : undefined}
                // eslint-disable-next-line jsx-a11y/no-autofocus -- o painel abre para registrar: o cursor já vai para o valor
                autoFocus={!isEditing}
                className="campo-titulo campo-livre tabular-nums"
              />
            </div>
            {errors.value && <p className="text-xs text-error mt-0.5" role="alert">{errors.value}</p>}
            {preview && preview.totalComm > 0 && (
              <p className="mt-1 text-[13px] text-t3">
                Sua comissão{' '}
                <span className="font-semibold text-success tabular-nums">{formatCurrencyFull(preview.brokerComm)}</span>
                {parseFloat(brokerPct) !== 100 && (
                  <span className="text-t4"> de {formatCurrencyFull(preview.totalComm)}</span>
                )}
              </p>
            )}
          </div>

          {/* Cliente */}
          <div className="flex flex-col gap-1.5 relative">
            <label htmlFor="venda-cliente" className="rotulo-campo">Cliente <span className="text-error">*</span></label>
            <input
              id="venda-cliente"
              value={clientSearch}
              onChange={e => { setClientSearch(e.target.value); setClientId(''); setShowClientDrop(true) }}
              onFocus={() => setShowClientDrop(true)}
              onBlur={() => setTimeout(() => setShowClientDrop(false), 150)}
              placeholder="Buscar por nome ou telefone"
              aria-invalid={errors.client ? true : undefined}
              className="w-full px-3.5 py-2.5 min-h-[44px]"
            />
            {errors.client && <p className="text-xs text-error">{errors.client}</p>}
            {showClientDrop && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-line rounded-xl shadow-dropdown z-10 overflow-hidden">
                {filteredClients.map(c => (
                  <button key={c.id} type="button"
                    onMouseDown={() => { mergeLocal([c]); setClientId(c.id); setClientSearch(c.name); setShowClientDrop(false) }}
                    className="w-full text-left px-4 py-2.5 text-sm text-t2 hover:bg-s2 transition-colors cursor-pointer"
                  >{c.name}</button>
                ))}
                <button type="button"
                  onMouseDown={() => { setShowClientDrop(false); setNewContactOpen(true) }}
                  className="w-full text-left px-4 py-2.5 text-[13px] text-t2 hover:bg-s2 flex items-center gap-2 transition-colors cursor-pointer"
                ><Plus size={13} /> Criar novo contato</button>
              </div>
            )}
          </div>

          {/* Imóvel */}
          <div className="flex flex-col gap-1.5 relative">
            <label htmlFor="venda-imovel" className="rotulo-campo">Imóvel ou empreendimento <span className="text-error">*</span></label>
            <input
              id="venda-imovel"
              value={propertyName}
              onChange={e => { setPropertyName(e.target.value); setPropertyId(''); setShowPropDrop(true) }}
              onFocus={() => setShowPropDrop(true)}
              onBlur={() => setTimeout(() => setShowPropDrop(false), 150)}
              placeholder="Buscar ou digitar o nome"
              aria-invalid={errors.property ? true : undefined}
              className="w-full px-3.5 py-2.5 min-h-[44px]"
            />
            {errors.property && <p className="text-xs text-error">{errors.property}</p>}
            {showPropDrop && filteredProps.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-line rounded-xl shadow-dropdown z-10 overflow-hidden">
                {filteredProps.map(p => (
                  <button key={p.id} type="button"
                    onMouseDown={() => { setPropertyId(p.id); setPropertyName(p.name); setShowPropDrop(false) }}
                    className="w-full text-left px-4 py-2.5 text-sm text-t2 hover:bg-s2 transition-colors cursor-pointer"
                  >
                    {p.name}
                    <span className="text-t4 ml-2 text-xs">{p.neighborhood}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Data + tipo */}
          <div className="grid grid-cols-2 gap-3 items-end">
            <Input label="Data" required type="date" value={date} onChange={e => setDate(e.target.value)} error={errors.date} />
            <div className="flex flex-col gap-1.5">
              <span className="rotulo-campo">Tipo</span>
              <div className="flex gap-1.5 min-h-[44px] items-center" role="radiogroup" aria-label="Tipo de imóvel">
                {([['ready', 'Pronto'], ['off_plan', 'Na planta']] as const).map(([v, l]) => (
                  <button key={v} type="button" role="radio" aria-checked={type === v}
                    onClick={() => setType(v as SaleType)} className={pilula(type === v)}>{l}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Comissão */}
          <div className="flex flex-col gap-2">
            <span className="rotulo-campo">Comissão</span>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Comissão negociada">
              {pctPresets.map(p => (
                <button key={p} type="button" role="radio" aria-checked={commMode === 'pct' && commPct === p}
                  onClick={() => { setCommMode('pct'); setCommPct(p) }}
                  className={pilula(commMode === 'pct' && commPct === p)}>{p}%</button>
              ))}
              <button type="button" role="radio" aria-checked={commMode === 'pct' && !pctPresets.includes(commPct)}
                onClick={() => { setCommMode('pct'); if (pctPresets.includes(commPct)) setCommPct('') }}
                className={pilula(commMode === 'pct' && !pctPresets.includes(commPct))}>Outro %</button>
              <button type="button" role="radio" aria-checked={commMode === 'fixed'}
                onClick={() => setCommMode('fixed')} className={pilula(commMode === 'fixed')}>Valor fixo</button>
            </div>
            {commMode === 'pct' && !pctPresets.includes(commPct) && (
              <div className="flex items-center gap-2 animate-in fade-in duration-150">
                <input type="number" min="0" max="100" step="0.1" value={commPct}
                  onChange={e => setCommPct(e.target.value)} placeholder="4,5" aria-label="Percentual de comissão"
                  className="w-28 px-3.5 py-2.5 min-h-[44px]" />
                <span className="text-[13px] text-t3">% do valor</span>
              </div>
            )}
            {commMode === 'fixed' && (
              <div className="relative flex items-center animate-in fade-in duration-150">
                <span className="absolute left-3.5 text-[13px] text-t4 select-none">R$</span>
                <input value={fmtInput(commFixed)} onChange={e => setCommFixed(e.target.value)}
                  inputMode="numeric" placeholder="30.000" aria-label="Comissão em reais"
                  className="w-full pl-10 pr-4 py-2.5 min-h-[44px]" />
              </div>
            )}
          </div>

          {/* Divisão */}
          <div className="flex flex-col gap-2">
            <span className="rotulo-campo">Sua parte</span>
            <div className="flex flex-wrap gap-1.5 items-center" role="radiogroup" aria-label="Divisão da comissão">
              {splitPresets.map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={brokerPct === v}
                  onClick={() => setBrokerPct(v)} className={pilula(brokerPct === v)}>{l}</button>
              ))}
              <span className="flex items-center gap-1">
                <input type="number" min="0" max="100" step="1" value={brokerPct}
                  onChange={e => setBrokerPct(e.target.value)} aria-label="Percentual da sua parte"
                  className="w-16 px-2.5 py-1.5 text-center" />
                <span className="text-[13px] text-t4">%</span>
              </span>
            </div>
          </div>

          {/* Observação — recolhida */}
          {showNotes ? (
            <div className="flex flex-col gap-1.5 animate-in fade-in duration-150">
              <label htmlFor="venda-obs" className="rotulo-campo">Observação</label>
              <textarea id="venda-obs" value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Algo que vale lembrar sobre esta venda" rows={2}
                className="w-full px-3.5 py-2.5 resize-none" />
            </div>
          ) : (
            <button type="button" onClick={() => setShowNotes(true)}
              className="self-start text-[13px] font-medium text-t3 hover:text-t1 cursor-pointer">
              + Observação
            </button>
          )}
        </form>
      </SidePanel>

      <ContactForm
        isOpen={newContactOpen}
        onClose={() => setNewContactOpen(false)}
        defaultTags={['buyer']}
        onCreated={(c) => { setClientId(c.id); setClientSearch(c.name) }}
      />
    </>
  )
}
