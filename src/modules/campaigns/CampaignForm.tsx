import { useState, useEffect, FormEvent } from 'react'
import { MessageSquarePlus, Info } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Select'
import { Campaign, CampaignStatus } from '../../types'
import { useCampaignsStore } from '../../store/useCampaignsStore'
import { STATUS_CONFIG } from './config'
import toast from 'react-hot-toast'

interface CampaignFormProps {
  isOpen:   boolean
  onClose:  () => void
  campaign?: Campaign
}

export function CampaignForm({ isOpen, onClose, campaign }: CampaignFormProps) {
  const { add, update } = useCampaignsStore()
  const isEditing = Boolean(campaign)

  const [name,    setName]    = useState(campaign?.name    ?? '')
  const [message, setMessage] = useState(campaign?.message ?? '')
  const [status,  setStatus]  = useState<CampaignStatus>(campaign?.status ?? 'active')
  const [errors,  setErrors]  = useState<Record<string, string>>({})

  useEffect(() => {
    if (!isOpen) return
    setName(campaign?.name ?? '')
    setMessage(campaign?.message ?? '')
    setStatus(campaign?.status ?? 'active')
    setErrors({})
  }, [campaign, isOpen])

  function validate() {
    const e: Record<string, string> = {}
    if (!name.trim())    e.name    = 'Nome é obrigatório'
    if (!message.trim()) e.message = 'Mensagem é obrigatória'
    setErrors(e)
    return !Object.keys(e).length
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!validate()) return
    if (isEditing && campaign) {
      update(campaign.id, { name: name.trim(), message: message.trim(), status })
      toast.success('Campanha atualizada')
    } else {
      add({ name: name.trim(), message: message.trim(), status: 'active' })
      toast.success('Campanha criada!')
    }
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? 'Editar Campanha' : 'Nova Campanha'} size="md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">

        <Input
          label="Nome da campanha"
          required
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          error={errors.name}
          placeholder="Ex: Proprietários Pinheiros - Abr/2026"
        />

        {isEditing && (
          <Select
            label="Status"
            value={status}
            onChange={e => setStatus(e.target.value as CampaignStatus)}
          >
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </Select>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            Mensagem inicial padrão
          </label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={5}
            placeholder="Olá, {nome}! Tudo bem? Sou corretor de imóveis e gostaria de..."
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
          />
          {errors.message && <p className="text-xs text-red-400">{errors.message}</p>}
          <div className="flex items-start gap-2 bg-indigo-500/8 border border-indigo-500/20 rounded-xl px-3 py-2.5 mt-1">
            <Info size={13} className="text-indigo-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-indigo-300/80">
              Use <code className="bg-white/10 px-1 rounded text-indigo-300">{'{nome}'}</code> para inserir o nome do lead automaticamente na mensagem.
            </p>
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button type="submit" className="flex-1 flex items-center gap-2 justify-center">
            <MessageSquarePlus size={14} />
            {isEditing ? 'Salvar alterações' : 'Criar campanha'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
