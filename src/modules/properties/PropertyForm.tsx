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
  { value: 'apartment',          label: 'Apartamento'        },
  { value: 'apartment_duplex',   label: 'Apartamento Duplex' },
  { value: 'penthouse_duplex',   label: 'Cobertura Duplex'   },
  { value: 'house',              label: 'Casa'               },
  { value: 'commercial',         label: 'Comercial'          },
  { value: 'land',               label: 'Terreno'            },
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
  const [city,            setCity]            = useState(property?.city ?? '')
  const [address,         setAddress]         = useState(property?.address ?? '')
  const [complement,      setComplement]      = useState(property?.complement ?? '')
  const [unit,            setUnit]            = useState(property?.unit ?? '')
  const [bedrooms,        setBedrooms]        = useState(property?.bedrooms ? String(property.bedrooms) : '')
  const [suites,          setSuites]          = useState(property?.suites   ? String(property.suites)   : '')
  const [areaSqm,         setAreaSqm]         = useState(property?.areaSqm  ? String(property.areaSqm)  : '')
  const [condoFee,        setCondoFee]        = useState(property?.condoFee ? String(property.condoFee) : '')
  const [notes,           setNotes]           = useState(property?.notes ?? '')
  const [value,           setValue]           = useState(property?.value ? String(property.value) : '')
  const [status,          setStatus]          = useState<PropertyStatus>(property?.status ?? 'opportunity')
  const [ownerId,         setOwnerId]         = useState(property?.ownerId ?? '')
  const [images,          setImages]          = useState<string[]>(property?.images ?? [])
  const [ownerSearch,     setOwnerSearch]     = useState(property ? (getById(property.ownerId ?? '')?.name ?? '') : '')
  const [showOwnerDropdown, setShowOwnerDropdown] = useState(false)
  const [newContactOpen,  setNewContactOpen]  = useState(false)
  const [errors,          setErrors]          = useState<Record<string, string>>({})
  // Permuta
  const [acceptsPermuta,  setAcceptsPermuta]  = useState(property?.acceptsPermuta ?? false)
  const [permutaTypes,    setPermutaTypes]    = useState<Array<'imovel' | 'carro'>>(property?.permutaTypes ?? [])
  const [permutaRegions,  setPermutaRegions]  = useState<string[]>(property?.permutaRegions ?? [])

  useEffect(() => {
    if (!isOpen) return
    setKind(property?.kind ?? 'ready')
    setName(property?.name ?? '')
    setDevelopmentName(property?.developmentName ?? '')
    setType(property?.type ?? 'apartment')
    setNeighborhood(property?.neighborhood ?? '')
    setCity(property?.city ?? '')
    setAddress(property?.address ?? '')
    setComplement(property?.complement ?? '')
    setUnit(property?.unit ?? '')
    setBedrooms(property?.bedrooms ? String(property.bedrooms) : '')
    setSuites(property?.suites   ? String(property.suites)   : '')
    setAreaSqm(property?.areaSqm  ? String(property.areaSqm)  : '')
    setCondoFee(property?.condoFee ? String(property.condoFee) : '')
    setNotes(property?.notes ?? '')
    setValue(property?.value ? String(property.value) : '')
    setStatus(property?.status ?? 'opportunity')
    setOwnerId(property?.ownerId ?? '')
    setImages(property?.images ?? [])
    setOwnerSearch(property ? (getById(property.ownerId ?? '')?.name ?? '') : '')
    setAcceptsPermuta(property?.acceptsPermuta ?? false)
    setPermutaTypes(property?.permutaTypes ?? [])
    setPermutaRegions(property?.permutaRegions ?? [])
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

  // Formata para exibição no input: "850000" → "850.000"
  function fmtInput(raw: string): string {
    const d = raw.replace(/\D/g, '')
    if (!d) return ''
    return parseInt(d, 10).toLocaleString('pt-BR')
  }

  // Extrai dígitos puros: "850.000" → "850000"
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
      city:            city.trim() || undefined,
      address:         address.trim()    || undefined,
      complement:      complement.trim() || undefined,
      unit:            ['apartment','apartment_duplex','penthouse_duplex'].includes(type) ? (unit.trim() || undefined) : undefined,
      bedrooms:        bedrooms  ? Number(bedrooms)              : undefined,
      suites:          suites    ? Number(suites)                : undefined,
      areaSqm:         areaSqm   ? Number(areaSqm.replace(',', '.')) : undefined,
      condoFee:        condoFee  ? parseValue(condoFee)          : undefined,
      notes:           notes.trim() || undefined,
      value:           parseValue(value),
      status,
      ownerId:         kind === 'ready' ? ownerId : undefined,
      images,
      acceptsPermuta,
      permutaTypes:    acceptsPermuta ? permutaTypes : [],
      permutaRegions:  acceptsPermuta && permutaTypes.includes('imovel') ? permutaRegions : [],
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
            <p className="text-xs font-medium text-t3 uppercase tracking-wider">Tipo de imóvel *</p>
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
                      ? 'bg-brand-tint border-brand/40 text-brand-text'
                      : 'bg-s3/50 border-line text-t3 hover:text-t2 hover:border-line-strong'
                    }`}
                >
                  <opt.icon size={16} className={kind === opt.value ? 'text-brand' : 'text-t4'} />
                  <div>
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-[11px] opacity-70">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Images */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-t3 uppercase tracking-wider">Fotos (opcional)</p>
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
                className="w-16 h-16 rounded-xl bg-s3/50 border border-dashed border-line-strong flex items-center justify-center text-t3 hover:bg-s3/70 hover:text-t2 transition-colors cursor-pointer"
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

          {/* Cidade + Endereço */}
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Cidade"
              value={city}
              onChange={e => setCity(e.target.value)}
              placeholder="São Paulo"
            />
            <Input
              label="Rua / Logradouro"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Rua das Flores, 123"
            />
          </div>

          {/* Complemento + Unidade (apartamento) */}
          <div className={`grid gap-4 ${['apartment','apartment_duplex','penthouse_duplex'].includes(type) ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <Input
              label="Complemento"
              value={complement}
              onChange={e => setComplement(e.target.value)}
              placeholder="Bloco A, Torre 2…"
            />
            {['apartment','apartment_duplex','penthouse_duplex'].includes(type) && (
              <Input
                label="Unidade"
                value={unit}
                onChange={e => setUnit(e.target.value)}
                placeholder="Apto 203"
              />
            )}
          </div>

          {/* Dormitórios · Suítes · m² */}
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-t3 uppercase tracking-wider">Dormitórios</label>
              <input
                type="number" min="0" max="20"
                inputMode="numeric"
                value={bedrooms}
                onChange={e => setBedrooms(e.target.value)}
                placeholder="0"
                className="w-full bg-s3/50 border border-line rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-t3 uppercase tracking-wider">Suítes</label>
              <input
                type="number" min="0" max="20"
                inputMode="numeric"
                value={suites}
                onChange={e => setSuites(e.target.value)}
                placeholder="0"
                className="w-full bg-s3/50 border border-line rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-t3 uppercase tracking-wider">Área (m²)</label>
              <div className="relative">
                <input
                  type="text" inputMode="decimal"
                  value={areaSqm}
                  onChange={e => setAreaSqm(e.target.value.replace(/[^0-9,]/g, ''))}
                  placeholder="85"
                  className="w-full bg-s3/50 border border-line rounded-xl pl-3 pr-9 py-2.5 text-sm text-slate-100 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-t3 pointer-events-none">m²</span>
              </div>
            </div>
          </div>

          {/* Valor do condomínio */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-t3 uppercase tracking-wider">Valor do Condomínio</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-t3 select-none pointer-events-none">R$</span>
              <input
                inputMode="numeric"
                value={fmtInput(condoFee)}
                onChange={e => setCondoFee(e.target.value.replace(/\D/g, ''))}
                placeholder="800"
                className="w-full bg-s3/50 border border-line rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-100 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
            </div>
          </div>

          {/* Value com máscara BRL */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-t3 uppercase tracking-wider">
              {kind === 'off_plan' ? 'Ticket Médio' : 'Valor'} <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-t3 select-none pointer-events-none">
                R$
              </span>
              <input
                inputMode="numeric"
                value={fmtInput(value)}
                onChange={e => setValue(e.target.value.replace(/\D/g, ''))}
                placeholder="850.000"
                className={`w-full bg-s3/50 border rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-100
                  placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-indigo-500/50
                  ${errors.value ? 'border-red-500/50' : 'border-line'}`}
              />
            </div>
            {errors.value && <p className="text-xs text-red-400">{errors.value}</p>}
          </div>

          {/* Status */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-t3 uppercase tracking-wider">Status *</p>
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
                      : 'bg-s3/50 border-line text-t3 hover:text-t2'
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
              <p className="text-xs font-medium text-t3 uppercase tracking-wider">
                Proprietário <span className="text-red-400">*</span>
              </p>
              <input
                value={ownerSearch}
                onChange={e => { setOwnerSearch(e.target.value); setOwnerId(''); setShowOwnerDropdown(true) }}
                onFocus={() => setShowOwnerDropdown(true)}
                onBlur={() => setTimeout(() => setShowOwnerDropdown(false), 150)}
                placeholder="Buscar contato..."
                className={`
                  w-full bg-s3/50 border rounded-xl px-3 py-2.5 text-sm text-slate-100
                  placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-indigo-500/50
                  ${errors.owner ? 'border-red-500/50' : 'border-line'}
                `}
              />
              {errors.owner && <p className="text-xs text-red-400">{errors.owner}</p>}
              {showOwnerDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-page border border-line rounded-xl shadow-xl z-10 overflow-hidden">
                  {filteredContacts.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={() => { setOwnerId(c.id); setOwnerSearch(c.name); setShowOwnerDropdown(false) }}
                      className="w-full text-left px-4 py-2.5 text-sm text-t2 hover:bg-s3/50 transition-colors cursor-pointer"
                    >
                      {c.name}
                      {c.company && <span className="text-t4 ml-2 text-xs">{c.company}</span>}
                    </button>
                  ))}
                  <button
                    type="button"
                    onMouseDown={() => { setShowOwnerDropdown(false); setNewContactOpen(true) }}
                    className="w-full text-left px-4 py-2.5 text-xs text-brand hover:bg-indigo-500/10 border-t border-line flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <Plus size={12} /> Criar novo contato
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Observações */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-t3 uppercase tracking-wider">Observações</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Informações adicionais, diferenciais do imóvel, condições especiais…"
              className="w-full bg-s3/50 border border-line rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
            />
          </div>

          {/* Permuta */}
          <div className="flex flex-col gap-3 bg-s2/50 border border-line rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-t1">Aceita Permuta</p>
                <p className="text-xs text-t3 mt-0.5">Permite troca por imóvel ou carro como parte do pagamento</p>
              </div>
              <button
                type="button"
                onClick={() => { setAcceptsPermuta(v => !v); if (acceptsPermuta) { setPermutaTypes([]); setPermutaRegions([]) } }}
                className={`relative w-10 h-6 rounded-full transition-colors ${acceptsPermuta ? 'bg-indigo-500' : 'bg-s3/90'}`}
              >
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${acceptsPermuta ? 'left-5' : 'left-1'}`} />
              </button>
            </div>

            {acceptsPermuta && (
              <>
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-medium text-t3 uppercase tracking-wider">Tipos aceitos</p>
                  <div className="flex gap-2">
                    {(['imovel', 'carro'] as const).map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setPermutaTypes(prev =>
                          prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
                        )}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all ${
                          permutaTypes.includes(t)
                            ? 'bg-brand-tint border-brand/40 text-brand-text'
                            : 'bg-s3/50 border-line text-t3 hover:text-t2'
                        }`}
                      >
                        {t === 'imovel' ? '🏠 Imóvel' : '🚗 Carro'}
                      </button>
                    ))}
                  </div>
                </div>

                {permutaTypes.includes('imovel') && (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-medium text-t3 uppercase tracking-wider">Regiões aceitas para imóvel</p>
                    <div className="flex flex-wrap gap-1.5">
                      {['Balneário Camboriú','Camboriú','Itajaí','Navegantes','Itapema','Porto Belo','Florianópolis','Blumenau','São José','Palhoça','Biguaçu'].map(region => (
                        <button
                          key={region}
                          type="button"
                          onClick={() => setPermutaRegions(prev =>
                            prev.includes(region) ? prev.filter(r => r !== region) : [...prev, region]
                          )}
                          className={`px-2.5 py-1 rounded-full text-xs border transition-all ${
                            permutaRegions.includes(region)
                              ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                              : 'bg-s3/50 border-line text-t3 hover:text-t2 hover:border-line-strong'
                          }`}
                        >
                          {region}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button type="submit" className="flex-1">{isEditing ? 'Salvar alterações' : 'Salvar imóvel'}</Button>
          </div>
        </form>
      </Modal>

      {/* key garante que o ContactForm remonta do zero a cada abertura */}
      <ContactForm
        key={newContactOpen ? 'contact-open' : 'contact-closed'}
        isOpen={newContactOpen}
        onClose={() => setNewContactOpen(false)}
        defaultTags={['owner']}
        onCreated={(c) => { setOwnerId(c.id); setOwnerSearch(c.name) }}
      />
    </>
  )
}
