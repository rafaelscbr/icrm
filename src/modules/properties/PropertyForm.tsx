import { useState, useRef, useEffect, FormEvent } from 'react'
import { ImagePlus, X, Plus } from 'lucide-react'
import { SidePanel } from '../../components/ui/SidePanel'
import { Button } from '../../components/ui/Button'
import { Segmentado } from '../../components/shared/visual'
import { Property, PropertyStatus, PropertyType, PropertyKind } from '../../types'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { useContactsStore } from '../../store/useContactsStore'
import { useContactSearch } from '../../hooks/useContactSearch'
import { ContactForm } from '../contacts/ContactForm'
import { compressImageFile, makeThumbnail } from '../../lib/image'
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
  { value: 'apartment_duplex',   label: 'Apto duplex'        },
  { value: 'penthouse_duplex',   label: 'Cobertura duplex'   },
  { value: 'house',              label: 'Casa'               },
  { value: 'commercial',         label: 'Comercial'          },
  { value: 'land',               label: 'Terreno'            },
]

export function PropertyForm({ isOpen, onClose, property }: PropertyFormProps) {
  const { add, update, loadImages } = usePropertiesStore()
  const { getById, mergeLocal } = useContactsStore()
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
  // A listagem não baixa as fotos (só thumbnail) — na edição elas são carregadas
  // sob demanda. Enquanto não chegam, a seção de fotos fica bloqueada e o submit
  // não toca em images/thumbnail (evita sobrescrever as fotos existentes).
  const [imagesLoaded,    setImagesLoaded]    = useState(!property || property.images !== undefined)
  const [ownerSearch,     setOwnerSearch]     = useState(property ? (getById(property.ownerId ?? '')?.name ?? '') : '')
  const [showOwnerDropdown, setShowOwnerDropdown] = useState(false)
  const [newContactOpen,  setNewContactOpen]  = useState(false)
  const [errors,          setErrors]          = useState<Record<string, string>>({})
  // Permuta
  const [acceptsPermuta,  setAcceptsPermuta]  = useState(property?.acceptsPermuta ?? false)
  const [permutaTypes,    setPermutaTypes]    = useState<Array<'imovel' | 'carro'>>(property?.permutaTypes ?? [])
  const [permutaRegions,  setPermutaRegions]  = useState<string[]>(property?.permutaRegions ?? [])
  const [salvando,        setSalvando]        = useState(false)
  const [detalhes,        setDetalhes]        = useState(false)

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
    if (property && property.images === undefined) {
      setImagesLoaded(false)
      loadImages(property.id)
        .then(imgs => { setImages(imgs); setImagesLoaded(true) })
        .catch(err => {
          console.error('[PropertyForm] loadImages:', err)
          toast.error('Não foi possível carregar as fotos do imóvel. A seção de fotos ficou bloqueada para não sobrescrever as existentes.')
        })
    } else {
      setImagesLoaded(true)
    }
    setOwnerSearch(property ? (getById(property.ownerId ?? '')?.name ?? '') : '')
    setAcceptsPermuta(property?.acceptsPermuta ?? false)
    setPermutaTypes(property?.permutaTypes ?? [])
    setPermutaRegions(property?.permutaRegions ?? [])
    setErrors({})
    setSalvando(false)
    setDetalhes(Boolean(property && (property.address || property.complement || property.unit
      || property.condoFee || property.notes || property.acceptsPermuta)))
  }, [isOpen, property])  // eslint-disable-line react-hooks/exhaustive-deps -- campos semeados na abertura; incluir as fontes reescreveria o que está sendo digitado

  // Busca no servidor (debounce) — ver useContactSearch
  const { resultados: contactResults } = useContactSearch(ownerSearch, 8)

  const filteredContacts = ownerSearch.trim()
    ? contactResults
    : []

  function handleImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    // Comprime antes de guardar (máx. 1600px JPEG) — as fotos são persistidas
    // em base64 no banco e cada download conta como egress
    files.forEach(async file => {
      try {
        const dataUrl = await compressImageFile(file)
        setImages(prev => [...prev, dataUrl])
      } catch (err) {
        console.error('[PropertyForm] compressão de imagem:', err)
        toast.error(`Não foi possível processar a foto ${file.name}`)
      }
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!validate() || salvando) return

    const resolvedName = kind === 'off_plan' ? developmentName.trim() : name.trim()

    // Fotos: só entram no payload se foram carregadas nesta edição — caso
    // contrário a chave é omitida e o banco mantém as fotos existentes.
    let imageFields: { images?: string[]; thumbnail?: string } = {}
    if (imagesLoaded) {
      let thumbnail: string | undefined
      if (images[0]) {
        try {
          thumbnail = await makeThumbnail(images[0])
        } catch (err) {
          console.error('[PropertyForm] makeThumbnail:', err)
          toast.error('Não foi possível gerar a miniatura da foto. Tente remover e adicionar a foto novamente.')
          return
        }
      }
      imageFields = { images, thumbnail }
    }

    const data = {
      ...imageFields,
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
      acceptsPermuta,
      permutaTypes:    acceptsPermuta ? permutaTypes : [],
      permutaRegions:  acceptsPermuta && permutaTypes.includes('imovel') ? permutaRegions : [],
    }

    // Banco primeiro: "cadastrado" só depois do upsert. Se falhar, o upsert já
    // mostrou o erro e o painel continua aberto com tudo o que foi digitado.
    setSalvando(true)
    try {
      if (isEditing && property) {
        await update(property.id, data)
        toast.success('Imóvel atualizado')
      } else {
        await add(data)
        toast.success('Imóvel cadastrado')
      }
      onClose()
    } catch {
      // erro já exibido pela camada do banco
    } finally {
      setSalvando(false)
    }
  }

  const ehApto = ['apartment', 'apartment_duplex', 'penthouse_duplex'].includes(type)
  const sujo = !isEditing && Boolean(name.trim() || developmentName.trim() || value || neighborhood.trim()
    || ownerId || images.length || notes.trim())

  const pilula = (ativo: boolean) =>
    `px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors cursor-pointer ${
      ativo ? 'bg-brand-fill text-brand-fill-text' : 'bg-s2 text-t2 hover:bg-s3'}`

  // v10 "folha limpa" (01/11/2026): o nome é o título e o valor vem logo
  // abaixo, como em Nova venda. Tipo e situação viram pílulas; endereço,
  // condomínio, observações e permuta ficam em "Mais detalhes". Antes eram
  // 14 campos em caixa, com rótulo em maiúsculas, todos abertos de uma vez.
  return (
    <>
      <SidePanel
        isOpen={isOpen}
        onClose={onClose}
        title={isEditing ? 'Editar imóvel' : 'Novo imóvel'}
        size="md"
        confirmarSaida={sujo && !salvando}
        headerActions={
          <Segmentado
            rotulo="Pronto ou na planta"
            valor={kind}
            onChange={v => setKind(v)}
            opcoes={[{ value: 'ready' as PropertyKind, label: 'Pronto' }, { value: 'off_plan' as PropertyKind, label: 'Na planta' }]}
          />
        }
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" form="form-imovel" carregando={salvando}>
              {isEditing ? 'Salvar alterações' : 'Cadastrar imóvel'}
            </Button>
          </div>
        }
      >
        <form id="form-imovel" onSubmit={handleSubmit} className="flex flex-col gap-6">

          {/* Nome — o título — e o valor logo abaixo */}
          <div>
            {kind === 'ready' ? (
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Nome do imóvel"
                aria-label="Nome do imóvel"
                aria-invalid={errors.name ? true : undefined}
                // eslint-disable-next-line jsx-a11y/no-autofocus -- o painel abre para cadastrar: o cursor vai para o nome
                autoFocus={!isEditing}
                className="campo-titulo campo-livre"
              />
            ) : (
              <input
                value={developmentName}
                onChange={e => setDevelopmentName(e.target.value)}
                placeholder="Nome do empreendimento"
                aria-label="Nome do empreendimento"
                aria-invalid={errors.developmentName ? true : undefined}
                // eslint-disable-next-line jsx-a11y/no-autofocus -- idem
                autoFocus={!isEditing}
                className="campo-titulo campo-livre"
              />
            )}
            {(errors.name || errors.developmentName) && (
              <p className="text-xs text-error mt-0.5" role="alert">{errors.name || errors.developmentName}</p>
            )}

            <div className="flex items-baseline gap-2 mt-2">
              <span className="font-display text-[18px] font-bold text-t4 select-none">R$</span>
              <input
                inputMode="numeric"
                value={fmtInput(value)}
                onChange={e => setValue(e.target.value.replace(/\D/g, ''))}
                placeholder={kind === 'off_plan' ? 'Ticket médio' : 'Valor'}
                aria-label={kind === 'off_plan' ? 'Ticket médio' : 'Valor do imóvel'}
                aria-invalid={errors.value ? true : undefined}
                className="campo-livre flex-1 min-w-0 bg-transparent font-display text-[18px] font-bold text-t1
                           placeholder:text-t5 tabular-nums focus:outline-none"
              />
            </div>
            {errors.value && <p className="text-xs text-error mt-0.5" role="alert">{errors.value}</p>}
          </div>

          {/* Situação do preço */}
          <div className="flex flex-col gap-2">
            <span className="rotulo-campo">Preço</span>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Situação do preço">
              {STATUS_OPTIONS.map(o => (
                <button key={o.value} type="button" role="radio" aria-checked={status === o.value}
                  onClick={() => setStatus(o.value)} className={pilula(status === o.value)}>{o.label}</button>
              ))}
            </div>
          </div>

          {/* Tipo */}
          <div className="flex flex-col gap-2">
            <span className="rotulo-campo">Tipo</span>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo de imóvel">
              {TYPE_OPTIONS.map(o => (
                <button key={o.value} type="button" role="radio" aria-checked={type === o.value}
                  onClick={() => setType(o.value)} className={pilula(type === o.value)}>{o.label}</button>
              ))}
            </div>
          </div>

          {/* Onde */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="imovel-bairro" className="rotulo-campo">Bairro ou região <span className="text-error">*</span></label>
              <input id="imovel-bairro" value={neighborhood} onChange={e => setNeighborhood(e.target.value)}
                placeholder="Centro" aria-invalid={errors.neighborhood ? true : undefined}
                className="w-full px-3.5 py-2.5 min-h-[44px]" />
              {errors.neighborhood && <p className="text-xs text-error">{errors.neighborhood}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="imovel-cidade" className="rotulo-campo">Cidade</label>
              <input id="imovel-cidade" value={city} onChange={e => setCity(e.target.value)}
                placeholder="Balneário Camboriú" className="w-full px-3.5 py-2.5 min-h-[44px]" />
            </div>
          </div>

          {/* Dormitórios · Suítes · m² */}
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="imovel-dorm" className="rotulo-campo">Dormitórios</label>
              <input id="imovel-dorm" type="number" min="0" max="20" inputMode="numeric"
                value={bedrooms} onChange={e => setBedrooms(e.target.value)} placeholder="0"
                className="w-full px-3.5 py-2.5 min-h-[44px] tabular-nums" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="imovel-suites" className="rotulo-campo">Suítes</label>
              <input id="imovel-suites" type="number" min="0" max="20" inputMode="numeric"
                value={suites} onChange={e => setSuites(e.target.value)} placeholder="0"
                className="w-full px-3.5 py-2.5 min-h-[44px] tabular-nums" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="imovel-area" className="rotulo-campo">Área</label>
              <div className="relative flex items-center">
                <input id="imovel-area" type="text" inputMode="decimal"
                  value={areaSqm} onChange={e => setAreaSqm(e.target.value.replace(/[^0-9,]/g, ''))}
                  placeholder="85" className="w-full pl-3.5 pr-10 py-2.5 min-h-[44px] tabular-nums" />
                <span className="absolute right-3.5 text-[13px] text-t4 pointer-events-none">m²</span>
              </div>
            </div>
          </div>

          {/* Proprietário — só pronto */}
          {kind === 'ready' && (
            <div className="flex flex-col gap-1.5 relative">
              <label htmlFor="imovel-dono" className="rotulo-campo">Proprietário <span className="text-error">*</span></label>
              <input
                id="imovel-dono"
                value={ownerSearch}
                onChange={e => { setOwnerSearch(e.target.value); setOwnerId(''); setShowOwnerDropdown(true) }}
                onFocus={() => setShowOwnerDropdown(true)}
                onBlur={() => setTimeout(() => setShowOwnerDropdown(false), 150)}
                placeholder="Buscar por nome ou telefone"
                aria-invalid={errors.owner ? true : undefined}
                className="w-full px-3.5 py-2.5 min-h-[44px]"
              />
              {errors.owner && <p className="text-xs text-error">{errors.owner}</p>}
              {showOwnerDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-line rounded-xl shadow-dropdown z-10 overflow-hidden">
                  {filteredContacts.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={() => { mergeLocal([c]); setOwnerId(c.id); setOwnerSearch(c.name); setShowOwnerDropdown(false) }}
                      className="w-full text-left px-4 py-2.5 text-sm text-t2 hover:bg-s2 transition-colors cursor-pointer"
                    >
                      {c.name}
                      {c.company && <span className="text-t4 ml-2 text-xs">{c.company}</span>}
                    </button>
                  ))}
                  <button
                    type="button"
                    onMouseDown={() => { setShowOwnerDropdown(false); setNewContactOpen(true) }}
                    className="w-full text-left px-4 py-2.5 text-[13px] text-t2 hover:bg-s2 flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <Plus size={13} /> Criar novo contato
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Fotos */}
          <div className="flex flex-col gap-2">
            <span className="rotulo-campo">Fotos</span>
            {!imagesLoaded ? (
              <p className="text-[13px] text-t4">Carregando fotos…</p>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {images.map((img, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-[12px] overflow-hidden">
                    <img src={img} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                      aria-label={`Remover foto ${i + 1}`}
                      className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center text-white cursor-pointer"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  aria-label="Adicionar fotos"
                  className="w-16 h-16 rounded-[12px] bg-s2 flex items-center justify-center text-t3 hover:bg-s3 hover:text-t1 transition-colors cursor-pointer"
                >
                  <ImagePlus size={18} strokeWidth={1.8} />
                </button>
                <input ref={fileRef} type="file" multiple accept="image/*" className="hidden" onChange={handleImages} />
              </div>
            )}
          </div>

          {/* Mais detalhes */}
          {detalhes ? (
            <div className="flex flex-col gap-5 animate-in fade-in duration-150">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="imovel-rua" className="rotulo-campo">Endereço</label>
                <input id="imovel-rua" value={address} onChange={e => setAddress(e.target.value)}
                  placeholder="Rua das Flores, 123" className="w-full px-3.5 py-2.5 min-h-[44px]" />
              </div>

              <div className={`grid gap-4 ${ehApto ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="imovel-compl" className="rotulo-campo">Complemento</label>
                  <input id="imovel-compl" value={complement} onChange={e => setComplement(e.target.value)}
                    placeholder="Bloco A, Torre 2…" className="w-full px-3.5 py-2.5 min-h-[44px]" />
                </div>
                {ehApto && (
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="imovel-unidade" className="rotulo-campo">Unidade</label>
                    <input id="imovel-unidade" value={unit} onChange={e => setUnit(e.target.value)}
                      placeholder="Apto 203" className="w-full px-3.5 py-2.5 min-h-[44px]" />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="imovel-condo" className="rotulo-campo">Condomínio</label>
                <div className="relative flex items-center">
                  <span className="absolute left-3.5 text-[13px] text-t4 select-none pointer-events-none">R$</span>
                  <input id="imovel-condo" inputMode="numeric" value={fmtInput(condoFee)}
                    onChange={e => setCondoFee(e.target.value.replace(/\D/g, ''))}
                    placeholder="800" className="w-full pl-10 pr-4 py-2.5 min-h-[44px] tabular-nums" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="imovel-obs" className="rotulo-campo">Observações</label>
                <textarea id="imovel-obs" value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                  placeholder="Diferenciais, condições especiais…"
                  className="w-full px-3.5 py-2.5 resize-none" />
              </div>

              {/* Permuta */}
              <div className="flex flex-col gap-3">
                <label className="flex items-center justify-between gap-4 cursor-pointer">
                  <span>
                    <span className="block text-[14px] font-medium text-t1">Aceita permuta</span>
                    <span className="block text-[12.5px] text-t4">Imóvel ou carro como parte do pagamento</span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={acceptsPermuta}
                    aria-label="Aceita permuta"
                    onClick={() => { setAcceptsPermuta(v => !v); if (acceptsPermuta) { setPermutaTypes([]); setPermutaRegions([]) } }}
                    className={`relative w-10 h-6 rounded-full transition-colors shrink-0 cursor-pointer ${acceptsPermuta ? 'bg-brand-fill' : 'bg-s3'}`}
                  >
                    <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${acceptsPermuta ? 'left-5' : 'left-1'}`} />
                  </button>
                </label>

                {acceptsPermuta && (
                  <div className="flex flex-col gap-3 animate-in fade-in duration-150">
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tipos de permuta aceitos">
                      {(['imovel', 'carro'] as const).map(t => (
                        <button key={t} type="button" aria-pressed={permutaTypes.includes(t)}
                          onClick={() => setPermutaTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
                          className={pilula(permutaTypes.includes(t))}>
                          {t === 'imovel' ? 'Imóvel' : 'Carro'}
                        </button>
                      ))}
                    </div>

                    {permutaTypes.includes('imovel') && (
                      <div className="flex flex-col gap-1.5">
                        <span className="rotulo-campo">Regiões aceitas</span>
                        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Regiões aceitas para permuta">
                          {['Balneário Camboriú','Camboriú','Itajaí','Navegantes','Itapema','Porto Belo','Florianópolis','Blumenau','São José','Palhoça','Biguaçu'].map(region => (
                            <button key={region} type="button" aria-pressed={permutaRegions.includes(region)}
                              onClick={() => setPermutaRegions(prev => prev.includes(region) ? prev.filter(r => r !== region) : [...prev, region])}
                              className={pilula(permutaRegions.includes(region))}>
                              {region}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setDetalhes(true)}
              className="self-start text-[13px] font-medium text-t3 hover:text-t1 cursor-pointer">
              + Mais detalhes
              <span className="text-t4 font-normal"> · endereço, condomínio, observações, permuta</span>
            </button>
          )}
        </form>
      </SidePanel>

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
