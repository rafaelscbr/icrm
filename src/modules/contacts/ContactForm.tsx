import { useState, useRef, FormEvent } from 'react'
import { Camera } from 'lucide-react'
import { SidePanel } from '../../components/ui/SidePanel'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { Toggle } from '../../components/ui/Toggle'
import { Contact, ContactTag } from '../../types'
import { useContactsStore } from '../../store/useContactsStore'
import toast from 'react-hot-toast'

interface ContactFormProps {
  isOpen: boolean
  onClose: () => void
  contact?: Contact
  defaultTags?: ContactTag[]
  onCreated?: (contact: Contact) => void
}

const TAG_OPTIONS: { value: ContactTag; label: string }[] = [
  { value: 'owner', label: 'Proprietário' },
  { value: 'investor', label: 'Investidor' },
  { value: 'buyer', label: 'Já comprou' },
]

export function ContactForm({ isOpen, onClose, contact, defaultTags = [], onCreated }: ContactFormProps) {
  const { add, update } = useContactsStore()
  const fileRef = useRef<HTMLInputElement>(null)

  const [name, setName]           = useState(contact?.name ?? '')
  const [phone, setPhone]         = useState(contact?.phone ?? '')
  const [company, setCompany]     = useState(contact?.company ?? '')
  const [birthdate, setBirthdate] = useState(contact?.birthdate ?? '')
  const [photoUrl, setPhotoUrl]   = useState(contact?.photoUrl ?? '')
  const [tags, setTags]           = useState<ContactTag[]>(contact?.tags ?? defaultTags)
  const [isMarried, setIsMarried] = useState(contact?.isMarried ?? false)
  const [spouseName, setSpouseName]       = useState(contact?.spouseName ?? '')
  const [hasChildren, setHasChildren]     = useState(contact?.hasChildren ?? false)
  const [childrenNames, setChildrenNames] = useState(contact?.childrenNames ?? '')
  const [errors, setErrors]       = useState<Record<string, string>>({})

  // Toggle "Informações do lead" — ativo se estiver editando e já tiver empresa ou aniversário
  const [showLeadInfo, setShowLeadInfo] = useState(
    Boolean(contact?.company || contact?.birthdate)
  )

  const isEditing = Boolean(contact)

  function toggleTag(tag: ContactTag) {
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setPhotoUrl(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  function validate() {
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = 'Nome é obrigatório'
    if (!phone.trim()) errs.phone = 'Telefone é obrigatório'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const [salvando, setSalvando] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (salvando || !validate()) return

    const data = {
      name:     name.trim(),
      phone:    phone.trim(),
      company:  showLeadInfo ? (company.trim() || undefined) : undefined,
      birthdate: showLeadInfo ? (birthdate || undefined) : undefined,
      photoUrl: photoUrl || undefined,
      tags,
      isMarried,
      spouseName:    isMarried ? spouseName.trim() : undefined,
      hasChildren,
      childrenNames: hasChildren ? childrenNames.trim() : undefined,
      permutaItems:  contact?.permutaItems ?? [],
    }

    // Banco primeiro: o "salvo" só aparece depois que o banco confirmou. Se
    // falhar, o aviso de erro já saiu da camada db e o painel fica aberto com
    // tudo que foi digitado.
    setSalvando(true)
    try {
      if (isEditing && contact) {
        await update(contact.id, data)
        toast.success('Contato atualizado')
      } else {
        const created = await add(data)
        toast.success('Contato salvo')
        onCreated?.(created)
      }
      onClose()
    } catch { /* erro já avisado */ } finally {
      setSalvando(false)
    }
  }

  // Algo digitado que ainda não foi salvo — fechar por gesto pergunta antes.
  const sujo = isEditing
    ? name !== (contact?.name ?? '') || phone !== (contact?.phone ?? '')
    : Boolean(name.trim() || phone.trim() || company.trim() || birthdate)

  const temDetalhes = showLeadInfo || tags.length > 0 || isMarried || hasChildren
  const [maisDetalhes, setMaisDetalhes] = useState(temDetalhes)

  // v9 "folha limpa": o nome é o título do painel, telefone logo abaixo, e o
  // resto (empresa, aniversário, etiquetas, família) fica atrás de "Mais
  // detalhes" — 90% dos contatos são criados só com nome e telefone, e o
  // formulário antigo mostrava onze controles para isso.
  return (
    <SidePanel
      size="md"
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Editar contato' : 'Novo contato'}
      confirmarSaida={sujo && !salvando}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="form-contato" carregando={salvando}>
            {isEditing ? 'Salvar alterações' : 'Salvar contato'}
          </Button>
        </div>
      }
    >
      <form id="form-contato" onSubmit={handleSubmit} className="flex flex-col gap-6">

        {/* Identidade: foto pequena ao lado do nome grande */}
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label={photoUrl ? 'Alterar foto' : 'Adicionar foto'}
            title={photoUrl ? 'Alterar foto' : 'Adicionar foto'}
            className="w-12 h-12 rounded-full bg-s2 flex items-center justify-center overflow-hidden hover:bg-s3 transition-colors cursor-pointer flex-shrink-0"
          >
            {photoUrl
              ? <img src={photoUrl} alt="" className="w-full h-full object-cover" />
              : <Camera size={17} className="text-t4" aria-hidden />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
          <div className="flex-1 min-w-0">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Nome do contato"
              aria-label="Nome do contato"
              aria-invalid={errors.name ? true : undefined}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- o painel abre para criar: o cursor já vai para o nome
              autoFocus={!isEditing}
              className="campo-titulo campo-livre"
            />
            {errors.name && <p className="text-xs text-error mt-0.5" role="alert">{errors.name}</p>}
          </div>
        </div>

        <Input
          label="Telefone"
          required
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          error={errors.phone}
          placeholder="(47) 99000-0000"
        />

        {!maisDetalhes ? (
          <button
            type="button"
            onClick={() => setMaisDetalhes(true)}
            className="manter-borda self-start text-[13px] font-medium text-t3 hover:text-t1 cursor-pointer"
          >
            + Mais detalhes <span className="text-t4">· empresa, aniversário, etiquetas, família</span>
          </button>
        ) : (
          <div className="flex flex-col gap-5 animate-in fade-in duration-150">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Empresa"
                value={company}
                onChange={e => { setCompany(e.target.value); setShowLeadInfo(true) }}
                placeholder="Construtora ABC"
              />
              <Input
                label="Aniversário"
                type="date"
                value={birthdate}
                onChange={e => { setBirthdate(e.target.value); setShowLeadInfo(true) }}
                max={new Date().toISOString().split('T')[0]}
              />
            </div>

            <div className="flex flex-col gap-2">
              <span className="rotulo-campo">Etiquetas</span>
              <div className="flex flex-wrap gap-1.5">
                {TAG_OPTIONS.map(opt => {
                  const ativo = tags.includes(opt.value)
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleTag(opt.value)}
                      aria-pressed={ativo}
                      className={`px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors cursor-pointer
                        ${ativo ? 'bg-brand-fill text-brand-fill-text' : 'bg-s2 text-t2 hover:bg-s3'}`}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <span className="rotulo-campo">Família</span>
              <Toggle label="Casado(a)" checked={isMarried} onChange={setIsMarried} />
              {isMarried && (
                <Input
                  label="Cônjuge"
                  value={spouseName}
                  onChange={e => setSpouseName(e.target.value)}
                  placeholder="Maria Lima"
                />
              )}
              <Toggle label="Tem filhos" checked={hasChildren} onChange={setHasChildren} />
              {hasChildren && (
                <Input
                  label="Filhos"
                  value={childrenNames}
                  onChange={e => setChildrenNames(e.target.value)}
                  placeholder="Pedro, Maria"
                />
              )}
            </div>
          </div>
        )}
      </form>
    </SidePanel>
  )
}
