import { useState, useRef, FormEvent } from 'react'
import { Camera } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
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

  const [name, setName] = useState(contact?.name ?? '')
  const [phone, setPhone] = useState(contact?.phone ?? '')
  const [company, setCompany] = useState(contact?.company ?? '')
  const [birthdate, setBirthdate] = useState(contact?.birthdate ?? '')
  const [photoUrl, setPhotoUrl] = useState(contact?.photoUrl ?? '')
  const [tags, setTags] = useState<ContactTag[]>(contact?.tags ?? defaultTags)
  const [isMarried, setIsMarried] = useState(contact?.isMarried ?? false)
  const [spouseName, setSpouseName] = useState(contact?.spouseName ?? '')
  const [hasChildren, setHasChildren] = useState(contact?.hasChildren ?? false)
  const [childrenNames, setChildrenNames] = useState(contact?.childrenNames ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})

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

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!validate()) return

    const data = {
      name: name.trim(),
      phone: phone.trim(),
      company: company.trim() || undefined,
      birthdate: birthdate || undefined,
      photoUrl: photoUrl || undefined,
      tags,
      isMarried,
      spouseName: isMarried ? spouseName.trim() : undefined,
      hasChildren,
      childrenNames: hasChildren ? childrenNames.trim() : undefined,
    }

    if (isEditing && contact) {
      update(contact.id, data)
      toast.success('Contato atualizado')
    } else {
      const created = add(data)
      toast.success('Contato salvo')
      onCreated?.(created)
    }
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? 'Editar Contato' : 'Novo Contato'}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Photo */}
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden hover:bg-white/10 transition-colors cursor-pointer"
          >
            {photoUrl ? (
              <img src={photoUrl} alt="foto" className="w-full h-full object-cover" />
            ) : (
              <Camera size={20} className="text-slate-500" />
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
          <button type="button" onClick={() => fileRef.current?.click()} className="text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer">
            {photoUrl ? 'Alterar foto' : 'Adicionar foto'}
          </button>
        </div>

        {/* Name + Phone */}
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Nome"
            required
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            error={errors.name}
            placeholder="Ana Lima"
          />
          <Input
            label="Telefone"
            required
            value={phone}
            onChange={e => setPhone(e.target.value)}
            error={errors.phone}
            placeholder="(11) 99000-0000"
          />
        </div>

        {/* Company + Birthdate */}
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Empresa"
            value={company}
            onChange={e => setCompany(e.target.value)}
            placeholder="Construtora ABC"
          />
          <Input
            label="Data de nascimento"
            type="date"
            value={birthdate}
            onChange={e => setBirthdate(e.target.value)}
          />
        </div>

        {/* Tags */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Tags</p>
          <div className="flex gap-2">
            {TAG_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleTag(opt.value)}
                className={`
                  px-3 py-1.5 rounded-xl text-xs font-medium border transition-all duration-150 cursor-pointer
                  ${tags.includes(opt.value)
                    ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                    : 'bg-white/5 border-white/10 text-slate-500 hover:text-slate-300 hover:border-white/20'
                  }
                `}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-white/8" />

        {/* Married */}
        <div className="flex flex-col gap-3">
          <Toggle label="Casado(a)?" checked={isMarried} onChange={setIsMarried} />
          {isMarried && (
            <Input
              label="Nome do(a) cônjuge"
              value={spouseName}
              onChange={e => setSpouseName(e.target.value)}
              placeholder="Maria Lima"
            />
          )}
        </div>

        {/* Children */}
        <div className="flex flex-col gap-3">
          <Toggle label="Tem filhos?" checked={hasChildren} onChange={setHasChildren} />
          {hasChildren && (
            <Input
              label="Nome dos filhos"
              value={childrenNames}
              onChange={e => setChildrenNames(e.target.value)}
              placeholder="Pedro, Maria"
            />
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" className="flex-1">
            {isEditing ? 'Salvar alterações' : 'Salvar contato'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
