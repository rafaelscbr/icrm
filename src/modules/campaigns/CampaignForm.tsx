import { useState, useEffect, FormEvent } from 'react'
import { MessageSquarePlus, Info, Plus, Trash2, GripVertical, DollarSign } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Select'
import { Campaign, CampaignStatus } from '../../types'
import { useCampaignsStore } from '../../store/useCampaignsStore'
import { STATUS_CONFIG } from './config'
import toast from 'react-hot-toast'

function parseBRL(raw: string): number {
  return parseFloat(raw.replace(/\./g, '').replace(',', '.')) || 0
}

function formatBRL(value: number): string {
  if (!value) return ''
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

interface CampaignFormProps {
  isOpen:   boolean
  onClose:  () => void
  campaign?: Campaign
}

const PLACEHOLDER = 'Olá, {nome}! Tudo bem? Sou corretor de imóveis e gostaria de...'
const HINT = (
  <div className="flex items-start gap-2 bg-indigo-500/8 border border-indigo-500/20 rounded-xl px-3 py-2.5">
    <Info size={13} className="text-indigo-400 flex-shrink-0 mt-0.5" />
    <p className="text-xs text-indigo-300/80">
      Use <code className="bg-white/10 px-1 rounded text-indigo-300">{'{nome}'}</code> para inserir o nome do lead automaticamente.
      Ter múltiplas mensagens diferentes ajuda a evitar bloqueio no WhatsApp.
    </p>
  </div>
)

export function CampaignForm({ isOpen, onClose, campaign }: CampaignFormProps) {
  const { add, update } = useCampaignsStore()
  const isEditing = Boolean(campaign)

  const [name,        setName]        = useState(campaign?.name    ?? '')
  const [message,     setMessage]     = useState(campaign?.message ?? '')
  const [messages,    setMessages]    = useState<string[]>(campaign?.messages ?? [])
  const [status,      setStatus]      = useState<CampaignStatus>(campaign?.status ?? 'active')
  const [ticketRaw,   setTicketRaw]   = useState(campaign?.averageTicket ? formatBRL(campaign.averageTicket) : '')
  const [errors,      setErrors]      = useState<Record<string, string>>({})

  useEffect(() => {
    if (!isOpen) return
    setName(campaign?.name ?? '')
    setMessage(campaign?.message ?? '')
    setMessages(campaign?.messages ?? [])
    setStatus(campaign?.status ?? 'active')
    setTicketRaw(campaign?.averageTicket ? formatBRL(campaign.averageTicket) : '')
    setErrors({})
  }, [campaign, isOpen])

  function addExtraMessage() {
    setMessages(m => [...m, ''])
  }

  function updateMessage(idx: number, val: string) {
    setMessages(m => m.map((v, i) => i === idx ? val : v))
  }

  function removeMessage(idx: number) {
    setMessages(m => m.filter((_, i) => i !== idx))
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!name.trim())    e.name    = 'Nome é obrigatório'
    if (!message.trim()) e.message = 'Mensagem principal é obrigatória'
    setErrors(e)
    return !Object.keys(e).length
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!validate()) return
    const cleanMessages = messages.filter(m => m.trim())
    const ticket = parseBRL(ticketRaw)
    if (isEditing && campaign) {
      update(campaign.id, {
        name: name.trim(),
        message: message.trim(),
        messages: cleanMessages.length > 0 ? cleanMessages : undefined,
        status,
        averageTicket: ticket > 0 ? ticket : undefined,
      })
      toast.success('Campanha atualizada')
    } else {
      add({
        name: name.trim(),
        message: message.trim(),
        messages: cleanMessages.length > 0 ? cleanMessages : undefined,
        status: 'active',
        averageTicket: ticket > 0 ? ticket : undefined,
      })
      toast.success('Campanha criada!')
    }
    onClose()
  }

  const allCount = 1 + messages.filter(m => m.trim()).length

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

        {/* Ticket médio */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            Ticket Médio <span className="text-slate-600 normal-case font-normal">(opcional)</span>
          </label>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-slate-500 pointer-events-none">
              <DollarSign size={13} />
              <span className="text-xs">R$</span>
            </div>
            <input
              type="text"
              inputMode="numeric"
              value={ticketRaw}
              onChange={e => setTicketRaw(e.target.value.replace(/[^\d.,]/g, ''))}
              onBlur={() => {
                const n = parseBRL(ticketRaw)
                setTicketRaw(n > 0 ? formatBRL(n) : '')
              }}
              placeholder="Ex: 500.000"
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
          </div>
          <p className="text-[11px] text-slate-600">Usado para calcular o VGV esperado na aba de Previsão</p>
        </div>

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

        {/* Mensagem principal */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Mensagem 1 <span className="text-indigo-400 normal-case font-normal">(principal)</span>
            </label>
            <span className="text-[10px] text-slate-600">{allCount} template{allCount !== 1 ? 's' : ''} no total</span>
          </div>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={4}
            placeholder={PLACEHOLDER}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
          />
          {errors.message && <p className="text-xs text-red-400">{errors.message}</p>}
        </div>

        {/* Mensagens extras */}
        {messages.map((msg, idx) => (
          <div key={idx} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <GripVertical size={12} className="text-slate-600" />
                Mensagem {idx + 2}
              </label>
              <button
                type="button"
                onClick={() => removeMessage(idx)}
                className="text-slate-600 hover:text-red-400 transition-colors cursor-pointer p-1"
              >
                <Trash2 size={12} />
              </button>
            </div>
            <textarea
              value={msg}
              onChange={e => updateMessage(idx, e.target.value)}
              rows={4}
              placeholder={PLACEHOLDER}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
            />
          </div>
        ))}

        {/* Botão adicionar mensagem */}
        <button
          type="button"
          onClick={addExtraMessage}
          className="flex items-center gap-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer py-1"
        >
          <Plus size={13} />
          Adicionar mensagem alternativa
        </button>

        {HINT}

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
