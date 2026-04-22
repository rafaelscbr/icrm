import { useState, useRef, useEffect, FormEvent } from 'react'
import { ImagePlus, X, Plus, Building2, Layers } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Button } from '../../components/ui/Button'
import { Property, PropertyStatus, PropertyType, PropertyKind } from '../../types'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { useContactsStore } from '../../store/useContactsStore'
import { ContactForm } from '../contacts/ContactForm'
import toast from 'react-hot-toast'

interface PropertyFormProps {
  isOpen: boolean
  onClose: () => void
  property?: Property
}

const STATUS_OPTIONS: { value: PropertyStatus; label: string }[] = [
  { value: 'opportunity',  label: 'Oportunidade'      },
  { value: 'market_price', label: 'Preço de mercado'  },
  { value: 'above_market', label: 'Acima do mercado'  },
]

const TYPE_OPTIONS: { value: PropertyType; label: string }[] = [
  { value: 'apartment', label: 'Apartamento' },
  { value: 'house',     label: 'Casa'        },
  { value: 'commercial',label: 'Comercial'   },
  { value: 'land',      label: 'Terreno'     },
]

export function PropertyForm({ isOpen, onClose, property }: PropertyFormProps) {
  const { add, update } = usePropertiesStore()
  const { contacts, getById } = useContactsStore()
  const fileRef = useRef<HTMLInputElement>(null)

  const isEditing = Boolean(property)

  const [kind,            setKind]            = useState<PropertyKind>(property?.kind ?? 'ready')
  const [name,            setName]            = useState(property?.name ?? '')
  const [developmentName, setDevelopmentName] = useState(property?.developmentName ?? '')
  const [type,            setType]            = useState<PropertyType>(property?.type ?? 'apartment')
  const [neighborhood,    setNeighborhood]    = useState(property?.neighborhood ?? '')
  const [value,           setValue]           = useState(property?.value ? String(property.value) : '')
  const [status,          setStatus]          = useState<PropertyStatus>(property?.status ?? 'opportunity')
  const [ownerId,         setOwnerId]         = useState(property?.ownerId ?? '')
  const [images,          setImages]          = useState<string[]>(property?.images ?? [])
  const [ownerSearch,     setOwnerSearch]     = useState(property ? (getById(property.ownerId ?? '')?.name ?? '') : '')
  const [showOwnerDropdown, setShowOwnerDropdown] = useState(false)
  const [newContactOpen,  setNewContactOpen]  = useState(false)
  const [errors,          setErrors]          = useState<Record<string, string>>({})

  useEffect(() => {
    if (!isOpen) return
    setKind(property?.kind ?? 'ready')
    setName(property?.name ?? '')
    setDevelopmentName(property?.developmentName ?? '')
    setType(property?.type ?? 'apartment')
    setNeighborhood(property?.neighborhood ?? '')
    setValue(property?.value ? String(property.value) : '')
    setStatus(property?.status ?? 'opportunity')
    setOwnerId(property?.ownerId ?? '')
    setImages(property?.images ?? [])
    setOwnerSearch(property ? (getById(property.ownerId ?? '')?.name ?? '') : '')
    setErrors({})
  }, [isOpen, property])

  const filteredContacts = ownerSearch.trim()
    ? contacts.filter(c => c.name.toLowerCase().includes(ownerSearch.toLowerCase()))
    : contacts.slice(0, 5)

  function handleImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = (ev) => setImages(prev => [...prev, ev.target?.result as string])
      reader.readAsDataURL(file)
    })
  }

  function validate() {
    const errs: Record<string, string> = {}
    if (kind === 'ready') {
      if (!name.trim())         errs.name  = 'Nome é obrigatório'
      if (!ownerId)             errs.owner = 'Selecione um proprietário'
    } else {
      if (!developmentName.trim()) errs.developmentName = 'Nome do empreendimento é obrigatório'
    }
    if (!neighborhood.trim()) errs.neighborhood = 'Bairro é obrigatório'
    if (!value || isNaN(Number(value.replace(/\D/g, '')))) errs.value = 'Valor inválido'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function parseValue(v: string) {
    return Number(v.replace(/\D/g, ''))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!validate()) return

    const resolvedName = kind === 'off_plan' ? developmentName.trim() : name.trim()

    const data = {
      kind,
      name:            resolvedName,
      developmentName: kind === 'off_plan' ? developmentName.trim() : undefined,
      type,
      neighborhood:    neighborhood.trim(),
      value:           parseValue(value),
      status,
      ownerId:         kind === 'ready' ? ownerId : undefined,
      images,
    }

    if (isEditing && property) {
      update(property.id, data)
      toast.success('Imóvel atualizado')
    } else {
      add(data)
      toast.success('Imóvel cadastrado')
    }
    onClose()
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? 'Editar Imóvel' : 'Novo Imóvel'} size="lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">

          {/* Kind toggle */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Tipo de imóvel *</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: 'ready',    label: 'Pronto',     icon: Building2, desc: 'Imóvel já construído' },
                { value: 'off_plan', label: 'Na Planta',  icon: Layers,    desc: 'Empreendimento em lançamento' },
              ] as { value: PropertyKind; label: string; icon: typeof Building2; desc: string }[]).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setKind(opt.value)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all cursor-pointer text-left
                    ${kind === opt.value
                      ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                      : 'bg-white/5 border-white/10 text-slate-500 hover:text-slate-300 hover:border-white/20'
                    }`}
                >
                  <opt.icon size={16} className={kind === opt.value ? 'text-indigo-400' : 'text-slate-600'} />
                  <div>
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-[10px] opacity-70">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Images */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Fotos (opcional)</p>
            <div className="flex gap-2 flex-wrap">
              {images.map((img, i) => (
                <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden">
                  <img src={img} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                    className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/70 rounded-full flex items-center justify-center text-white cursor-pointer"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-16 h-16 rounded-xl bg-white/5 border border-dashed border-white/20 flex items-center justify-center text-slate-500 hover:bg-white/10 hover:text-slate-300 transition-colors cursor-pointer"
              >
                <ImagePlus size={18} />
              </button>
              <input ref={fileRef} type="file" multiple accept="image/*" className="hidden" onChange={handleImages} />
            </div>
          </div>

          {/* Name field — conditional */}
          {kind === 'ready' ? (
            <Input
              label="Nome do imóvel"
              required
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              error={errors.name}
              placeholder="Apt 203 - Pinheiros"
            />
          ) : (
            <Input
              label="Nome do empreendimento"
              required
              autoFocus
              value={developmentName}
              onChange={e => setDevelopmentName(e.target.value)}
              error={errors.developmentName}
              placeholder="Reserva do Parque"
            />
          )}

          {/* Type + Neighborhood */}
          <div className="grid grid-cols-2 gap-4">
            <Select label="Tipo" required value={type} onChange={e => setType(e.target.value as PropertyType)}>
              {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
            <Input
              label="Bairro / Região"
              required
              value={neighborhood}
              onChange={e => setNeighborhood(e.target.value)}
              error={errors.neighborhood}
              placeholder="Pinheiros"
            />
          </div>

          {/* Value — label muda conforme kind */}
          <Input
            label={kind === 'off_plan' ? 'Ticket Médio' : 'Valor'}
            required
            value={value}
            onChange={e => setValue(e.target.value)}
            error={errors.value}
            placeholder={kind === 'off_plan' ? 'ex: 450000' : '850000'}
          />

          {/* Status */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Status *</p>
            <div className="flex gap-2">
              {STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStatus(opt.value)}
                  className={`
                    flex-1 py-2 rounded-xl text-xs font-medium border transition-all duration-150 cursor-pointer
                    ${status === opt.value
                      ? opt.value === 'opportunity' ? 'bg-green-500/20 border-green-500/40 text-green-300'
                        : opt.value === 'market_price' ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300'
                        : 'bg-red-500/20 border-red-500/40 text-red-300'
                      : 'bg-white/5 border-white/10 text-slate-500 hover:text-slate-300'
                    }
                  `}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Owner — apenas para pronto */}
          {kind === 'ready' && (
            <div className="flex flex-col gap-1.5 relative">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Proprietário <span className="text-red-400">*</span>
              </p>
              <input
                value={ownerSearch}
                onChange={e => { setOwnerSearch(e.target.value); setOwnerId(''); setShowOwnerDropdown(true) }}
                onFocus={() => setShowOwnerDropdown(true)}
                onBlur={() => setTimeout(() => setShowOwnerDropdown(false), 150)}
                placeholder="Buscar contato..."
                className={`
                  w-full bg-white/5 border rounded-xl px-3 py-2.5 text-sm text-slate-100
                  placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50
                  ${errors.owner ? 'border-red-500/50' : 'border-white/10'}
                `}
              />
              {errors.owner && <p className="text-xs text-red-400">{errors.owner}</p>}
              {showOwnerDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[#1A1D27] border border-white/10 rounded-xl shadow-xl z-10 overflow-hidden">
                  {filteredContacts.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={() => { setOwnerId(c.id); setOwnerSearch(c.name); setShowOwnerDropdown(false) }}
                      className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      {c.name}
                      {c.company && <span className="text-slate-600 ml-2 text-xs">{c.company}</span>}
                    </button>
                  ))}
                  <button
                    type="button"
                    onMouseDown={() => { setShowOwnerDropdown(false); setNewContactOpen(true) }}
                    className="w-full text-left px-4 py-2.5 text-xs text-indigo-400 hover:bg-indigo-500/10 border-t border-white/5 flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <Plus size={12} /> Criar novo contato
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button type="submit" className="flex-1">{isEditing ? 'Salvar alterações' : 'Salvar imóvel'}</Button>
          </div>
        </form>
      </Modal>

      <ContactForm
        isOpen={newContactOpen}
        onClose={() => setNewContactOpen(false)}
        defaultTags={['owner']}
        onCreated={(c) => { setOwnerId(c.id); setOwnerSearch(c.name) }}
      />
    </>
  )
}
