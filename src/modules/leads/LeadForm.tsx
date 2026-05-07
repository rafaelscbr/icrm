import { useState, useEffect, useRef } from 'react'
import {
  X, User, Phone, Mail, Building2, DollarSign,
  Search, MapPin, ChevronRight, ChevronLeft,
  UserPlus, Users, CheckCircle2, AlertCircle, AlertTriangle,
} from 'lucide-react'
import { Lead, LeadOrigin, LeadFunnelStage } from '../../types'
import { useLeadsStore } from '../../store/useLeadsStore'
import { useContactsStore } from '../../store/useContactsStore'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { useCampaignLeadsStore } from '../../store/useCampaignLeadsStore'
import { formatPhone, formatCurrencyFull } from '../../lib/formatters'
import toast from 'react-hot-toast'

const ORIGINS: { value: LeadOrigin; label: string; color: string; emoji: string }[] = [
  { value: 'felicita',  label: 'Felicità',  color: 'from-rose-500/30 to-pink-500/20 border-rose-500/40',    emoji: '✨' },
  { value: 'meta_ads',  label: 'Meta ADS',  color: 'from-blue-500/30 to-indigo-500/20 border-blue-500/40',  emoji: '📱' },
  { value: 'portal',    label: 'Portal',    color: 'from-cyan-500/30 to-sky-500/20 border-cyan-500/40',     emoji: '🌐' },
  { value: 'offline',   label: 'Offline',   color: 'from-amber-500/30 to-orange-500/20 border-amber-500/40',emoji: '🤝' },
]

const STAGES: { value: LeadFunnelStage; label: string; color: string }[] = [
  { value: 'lead',        label: 'Lead',        color: 'border-slate-500/40 bg-slate-500/15 text-slate-300'  },
  { value: 'followup',    label: 'Followup',    color: 'border-blue-500/40 bg-blue-500/15 text-blue-300'    },
  { value: 'atendimento', label: 'Atendimento', color: 'border-violet-500/40 bg-violet-500/15 text-violet-300'},
  { value: 'visita',      label: 'Visita',      color: 'border-amber-500/40 bg-amber-500/15 text-amber-300'  },
  { value: 'proposta',    label: 'Proposta',    color: 'border-orange-500/40 bg-orange-500/15 text-orange-300'},
  { value: 'venda',       label: 'Venda',       color: 'border-green-500/40 bg-green-500/15 text-green-300'  },
]

function formatPhoneInput(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length > 10) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
  if (d.length > 6)  return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`
  if (d.length > 2)  return `(${d.slice(0,2)}) ${d.slice(2)}`
  return d
}

type ContactMode = 'search' | 'create'

interface LeadFormProps {
  isOpen: boolean
  onClose: () => void
  lead?: Lead
}

export function LeadForm({ isOpen, onClose, lead }: LeadFormProps) {
  const { add, update } = useLeadsStore()
  const { contacts, add: addContact, getById } = useContactsStore()
  const { properties } = usePropertiesStore()
  const { leads: campaignLeads } = useCampaignLeadsStore()

  const isEdit = Boolean(lead)
  const [step, setStep] = useState(1)

  // Step 1
  const [contactMode, setContactMode] = useState<ContactMode>('search')
  const [contactQuery, setContactQuery] = useState('')
  const [selectedContactId, setSelectedContactId] = useState<string | undefined>()
  const searchInputRef = useRef<HTMLInputElement>(null)

  // New contact fields
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newEmail, setNewEmail] = useState('')

  // Step 2
  const [origin, setOrigin] = useState<LeadOrigin>('felicita')
  const [stage, setStage] = useState<LeadFunnelStage>('lead')
  const [propertySearch, setPropertySearch] = useState('')
  const [propertyId, setPropertyId] = useState<string | undefined>()
  const [averageTicket, setAverageTicket] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!isOpen) return
    if (lead) {
      setStep(2)
      setSelectedContactId(lead.contactId)
      if (lead.contactId) {
        const c = getById(lead.contactId)
        setContactQuery(c?.name ?? lead.name)
      } else {
        setContactQuery(lead.name)
      }
      setOrigin(lead.origin)
      setStage(lead.funnelStage)
      setPropertyId(lead.propertyId)
      setAverageTicket(lead.averageTicket ? String(lead.averageTicket) : '')
      setNotes(lead.notes ?? '')
      if (lead.propertyId) {
        const p = properties.find(p => p.id === lead.propertyId)
        setPropertySearch(p?.name ?? '')
      }
    } else {
      setStep(1)
      setContactMode('search')
      setContactQuery('')
      setSelectedContactId(undefined)
      setNewName(''); setNewPhone(''); setNewEmail('')
      setOrigin('felicita'); setStage('lead')
      setPropertyId(undefined); setPropertySearch('')
      setAverageTicket(''); setNotes('')
    }
  }, [isOpen, lead])

  // Derived
  const contactResults = contactQuery.length >= 1
    ? contacts.filter(c =>
        c.name.toLowerCase().includes(contactQuery.toLowerCase()) ||
        c.phone.replace(/\D/g, '').includes(contactQuery.replace(/\D/g, ''))
      ).slice(0, 8)
    : []

  const selectedContact = selectedContactId ? getById(selectedContactId) : undefined

  const newPhoneDigits = newPhone.replace(/\D/g, '')
  const duplicateContact = newPhoneDigits.length >= 10
    ? contacts.find(c => c.phone.replace(/\D/g, '') === newPhoneDigits)
    : undefined

  // Campaign check (by phone)
  const phoneToCheck = contactMode === 'search'
    ? selectedContact?.phone?.replace(/\D/g, '')
    : newPhoneDigits

  const campaignHit = phoneToCheck && phoneToCheck.length >= 10
    ? campaignLeads.find(cl => cl.phone.replace(/\D/g, '') === phoneToCheck)
    : undefined

  const filteredProperties = properties.filter(p =>
    p.name.toLowerCase().includes(propertySearch.toLowerCase()) ||
    p.neighborhood.toLowerCase().includes(propertySearch.toLowerCase())
  ).slice(0, 6)

  function selectContact(id: string) {
    setSelectedContactId(id)
    const c = contacts.find(c => c.id === id)
    setContactQuery(c?.name ?? '')
  }

  function clearContact() {
    setSelectedContactId(undefined)
    setContactQuery('')
    setTimeout(() => searchInputRef.current?.focus(), 50)
  }

  function selectProperty(id: string) {
    const p = properties.find(p => p.id === id)
    if (!p) return
    setPropertyId(id)
    setPropertySearch(p.name)
    setAverageTicket(String(p.value))
  }

  function handleAverageTicketChange(v: string) {
    const digits = v.replace(/\D/g, '')
    setAverageTicket(digits ? String(Number(digits)) : '')
  }

  function canAdvanceStep1() {
    if (contactMode === 'search') return Boolean(selectedContactId)
    return newName.trim().length > 0 && newPhoneDigits.length >= 10 && !duplicateContact
  }

  function handleStep1Next() {
    if (!canAdvanceStep1()) {
      if (contactMode === 'search') toast.error('Selecione um contato da lista')
      else if (duplicateContact) toast.error('Telefone já cadastrado — use "Contato existente"')
      else toast.error('Nome e telefone (mínimo 10 dígitos) são obrigatórios')
      return
    }
    setStep(2)
  }

  function handleSubmit() {
    let resolvedContactId = selectedContactId

    if (!isEdit && contactMode === 'create') {
      const nc = addContact({ name: newName.trim(), phone: newPhone.trim(), tags: [], hasChildren: false, isMarried: false })
      resolvedContactId = nc.id
    }

    const contactRef = resolvedContactId ? getById(resolvedContactId) : undefined
    const displayName  = contactRef?.name  ?? (isEdit ? lead!.name  : newName.trim())
    const displayPhone = contactRef?.phone ?? (isEdit ? lead!.phone : newPhone.trim())

    const data = {
      name: displayName,
      phone: displayPhone,
      origin,
      funnelStage: stage,
      followupStep: lead?.followupStep ?? 0,
      discardReason: lead?.discardReason,
      discardedAt: lead?.discardedAt,
      propertyId: propertyId || undefined,
      averageTicket: averageTicket ? Number(averageTicket) : undefined,
      contactId: resolvedContactId,
      convertedAt: lead?.convertedAt,
      notes: notes.trim() || undefined,
    }

    if (lead) {
      update(lead.id, data)
      toast.success('Lead atualizado!')
    } else {
      add(data)
      toast.success('Lead criado!')
    }
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-[#1A1D27] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in slide-in-from-bottom-4 duration-200">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 bg-gradient-to-r from-violet-500/10 to-purple-500/5 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              {isEdit ? 'Editar Lead' : 'Novo Lead'}
            </h2>
            {!isEdit && (
              <p className="text-xs text-slate-500 mt-0.5">
                {step === 1 ? 'Passo 1 de 2 — Identificar contato' : 'Passo 2 de 2 — Detalhes do funil'}
              </p>
            )}
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/8 text-slate-500 hover:text-slate-200 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Progress bar */}
        {!isEdit && (
          <div className="flex gap-1.5 px-6 pt-4 flex-shrink-0">
            <div className={`h-1 flex-1 rounded-full transition-all duration-300 ${step >= 1 ? 'bg-violet-500' : 'bg-white/10'}`} />
            <div className={`h-1 flex-1 rounded-full transition-all duration-300 ${step >= 2 ? 'bg-violet-500' : 'bg-white/10'}`} />
          </div>
        )}

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* ── STEP 1: Contact ── */}
          {step === 1 && (
            <>
              {/* Mode toggle */}
              <div className="flex gap-2 p-1 bg-white/4 rounded-xl border border-white/8">
                <button
                  onClick={() => { setContactMode('search'); clearContact() }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
                    contactMode === 'search'
                      ? 'bg-violet-500/20 text-violet-200 shadow-sm'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Users size={14} /> Contato existente
                </button>
                <button
                  onClick={() => { setContactMode('create'); setSelectedContactId(undefined) }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
                    contactMode === 'create'
                      ? 'bg-emerald-500/20 text-emerald-200 shadow-sm'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <UserPlus size={14} /> Novo contato
                </button>
              </div>

              {/* ─ Search mode ─ */}
              {contactMode === 'search' && (
                <div className="space-y-2">
                  {selectedContact ? (
                    /* Selected contact card */
                    <div className="flex items-center gap-3 px-4 py-3 bg-violet-500/10 border border-violet-500/30 rounded-xl">
                      <div className="w-10 h-10 rounded-full bg-violet-500/25 flex items-center justify-center text-sm font-bold text-violet-200 flex-shrink-0">
                        {selectedContact.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-100 truncate">{selectedContact.name}</p>
                        <p className="text-xs text-slate-500">{formatPhone(selectedContact.phone)}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <CheckCircle2 size={16} className="text-violet-400" />
                        <button
                          onClick={clearContact}
                          className="text-xs text-slate-500 hover:text-violet-300 px-2 py-1 rounded-lg hover:bg-violet-500/10 transition-all"
                        >
                          Trocar
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Search input + inline results */
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-400">Buscar contato *</label>
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                        <input
                          ref={searchInputRef}
                          value={contactQuery}
                          onChange={e => setContactQuery(e.target.value)}
                          autoFocus
                          placeholder="Digite nome ou telefone..."
                          className="w-full bg-white/5 border border-white/15 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-violet-500/60 focus:bg-violet-500/5 transition-all"
                        />
                      </div>

                      {/* Inline results — no absolute positioning */}
                      {contactQuery.length >= 1 && (
                        <div className="rounded-xl border border-white/10 overflow-hidden bg-[#1E2130]">
                          {contactResults.length === 0 ? (
                            <div className="flex flex-col items-center gap-2 py-5 px-4">
                              <p className="text-xs text-slate-500 text-center">Nenhum contato com "{contactQuery}"</p>
                              <button
                                onClick={() => { setContactMode('create'); setNewName(contactQuery) }}
                                className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors"
                              >
                                <UserPlus size={12} /> Criar novo contato com esse nome
                              </button>
                            </div>
                          ) : (
                            <>
                              <p className="text-[10px] font-medium text-slate-600 px-3 pt-2 pb-1 uppercase tracking-wider">
                                {contactResults.length} resultado{contactResults.length > 1 ? 's' : ''}
                              </p>
                              <div className="max-h-52 overflow-y-auto">
                                {contactResults.map(c => (
                                  <button
                                    key={c.id}
                                    onClick={() => selectContact(c.id)}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-violet-500/10 text-left transition-colors group border-t border-white/5 first:border-0"
                                  >
                                    <div className="w-8 h-8 rounded-full bg-white/8 group-hover:bg-violet-500/20 flex items-center justify-center text-xs font-bold text-slate-400 group-hover:text-violet-300 transition-colors flex-shrink-0">
                                      {c.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-slate-200 truncate group-hover:text-violet-100">{c.name}</p>
                                      <p className="text-xs text-slate-500">{formatPhone(c.phone)}</p>
                                    </div>
                                    <ChevronRight size={13} className="text-slate-600 group-hover:text-violet-400 flex-shrink-0 transition-colors" />
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {contactQuery.length === 0 && contacts.length > 0 && (
                        <p className="text-xs text-slate-600 text-center py-3">
                          Digite ao menos 1 letra para buscar entre {contacts.length} contatos
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ─ Create mode ─ */}
              {contactMode === 'create' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-slate-400 mb-1.5 block">Nome completo *</label>
                    <div className="relative">
                      <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        autoFocus
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder="Nome do lead"
                        className="w-full bg-white/5 border border-white/15 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-violet-500/60 focus:bg-violet-500/5 transition-all"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-slate-400 mb-1.5 block">Telefone *</label>
                      <div className="relative">
                        <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          value={newPhone}
                          onChange={e => setNewPhone(formatPhoneInput(e.target.value))}
                          placeholder="(11) 99999-9999"
                          className={`w-full bg-white/5 border rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none transition-all ${
                            duplicateContact
                              ? 'border-amber-500/60 focus:border-amber-500 bg-amber-500/5'
                              : 'border-white/15 focus:border-violet-500/60 focus:bg-violet-500/5'
                          }`}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-400 mb-1.5 block">E-mail</label>
                      <div className="relative">
                        <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          value={newEmail}
                          onChange={e => setNewEmail(e.target.value)}
                          placeholder="email@..."
                          type="email"
                          className="w-full bg-white/5 border border-white/15 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-violet-500/60 focus:bg-violet-500/5 transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  {duplicateContact && (
                    <div className="flex items-start gap-2.5 px-3 py-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                      <AlertCircle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-xs font-medium text-amber-300">Telefone já cadastrado</p>
                        <p className="text-xs text-amber-400/70 mt-0.5">"{duplicateContact.name}" — use "Contato existente"</p>
                      </div>
                      <button
                        onClick={() => { setContactMode('search'); setContactQuery(duplicateContact.name); setSelectedContactId(duplicateContact.id) }}
                        className="text-xs text-amber-300 hover:text-amber-200 bg-amber-500/20 hover:bg-amber-500/30 px-2 py-1 rounded-lg transition-all flex-shrink-0"
                      >
                        Usar esse
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Campaign alert */}
              {campaignHit && (
                <div className="flex items-start gap-2.5 px-3 py-2.5 bg-orange-500/10 border border-orange-500/30 rounded-xl">
                  <AlertTriangle size={14} className="text-orange-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-orange-300">Contato em campanha ativa</p>
                    <p className="text-xs text-orange-400/70 mt-0.5">Este número já está em uma campanha de mensagens.</p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── STEP 2: Funnel details ── */}
          {step === 2 && (
            <>
              {/* Contact summary pill */}
              {(selectedContact || (isEdit && lead?.contactId)) && (
                <div className="flex items-center gap-2.5 px-3 py-2 bg-white/4 border border-white/8 rounded-xl">
                  <div className="w-7 h-7 rounded-full bg-violet-500/20 flex items-center justify-center text-xs font-bold text-violet-300 flex-shrink-0">
                    {(selectedContact?.name ?? (isEdit ? getById(lead!.contactId!)?.name ?? lead!.name : ''))?.charAt(0)?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-500">Contato</p>
                    <p className="text-sm font-medium text-slate-200 truncate">
                      {selectedContact?.name ?? (isEdit ? getById(lead!.contactId!)?.name ?? lead!.name : newName)}
                    </p>
                  </div>
                  <CheckCircle2 size={14} className="text-violet-400 flex-shrink-0" />
                </div>
              )}

              {/* Campaign alert on step 2 */}
              {campaignHit && (
                <div className="flex items-center gap-2 px-3 py-2 bg-orange-500/10 border border-orange-500/25 rounded-xl">
                  <AlertTriangle size={13} className="text-orange-400 flex-shrink-0" />
                  <p className="text-xs text-orange-300">Este contato já está em uma campanha de mensagens.</p>
                </div>
              )}

              {/* Origem */}
              <div>
                <label className="text-xs font-medium text-slate-400 mb-2 block">Origem do lead</label>
                <div className="grid grid-cols-2 gap-2">
                  {ORIGINS.map(o => (
                    <button
                      key={o.value}
                      onClick={() => setOrigin(o.value)}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all duration-150 ${
                        origin === o.value
                          ? `bg-gradient-to-r ${o.color} text-slate-100`
                          : 'bg-white/3 border-white/8 text-slate-500 hover:bg-white/6 hover:text-slate-300'
                      }`}
                    >
                      <span className="text-base">{o.emoji}</span>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Produto / Imóvel — inline list (sem absolute) */}
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Produto (Imóvel)</label>
                {propertyId ? (
                  <div className="flex items-center gap-3 px-3 py-2.5 bg-violet-500/8 border border-violet-500/25 rounded-xl">
                    <Building2 size={14} className="text-violet-400 flex-shrink-0" />
                    <p className="flex-1 text-sm text-slate-200 truncate">{propertySearch}</p>
                    <button
                      onClick={() => { setPropertyId(undefined); setPropertySearch('') }}
                      className="text-xs text-slate-500 hover:text-red-400 transition-colors"
                    >
                      Trocar
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="relative">
                      <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        value={propertySearch}
                        onChange={e => setPropertySearch(e.target.value)}
                        placeholder="Buscar imóvel..."
                        className="w-full bg-white/5 border border-white/15 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-violet-500/60 focus:bg-violet-500/5 transition-all"
                      />
                    </div>
                    {propertySearch.length >= 1 && filteredProperties.length > 0 && (
                      <div className="rounded-xl border border-white/10 overflow-hidden bg-[#1E2130]">
                        {filteredProperties.map(p => (
                          <button
                            key={p.id}
                            onClick={() => selectProperty(p.id)}
                            className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/5 text-left transition-colors border-t border-white/5 first:border-0"
                          >
                            <div>
                              <p className="text-sm font-medium text-slate-200">{p.name}</p>
                              <p className="text-xs text-slate-500">{p.neighborhood} · {p.kind === 'off_plan' ? 'Lançamento' : 'Pronto'}</p>
                            </div>
                            <span className="text-xs font-semibold text-violet-400 ml-3 flex-shrink-0">
                              {formatCurrencyFull(p.value)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {propertyId && (
                  <p className="text-xs text-violet-400 mt-1 flex items-center gap-1">
                    <MapPin size={9} /> Ticket preenchido automaticamente
                  </p>
                )}
              </div>

              {/* Ticket Médio */}
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Ticket Médio (R$)</label>
                <div className="relative">
                  <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    value={averageTicket ? Number(averageTicket).toLocaleString('pt-BR') : ''}
                    onChange={e => handleAverageTicketChange(e.target.value)}
                    placeholder="0"
                    className="w-full bg-white/5 border border-white/15 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-violet-500/60 focus:bg-violet-500/5 transition-all"
                  />
                </div>
              </div>

              {/* Etapa */}
              <div>
                <label className="text-xs font-medium text-slate-400 mb-2 block">Etapa do funil</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {STAGES.map(s => (
                    <button
                      key={s.value}
                      onClick={() => setStage(s.value)}
                      className={`py-2 rounded-xl border text-xs font-medium transition-all ${
                        stage === s.value ? s.color : 'bg-white/3 border-white/8 text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notas */}
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Observações</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Informações adicionais sobre o lead..."
                  rows={3}
                  className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-violet-500/60 focus:bg-violet-500/5 transition-all resize-none"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-white/8 bg-white/2 flex-shrink-0">
          <button
            onClick={() => {
              if (step === 1 || isEdit) onClose()
              else setStep(1)
            }}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-slate-400 hover:text-slate-200 hover:bg-white/6 rounded-xl transition-all"
          >
            {step === 2 && !isEdit && <ChevronLeft size={14} />}
            {step === 1 || isEdit ? 'Cancelar' : 'Voltar'}
          </button>

          {step === 1 && !isEdit ? (
            <button
              onClick={handleStep1Next}
              disabled={!canAdvanceStep1()}
              className="flex items-center gap-1.5 px-6 py-2.5 text-sm font-semibold bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-xl transition-all shadow-lg shadow-violet-500/25 active:scale-95 disabled:opacity-35 disabled:pointer-events-none"
            >
              Próximo <ChevronRight size={15} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              className="px-6 py-2.5 text-sm font-semibold bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-xl transition-all shadow-lg shadow-violet-500/25 active:scale-95"
            >
              {lead ? 'Salvar alterações' : 'Criar Lead'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
