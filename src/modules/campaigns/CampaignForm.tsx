import { useState, useEffect } from 'react'
import {
  Megaphone, MessageSquare, Users, ChevronRight, ChevronLeft,
  Plus, Trash2, Info, DollarSign, Check, Loader2, ListChecks,
} from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
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
    const { data } = await supabase.from('contacts').select('name, phone').in('id', chunk)
    if (data) contacts.push(...(data as { name: string; phone: string }[]))
  }
  return await addBulk(contacts.map(c => ({ campaignId, name: c.name, phone: c.phone })))
}

// ─── Step indicator ────────────────────────────────────────────────────────────

const STEPS = [
  { label: 'Identidade', icon: Megaphone },
  { label: 'Mensagens',  icon: MessageSquare },
  { label: 'Audiência',  icon: Users },
]

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-4 lg:mb-6">
      {STEPS.map((s, i) => {
        const done   = i < current
        const active = i === current
        const Icon   = s.icon
        return (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div className={`
                w-8 h-8 lg:w-9 lg:h-9 rounded-full flex items-center justify-center border-2 transition-all duration-300
                ${done   ? 'bg-indigo-500 border-indigo-500 text-white' : ''}
                ${active ? 'bg-brand-tint border-indigo-500 text-brand-text shadow-[0_0_0_4px_rgba(99,102,241,0.15)]' : ''}
                ${!done && !active ? 'bg-s3/40 border-line text-t4' : ''}
              `}>
                {done ? <Check size={13} strokeWidth={2.5} /> : <Icon size={13} />}
              </div>
              {/* Label — só visível em telas maiores */}
              <span className={`hidden sm:block text-[11px] font-medium transition-colors ${active ? 'text-brand-text' : done ? 'text-indigo-400' : 'text-t4'}`}>
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-px w-8 lg:w-12 mx-1 ${i < current ? 'bg-indigo-500' : 'bg-line'} ${active || done ? 'mb-0 sm:mb-4' : 'mb-0 sm:mb-4'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

interface Props {
  isOpen:    boolean
  onClose:   () => void
  campaign?: Campaign
}

export function CampaignForm({ isOpen, onClose, campaign }: Props) {
  const { add, update }            = useCampaignsStore()
  const { addBulk }                = useCampaignLeadsStore()
  const { lists, load: loadLists } = useLeadListsStore()
  const { isAdmin, allProfiles }   = useAuthStore()
  const brokers = allProfiles.filter(p => p.role === 'broker')
  const isEditing = Boolean(campaign)

  const [step,           setStep]           = useState(0)
  const [name,           setName]           = useState('')
  const [ticketRaw,      setTicketRaw]      = useState('')
  const [message,        setMessage]        = useState('')
  const [messages,       setMessages]       = useState<string[]>([])
  const [selectedIds,    setSelectedIds]    = useState<Set<string>>(new Set())
  const [responsavelId,  setResponsavelId]  = useState<string>('')
  const [errors,         setErrors]         = useState<Record<string, string>>({})
  const [saving,         setSaving]         = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setStep(0)
    setName(campaign?.name ?? '')
    setTicketRaw(campaign?.averageTicket ? formatBRL(campaign.averageTicket) : '')
    setMessage(campaign?.message ?? '')
    setMessages(campaign?.messages ?? [])
    setResponsavelId(campaign?.brokerId ?? '')
    setSelectedIds(new Set())
    setErrors({})
    setSaving(false)
    loadLists()
  }, [isOpen])

  function validateStep(s: number) {
    const e: Record<string, string> = {}
    if (s === 0 && !name.trim()) e.name = 'Nome é obrigatório'
    if (s === 1 && !message.trim()) e.message = 'Mensagem principal é obrigatória'
    setErrors(e)
    return !Object.keys(e).length
  }

  function next() { if (validateStep(step)) setStep(s => s + 1) }
  function back() { setStep(s => s - 1) }

  function toggleList(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleSubmit() {
    if (!validateStep(step)) return
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
        toast.success(`Campanha criada! ${result.added} lead${result.added !== 1 ? 's' : ''} importado${result.added !== 1 ? 's' : ''}.`)
      } else {
        toast.success('Campanha criada!')
      }
      onClose()
    } catch (err) {
      toast.error('Erro ao criar campanha.')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const activeLists = lists.filter(l => l.status !== 'archived')
  const totalLeads  = activeLists.filter(l => selectedIds.has(l.id)).reduce((acc, l) => acc + l.totalCount, 0)
  const allCount    = 1 + messages.filter(m => m.trim()).length

  // ── Footer de navegação — FORA do scroll ──────────────────────────────────
  const footer = (
    <div className="flex gap-3 w-full">
      {step > 0 && (
        <button
          type="button"
          onClick={back}
          disabled={saving}
          className="flex items-center justify-center gap-1.5 px-4 min-h-[48px] rounded-xl text-sm text-t3 hover:text-t1 border border-line hover:border-line-strong transition-all cursor-pointer disabled:opacity-50"
        >
          <ChevronLeft size={16} />
          <span className="hidden sm:inline">Voltar</span>
        </button>
      )}
      <button
        type="button"
        onClick={step < 2 ? next : handleSubmit}
        disabled={saving}
        className="flex-1 flex items-center justify-center gap-2 min-h-[48px] rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all cursor-pointer shadow-lg shadow-indigo-500/20 disabled:opacity-60"
      >
        {saving
          ? <><Loader2 size={15} className="animate-spin" /> Criando…</>
          : step < 2
            ? <>Próximo <ChevronRight size={15} /></>
            : isEditing ? 'Salvar alterações' : 'Criar campanha'
        }
      </button>
    </div>
  )

  // ─── render ─────────────────────────────────────────────────────────────────

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="" size="md" footer={footer}>
      <div>
        <StepBar current={step} />

        {/* ── Step 0: Identidade ── */}
        {step === 0 && (
          <div className="flex flex-col gap-4">
            <div className="text-center mb-2">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center mx-auto mb-2">
                <Megaphone size={22} className="text-indigo-400" />
              </div>
              <h2 className="text-base font-semibold text-t1">Identidade da campanha</h2>
              <p className="text-xs text-t4 mt-0.5">Nome claro para identificar facilmente</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-t3 uppercase tracking-wider">Nome</label>
              <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && next()}
                placeholder="Ex: Liber.ATO – Proprietários Maio/26"
                className="w-full bg-s3/50 border border-line rounded-xl px-4 py-3.5 text-sm text-t1 placeholder:text-t5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all min-h-[48px]"
              />
              {errors.name && <p className="text-xs text-red-400">{errors.name}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-t3 uppercase tracking-wider">
                Ticket médio <span className="normal-case font-normal text-t5">(opcional)</span>
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-t3 pointer-events-none">
                  <DollarSign size={13} />
                  <span className="text-xs">R$</span>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  value={ticketRaw}
                  onChange={e => setTicketRaw(e.target.value.replace(/[^\d.,]/g, ''))}
                  onBlur={() => { const n = parseBRL(ticketRaw); setTicketRaw(n > 0 ? formatBRL(n) : '') }}
                  placeholder="Ex: 500.000"
                  className="w-full bg-s3/50 border border-line rounded-xl pl-12 pr-4 py-3.5 text-sm text-t1 placeholder:text-t5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all min-h-[48px]"
                />
              </div>
              <p className="text-xs text-t5">Usado para calcular VGV na aba de Previsão</p>
            </div>

            {isAdmin && brokers.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-t3 uppercase tracking-wider">
                  Responsável <span className="normal-case font-normal text-t5">(opcional)</span>
                </label>
                <select
                  value={responsavelId}
                  onChange={e => setResponsavelId(e.target.value)}
                  className="w-full bg-s3/50 border border-line rounded-xl px-4 py-3.5 text-sm text-t1 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all min-h-[48px] appearance-none"
                >
                  <option value="">Minha conta (admin)</option>
                  {brokers.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                <p className="text-xs text-t5">O corretor selecionado verá e fará os disparos desta campanha</p>
              </div>
            )}
          </div>
        )}

        {/* ── Step 1: Mensagens ── */}
        {step === 1 && (
          <div className="flex flex-col gap-4">
            <div className="text-center mb-2">
              <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto mb-2">
                <MessageSquare size={22} className="text-green-400" />
              </div>
              <h2 className="text-base font-semibold text-t1">Templates de mensagem</h2>
              <p className="text-xs text-t4 mt-0.5">Use <code className="bg-s3/70 px-1 rounded">{'{nome}'}</code> para personalizar</p>
            </div>

            <div className="flex items-start gap-2 bg-indigo-500/8 border border-brand/25 rounded-xl px-3 py-2.5">
              <Info size={13} className="text-brand flex-shrink-0 mt-0.5" />
              <p className="text-xs text-brand-text/80">
                Múltiplos templates evitam bloqueio no WhatsApp — o sistema rotaciona entre eles.
              </p>
            </div>

            {/* Área de mensagens com scroll no mobile */}
            <div className="flex flex-col gap-3 max-h-[45vh] lg:max-h-none overflow-y-auto pr-0.5">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-t3 uppercase tracking-wider">
                    Mensagem 1 <span className="text-brand normal-case font-normal">(principal)</span>
                  </label>
                  <span className="text-[11px] text-t5">{allCount} template{allCount !== 1 ? 's' : ''}</span>
                </div>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={4}
                  placeholder="Olá, {nome}! Tudo bem? Sou corretor de imóveis e gostaria de apresentar..."
                  className="w-full bg-s3/50 border border-line rounded-xl px-3 py-3 text-sm text-t1 placeholder:text-t5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none transition-all"
                />
                {errors.message && <p className="text-xs text-red-400">{errors.message}</p>}
              </div>

              {messages.map((msg, idx) => (
                <div key={idx} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-t3 uppercase tracking-wider">Mensagem {idx + 2}</label>
                    <button
                      type="button"
                      onClick={() => setMessages(m => m.filter((_, i) => i !== idx))}
                      className="text-t4 hover:text-red-400 transition-colors cursor-pointer p-1"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <textarea
                    value={msg}
                    onChange={e => setMessages(m => m.map((v, i) => i === idx ? e.target.value : v))}
                    rows={4}
                    placeholder="Olá, {nome}! Tudo bem? Sou corretor de imóveis e gostaria de apresentar..."
                    className="w-full bg-s3/50 border border-line rounded-xl px-3 py-3 text-sm text-t1 placeholder:text-t5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none transition-all"
                  />
                </div>
              ))}

              <button
                type="button"
                onClick={() => setMessages(m => [...m, ''])}
                className="flex items-center gap-2 text-xs text-brand hover:text-brand-text transition-colors cursor-pointer py-1 w-fit"
              >
                <Plus size={13} /> Adicionar mensagem alternativa
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Audiência ── */}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            <div className="text-center mb-2">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center mx-auto mb-2">
                <Users size={22} className="text-purple-400" />
              </div>
              <h2 className="text-base font-semibold text-t1">Selecionar audiência</h2>
              <p className="text-xs text-t4 mt-0.5">Escolha uma ou mais listas da Base de Leads</p>
            </div>

            {activeLists.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <ListChecks size={32} className="text-t4" />
                <p className="text-sm text-t3">Nenhuma lista cadastrada ainda</p>
                <p className="text-xs text-t5">Vá em Base de Leads e importe uma lista primeiro</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-[42vh] overflow-y-auto pr-0.5">
                {activeLists.map(list => {
                  const selected = selectedIds.has(list.id)
                  return (
                    <button
                      key={list.id}
                      type="button"
                      onClick={() => toggleList(list.id)}
                      className={`
                        flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all duration-150 cursor-pointer
                        ${selected
                          ? 'bg-indigo-500/10 border-indigo-500/50 shadow-[0_0_0_1px_rgba(99,102,241,0.2)]'
                          : 'bg-s3/30 border-line hover:border-line/80 hover:bg-s3/50'
                        }
                      `}
                    >
                      <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 border-2 transition-all ${selected ? 'bg-indigo-500 border-indigo-500' : 'border-slate-600 bg-s3/50'}`}>
                        {selected && <Check size={11} strokeWidth={3} className="text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${selected ? 'text-t1' : 'text-t2'}`}>{list.name}</p>
                        {list.description && <p className="text-xs text-t5 truncate">{list.description}</p>}
                      </div>
                      <span className={`text-xs font-semibold tabular-nums px-2 py-1 rounded-lg flex-shrink-0 ${selected ? 'bg-indigo-500/20 text-indigo-300' : 'bg-s3/70 text-t4'}`}>
                        {list.totalCount.toLocaleString()}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}

            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 bg-green-500/8 border border-green-500/20 rounded-xl px-3 py-2.5">
                <Check size={13} className="text-green-400 flex-shrink-0" />
                <p className="text-xs text-green-400">
                  <span className="font-bold">{selectedIds.size}</span> lista{selectedIds.size !== 1 ? 's' : ''} · <span className="font-bold">{totalLeads.toLocaleString()}</span> leads
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
