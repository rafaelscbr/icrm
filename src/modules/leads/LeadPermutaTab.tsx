import { useState } from 'react'
import { ArrowLeftRight, Car, Home, Save, Trash2, CheckCircle2, Plus, X } from 'lucide-react'
import { Contact, PermutaItem } from '../../types'
import { useContactsStore } from '../../store/useContactsStore'
import { formatCurrencyFull } from '../../lib/formatters'

interface LeadPermutaTabProps {
  contact: Contact | undefined
}

const REGIONS = [
  'Balneário Camboriú', 'Camboriú', 'Itajaí', 'Navegantes',
  'Itapema', 'Porto Belo', 'Florianópolis', 'Blumenau',
  'São José', 'Palhoça', 'Biguaçu',
]

function generateLocalId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function formatCurrencyInput(value: string): string {
  const num = value.replace(/\D/g, '')
  if (!num) return ''
  return Number(num).toLocaleString('pt-BR')
}

function blankItem(): PermutaItem {
  return { id: generateLocalId(), type: 'imovel' }
}

// ─── Sub-componente de um item ────────────────────────────────────────────────

interface ItemFormProps {
  item: PermutaItem
  onChange: (updated: PermutaItem) => void
  onRemove: () => void
  isOnly: boolean
}

function ItemForm({ item, onChange, onRemove, isOnly }: ItemFormProps) {
  const inputClass = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-500/40 transition-all'
  const labelClass = 'text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block'

  function set(patch: Partial<PermutaItem>) {
    onChange({ ...item, ...patch })
  }

  return (
    <div className="bg-white/3 border border-white/8 rounded-xl p-3 space-y-3">
      {/* Header do item */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1.5 flex-1">
          <button
            onClick={() => set({ type: 'imovel', carModel: undefined, carValue: undefined })}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-medium transition-all ${
              item.type === 'imovel'
                ? 'bg-orange-500/15 border-orange-500/40 text-orange-300'
                : 'bg-white/3 border-white/8 text-slate-500 hover:text-slate-300 hover:border-white/15'
            }`}
          >
            <Home size={12} /> Imóvel
          </button>
          <button
            onClick={() => set({ type: 'carro', region: undefined, value: undefined })}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-medium transition-all ${
              item.type === 'carro'
                ? 'bg-orange-500/15 border-orange-500/40 text-orange-300'
                : 'bg-white/3 border-white/8 text-slate-500 hover:text-slate-300 hover:border-white/15'
            }`}
          >
            <Car size={12} /> Carro
          </button>
        </div>
        {!isOnly && (
          <button
            onClick={onRemove}
            className="flex items-center justify-center w-7 h-7 rounded-lg bg-red-500/8 hover:bg-red-500/18 border border-red-500/20 text-red-400 hover:text-red-300 transition-all flex-shrink-0"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Campos por tipo */}
      {item.type === 'imovel' ? (
        <>
          <div>
            <label className={labelClass}>Região do imóvel</label>
            <div className="flex flex-wrap gap-1 mb-2">
              {REGIONS.map(r => (
                <button
                  key={r}
                  onClick={() => set({ region: item.region === r ? undefined : r })}
                  className={`text-[11px] px-2 py-0.5 rounded-lg border transition-all ${
                    item.region === r
                      ? 'bg-orange-500/20 border-orange-500/40 text-orange-300 font-medium'
                      : 'bg-white/3 border-white/8 text-slate-500 hover:text-slate-300 hover:border-white/15'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={item.region ?? ''}
              onChange={e => set({ region: e.target.value || undefined })}
              placeholder="Ou digita outra região..."
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Valor do imóvel</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 pointer-events-none">R$</span>
              <input
                type="text"
                inputMode="numeric"
                value={formatCurrencyInput(String(item.value ?? ''))}
                onChange={e => set({ value: e.target.value.replace(/\D/g, '') ? Number(e.target.value.replace(/\D/g, '')) : undefined })}
                placeholder="0"
                className={`${inputClass} pl-9`}
              />
            </div>
            {item.value && (
              <p className="text-xs text-orange-400 mt-1 font-medium">{formatCurrencyFull(item.value)}</p>
            )}
          </div>
        </>
      ) : (
        <>
          <div>
            <label className={labelClass}>Modelo do carro</label>
            <input
              type="text"
              value={item.carModel ?? ''}
              onChange={e => set({ carModel: e.target.value || undefined })}
              placeholder="Ex: Honda Civic 2022..."
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Valor de entrada</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 pointer-events-none">R$</span>
              <input
                type="text"
                inputMode="numeric"
                value={formatCurrencyInput(String(item.carValue ?? ''))}
                onChange={e => set({ carValue: e.target.value.replace(/\D/g, '') ? Number(e.target.value.replace(/\D/g, '')) : undefined })}
                placeholder="0"
                className={`${inputClass} pl-9`}
              />
            </div>
            {item.carValue && (
              <p className="text-xs text-orange-400 mt-1 font-medium">{formatCurrencyFull(item.carValue)}</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Tab principal ────────────────────────────────────────────────────────────

export function LeadPermutaTab({ contact }: LeadPermutaTabProps) {
  const { update: updateContact } = useContactsStore()

  const [items, setItems] = useState<PermutaItem[]>(
    () => contact?.permutaItems?.length ? contact.permutaItems : [blankItem()]
  )
  const [saved, setSaved] = useState(false)

  const hasData = !!(contact?.permutaItems?.length)

  function handleChange(index: number, updated: PermutaItem) {
    setItems(prev => prev.map((it, i) => i === index ? updated : it))
  }

  function handleRemove(index: number) {
    setItems(prev => prev.length === 1 ? [blankItem()] : prev.filter((_, i) => i !== index))
  }

  function handleAdd() {
    setItems(prev => [...prev, blankItem()])
  }

  function handleSave() {
    if (!contact) return
    // Filtra itens que tenham ao menos algum dado preenchido
    const filled = items.filter(it =>
      it.type === 'imovel' ? (it.region || it.value) : (it.carModel || it.carValue)
    )
    updateContact(contact.id, { permutaItems: filled.length > 0 ? filled : [] })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleClear() {
    if (!contact) return
    updateContact(contact.id, { permutaItems: [] })
    setItems([blankItem()])
  }

  if (!contact) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center">
          <ArrowLeftRight size={20} className="text-orange-400/50" />
        </div>
        <div>
          <p className="text-sm font-medium text-slate-400">Sem contato vinculado</p>
          <p className="text-xs text-slate-600 mt-1">O lead precisa de um contato para registrar permuta</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center gap-2.5 px-1">
        <div className="w-7 h-7 rounded-lg bg-orange-500/15 flex items-center justify-center flex-shrink-0">
          <ArrowLeftRight size={13} className="text-orange-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-orange-300">Perfil de Permuta</p>
          <p className="text-[11px] text-slate-500 truncate">Contato: {contact.name}</p>
        </div>
        {hasData && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/25 flex-shrink-0">
            {contact.permutaItems.length} item{contact.permutaItems.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Lista de itens */}
      <div className="space-y-3">
        {items.map((item, i) => (
          <ItemForm
            key={item.id}
            item={item}
            onChange={updated => handleChange(i, updated)}
            onRemove={() => handleRemove(i)}
            isOnly={items.length === 1}
          />
        ))}
      </div>

      {/* Botão adicionar */}
      <button
        onClick={handleAdd}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-dashed border-white/15 text-xs text-slate-500 hover:text-slate-300 hover:border-white/25 transition-all"
      >
        <Plus size={12} /> Adicionar outro bem para permuta
      </button>

      {/* Ações */}
      <div className="flex gap-2 pt-1">
        {hasData && (
          <button
            onClick={handleClear}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs text-red-400 hover:text-red-300 bg-red-500/8 hover:bg-red-500/15 border border-red-500/20 rounded-xl transition-all"
          >
            <Trash2 size={12} /> Limpar
          </button>
        )}
        <button
          onClick={handleSave}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            saved
              ? 'bg-green-500/20 border border-green-500/30 text-green-300'
              : 'bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/30 hover:border-orange-500/50 text-orange-200'
          }`}
        >
          {saved ? (
            <><CheckCircle2 size={14} /> Salvo no contato!</>
          ) : (
            <><Save size={14} /> Salvar no contato</>
          )}
        </button>
      </div>

      <p className="text-[10px] text-slate-600 text-center">
        Salvo diretamente em {contact.name} — disponível em todo o CRM
      </p>
    </div>
  )
}
