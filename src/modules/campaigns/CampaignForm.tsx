import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { Plus, Trash2, Check } from 'lucide-react'
import { SidePanel } from '../../components/ui/SidePanel'
import { Button } from '../../components/ui/Button'
import { Campaign } from '../../types'
import { useCampaignsStore } from '../../store/useCampaignsStore'
import { useCampaignLeadsStore } from '../../store/useCampaignLeadsStore'
import { useLeadListsStore } from '../../store/useLeadListsStore'
import { useAuthStore } from '../../store/useAuthStore'
import { db } from '../../lib/db'
import { generateId } from '../../lib/formatters'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

// ─── helpers ──────────────────────────────────────────────────────────────────

function parseBRL(raw: string) {
  return parseFloat(raw.replace(/\./g, '').replace(',', '.')) || 0
}
function formatBRL(v: number) {
  return v ? v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : ''
}

async function importContactsFromLists(
  campaignId: string,
  listIds: string[],
  addBulk: ReturnType<typeof useCampaignLeadsStore.getState>['addBulk'],
) {
  const CHUNK = 500
  const allContactIds: string[] = []
  for (const listId of listIds) {
    const members = await db.leadListMembers.fetchForList(listId)
    allContactIds.push(...members.map(m => m.contactId))
  }
  const uniqueIds = [...new Set(allContactIds)]
  const contacts: { name: string; phone: string }[] = []
  for (let i = 0; i < uniqueIds.length; i += CHUNK) {
    const chunk = uniqueIds.slice(i, i + CHUNK)
    // O erro era ignorado: a campanha nascia com parte dos leads e dizia
    // "importados" como se estivesse completa.
    const { data, error } = await supabase.from('contacts').select('name, phone').in('id', chunk)
    if (error) throw error
    if (data) contacts.push(...(data as { name: string; phone: string }[]))
  }
  return await addBulk(contacts.map(c => ({ campaignId, name: c.name, phone: c.phone })))
}

// ─── Formulário ────────────────────────────────────────────────────────────────

interface Props {
  isOpen:    boolean
  onClose:   () => void
  campaign?: Campaign
}

/**
 * Campanha de disparo — v10 "folha limpa" (01/11/2026).
 *
 * Eram três passos (Identidade · Mensagens · Audiência) com ícone grande e
 * título em cada um, para preencher um nome, um texto e marcar listas. Agora é
 * uma folha só: o nome é o título, a mensagem vem logo abaixo e as listas são
 * uma lista de marcar. Ticket e responsável ficam em "Mais detalhes".
 */
export function CampaignForm({ isOpen, onClose, campaign }: Props) {
  const { add, update }            = useCampaignsStore()
  const { addBulk }                = useCampaignLeadsStore()
  const { lists, load: loadLists } = useLeadListsStore()
  const { isAdmin, allProfiles }   = useAuthStore()
  const brokers = allProfiles.filter(p => p.role === 'broker')
  const isEditing = Boolean(campaign)

  const [name,          setName]          = useState('')
  const [ticketRaw,     setTicketRaw]     = useState('')
  const [message,       setMessage]       = useState('')
  const [messages,      setMessages]      = useState<string[]>([])
  const [selectedIds,   setSelectedIds]   = useState<Set<string>>(new Set())
  const [responsavelId, setResponsavelId] = useState<string>('')
  const [errors,        setErrors]        = useState<Record<string, string>>({})
  const [saving,        setSaving]        = useState(false)
  const [detalhes,      setDetalhes]      = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setName(campaign?.name ?? '')
    setTicketRaw(campaign?.averageTicket ? formatBRL(campaign.averageTicket) : '')
    setMessage(campaign?.message ?? '')
    setMessages(campaign?.messages ?? [])
    setResponsavelId(campaign?.brokerId ?? '')
    setSelectedIds(new Set())
    setErrors({})
    setSaving(false)
    setDetalhes(Boolean(campaign?.averageTicket || campaign?.brokerId))
    loadLists()
  }, [isOpen])  // eslint-disable-line react-hooks/exhaustive-deps -- o formulário é semeado quando ABRE; incluir os campos de campaign os redefiniria enquanto o usuário digita

  function validate() {
    const e: Record<string, string> = {}
    if (!name.trim())    e.name    = 'Dê um nome à campanha'
    if (!message.trim()) e.message = 'Escreva a mensagem principal'
    setErrors(e)
    return !Object.keys(e).length
  }

  function toggleList(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function handleSubmit(e?: FormEvent) {
    e?.preventDefault()
    if (!validate() || saving) return
    setSaving(true)
    try {
      const cleanMessages = messages.filter(m => m.trim())
      const ticket = parseBRL(ticketRaw)
      const now = new Date().toISOString()

      if (isEditing && campaign) {
        await update(campaign.id, {
          name: name.trim(), message: message.trim(),
          messages: cleanMessages.length ? cleanMessages : undefined,
          averageTicket: ticket > 0 ? ticket : undefined,
          brokerId: isAdmin && responsavelId ? responsavelId : campaign.brokerId,
        })
        toast.success('Campanha atualizada')
        onClose()
        return
      }

      const newCampaign = await add({
        name: name.trim(), message: message.trim(),
        messages: cleanMessages.length ? cleanMessages : undefined,
        status: 'active',
        averageTicket: ticket > 0 ? ticket : undefined,
        brokerId: isAdmin && responsavelId ? responsavelId : undefined,
      })

      const listIds = [...selectedIds]
      for (const listId of listIds) {
        await db.campaignLists.upsert({ id: generateId(), campaignId: newCampaign.id, listId, addedAt: now })
      }

      if (listIds.length > 0) {
        const result = await importContactsFromLists(newCampaign.id, listIds, addBulk)
        toast.success(`Campanha criada com ${result.added.toLocaleString('pt-BR')} lead${result.added !== 1 ? 's' : ''}`)
      } else {
        toast.success('Campanha criada')
      }
      onClose()
    } catch (err) {
      toast.error(isEditing ? 'Não foi possível salvar a campanha.' : 'Não foi possível criar a campanha por completo. Confira as listas e tente de novo.')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const activeLists = lists.filter(l => l.status !== 'archived')
  const totalLeads  = activeLists.filter(l => selectedIds.has(l.id)).reduce((acc, l) => acc + l.totalCount, 0)
  const sujo = !isEditing && Boolean(name.trim() || message.trim() || ticketRaw || selectedIds.size || messages.some(m => m.trim()))

  return (
    <SidePanel
      size="md"
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Editar campanha' : 'Nova campanha de disparo'}
      confirmarSaida={sujo && !saving}
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] text-t4 tabular-nums">
            {!isEditing && selectedIds.size > 0
              ? `${totalLeads.toLocaleString('pt-BR')} leads de ${selectedIds.size} lista${selectedIds.size !== 1 ? 's' : ''}`
              : ''}
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" form="form-campanha" carregando={saving}>
              {isEditing ? 'Salvar alterações' : 'Criar campanha'}
            </Button>
          </div>
        </div>
      }
    >
      <form id="form-campanha" onSubmit={handleSubmit} className="flex flex-col gap-6">

        {/* Nome — o título */}
        <div>
          <input
            id="campaign-name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Nome da campanha"
            aria-label="Nome da campanha"
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? 'campaign-name-error' : undefined}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- o painel abre para criar: o cursor vai para o nome
            autoFocus={!isEditing}
            className="campo-titulo campo-livre"
          />
          {errors.name
            ? <p id="campaign-name-error" className="text-xs text-error mt-0.5" role="alert">{errors.name}</p>
            : <p className="text-[13px] text-t4 mt-0.5">Ex.: Liber.ATO · Proprietários Maio/26</p>}
        </div>

        {/* Mensagens */}
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="campaign-message-1" className="rotulo-campo">Mensagem <span className="text-error">*</span></label>
            <span className="text-[12px] text-t4">
              <code className="text-t3">{'{nome}'}</code> vira o nome do lead
            </span>
          </div>
          <textarea
            id="campaign-message-1"
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={4}
            placeholder="Olá, {nome}! Tudo bem? Sou corretor de imóveis e gostaria de apresentar…"
            aria-invalid={errors.message ? true : undefined}
            aria-describedby={errors.message ? 'campaign-message-1-error' : undefined}
            className="w-full px-3.5 py-2.5 resize-none"
          />
          {errors.message && <p id="campaign-message-1-error" className="text-xs text-error" role="alert">{errors.message}</p>}

          {messages.map((msg, idx) => (
            <div key={idx} className="flex flex-col gap-1.5 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <label htmlFor={`campaign-message-${idx + 2}`} className="rotulo-campo">Variação {idx + 1}</label>
                <button
                  type="button"
                  onClick={() => setMessages(m => m.filter((_, i) => i !== idx))}
                  aria-label={`Remover variação ${idx + 1}`}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-t4 hover:text-error hover:bg-error-bg transition-colors cursor-pointer"
                >
                  <Trash2 size={14} strokeWidth={1.8} />
                </button>
              </div>
              <textarea
                id={`campaign-message-${idx + 2}`}
                value={msg}
                onChange={e => setMessages(m => m.map((v, i) => i === idx ? e.target.value : v))}
                rows={3}
                placeholder="Outra forma de dizer a mesma coisa"
                className="w-full px-3.5 py-2.5 resize-none"
              />
            </div>
          ))}

          <button
            type="button"
            onClick={() => setMessages(m => [...m, ''])}
            className="self-start inline-flex items-center gap-1.5 text-[13px] font-medium text-t3 hover:text-t1 cursor-pointer"
            title="O sistema alterna entre as variações — reduz o risco de bloqueio no WhatsApp"
          >
            <Plus size={13} strokeWidth={2} aria-hidden /> Variação da mensagem
          </button>
        </div>

        {/* Audiência — só na criação; depois, as listas se mexem no detalhe */}
        {!isEditing && (
          <div className="flex flex-col gap-2">
            <span className="rotulo-campo">Listas da Base de Leads</span>
            {activeLists.length === 0 ? (
              <p className="text-[13px] text-t4">
                Nenhuma lista ainda. Importe uma em Base de Leads — dá para ligar listas à campanha depois.
              </p>
            ) : (
              <div role="group" aria-label="Listas da campanha"
                   className="rounded-[12px] bg-s2 max-h-[38vh] overflow-y-auto">
                {activeLists.map(list => {
                  const selected = selectedIds.has(list.id)
                  return (
                    <button
                      key={list.id}
                      type="button"
                      role="checkbox"
                      aria-checked={selected}
                      onClick={() => toggleList(list.id)}
                      className="w-full flex items-center gap-3 px-3.5 py-2.5 min-h-[44px] text-left transition-colors
                                 hover:bg-s3/60 cursor-pointer focus:outline-none focus-visible:bg-s3/60"
                    >
                      <span className={`w-[18px] h-[18px] rounded-[5px] flex items-center justify-center shrink-0 transition-colors
                                        ${selected ? 'bg-brand-fill text-brand-fill-text' : 'border-[1.5px] border-line-strong'}`}>
                        {selected && <Check size={12} strokeWidth={3} aria-hidden />}
                      </span>
                      <span className={`flex-1 min-w-0 truncate text-[14px] ${selected ? 'text-t1 font-medium' : 'text-t2'}`}>
                        {list.name}
                      </span>
                      <span className="text-[13px] text-t4 tabular-nums shrink-0">
                        {list.totalCount.toLocaleString('pt-BR')}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Mais detalhes */}
        {detalhes ? (
          <div className="flex flex-col gap-5 animate-in fade-in duration-150">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="campaign-ticket" className="rotulo-campo">Ticket médio</label>
              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-[13px] text-t4 select-none">R$</span>
                <input
                  id="campaign-ticket"
                  type="text"
                  inputMode="numeric"
                  value={ticketRaw}
                  onChange={e => setTicketRaw(e.target.value.replace(/[^\d.,]/g, ''))}
                  onBlur={() => { const n = parseBRL(ticketRaw); setTicketRaw(n > 0 ? formatBRL(n) : '') }}
                  placeholder="500.000"
                  className="w-full pl-10 pr-4 py-2.5 min-h-[44px] tabular-nums"
                />
              </div>
              <p className="text-[12px] text-t4">Entra no VGV da aba Previsão</p>
            </div>

            {isAdmin && brokers.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="campaign-owner" className="rotulo-campo">Responsável</label>
                <select
                  id="campaign-owner"
                  value={responsavelId}
                  onChange={e => setResponsavelId(e.target.value)}
                  className="campo w-full"
                >
                  <option value="">Minha conta (admin)</option>
                  {brokers.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                <p className="text-[12px] text-t4">O corretor escolhido vê a campanha e faz os disparos</p>
              </div>
            )}
          </div>
        ) : (
          <button type="button" onClick={() => setDetalhes(true)}
            className="self-start text-[13px] font-medium text-t3 hover:text-t1 cursor-pointer">
            + Mais detalhes
          </button>
        )}
      </form>
    </SidePanel>
  )
}
