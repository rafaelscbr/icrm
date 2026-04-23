import { useState, useEffect, FormEvent } from 'react'
import { UserPlus } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { CampaignLead } from '../../types'
import { useCampaignLeadsStore } from '../../store/useCampaignLeadsStore'
import { useContactsStore } from '../../store/useContactsStore'
import toast from 'react-hot-toast'

interface LeadEditModalProps {
  isOpen:  boolean
  onClose: () => void
  lead?:   CampaignLead
}

export function LeadEditModal({ isOpen, onClose, lead }: LeadEditModalProps) {
  const { update } = useCampaignLeadsStore()
  const { contacts, add: addContact } = useContactsStore()

  const [name,   setName]   = useState(lead?.name  ?? '')
  const [phone,  setPhone]  = useState(lead?.phone  ?? '')
  const [email,  setEmail]  = useState(lead?.email  ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!isOpen) return
    setName(lead?.name  ?? '')
    setPhone(lead?.phone ?? '')
    setEmail(lead?.email ?? '')
    setErrors({})
  }, [lead, isOpen])

  function validate() {
    const e: Record<string, string> = {}
    if (!name.trim())  e.name  = 'Nome é obrigatório'
    if (!phone.trim()) e.phone = 'Telefone é obrigatório'
    setErrors(e)
    return !Object.keys(e).length
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!validate() || !lead) return
    update(lead.id, { name: name.trim(), phone: phone.trim(), email: email.trim() || undefined })
    toast.success('Lead atualizado')
    onClose()
  }

  function handleConvertToContact() {
    if (!lead) return
    const digits = phone.replace(/\D/g, '')
    const exists = contacts.some(c => c.phone.replace(/\D/g, '') === digits)
    if (exists) { toast.error('Já existe um contato com esse telefone.'); return }
    addContact({ name: name.trim() || lead.name, phone: phone.trim() || lead.phone, tags: [], hasChildren: false, isMarried: false })
    toast.success(`${name || lead.name} adicionado aos contatos!`)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Editar Lead" size="sm">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input label="Nome" required autoFocus value={name} onChange={e => setName(e.target.value)} error={errors.name} />
        <Input label="Telefone" required value={phone} onChange={e => setPhone(e.target.value)} error={errors.phone} />
        <Input label="E-mail" type="email" value={email} onChange={e => setEmail(e.target.value)} />

        {/* Converter em contato */}
        <button
          type="button"
          onClick={handleConvertToContact}
          className="flex items-center gap-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer py-1"
        >
          <UserPlus size={13} />
          Converter em contato
        </button>

        <div className="flex gap-3 pt-1 border-t border-white/8">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button type="submit" className="flex-1">Salvar</Button>
        </div>
      </form>
    </Modal>
  )
}
