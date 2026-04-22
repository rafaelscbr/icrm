import { useState, useEffect, FormEvent } from 'react'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { CampaignLead } from '../../types'
import { useCampaignLeadsStore } from '../../store/useCampaignLeadsStore'
import toast from 'react-hot-toast'

interface LeadEditModalProps {
  isOpen:  boolean
  onClose: () => void
  lead?:   CampaignLead
}

export function LeadEditModal({ isOpen, onClose, lead }: LeadEditModalProps) {
  const { update } = useCampaignLeadsStore()

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

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Editar Lead" size="sm">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input label="Nome" required autoFocus value={name} onChange={e => setName(e.target.value)} error={errors.name} />
        <Input label="Telefone" required value={phone} onChange={e => setPhone(e.target.value)} error={errors.phone} />
        <Input label="E-mail" type="email" value={email} onChange={e => setEmail(e.target.value)} />
        <div className="flex gap-3 pt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button type="submit" className="flex-1">Salvar</Button>
        </div>
      </form>
    </Modal>
  )
}
