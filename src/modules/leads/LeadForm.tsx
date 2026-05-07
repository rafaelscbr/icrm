import { useState, useEffect, useRef } from 'react'
import {
  X, User, Phone, Mail, Building2, DollarSign,
  Search, MapPin, ChevronRight, ChevronLeft,
  UserPlus, Users, CheckCircle2, AlertCircle,
} from 'lucide-react'
import { Lead, LeadOrigin, LeadFunnelStage } from '../../types'
import { useLeadsStore } from '../../store/useLeadsStore'
import { useContactsStore } from '../../store/useContactsStore'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { formatPhone, formatCurrencyFull } from '../../lib/formatters'
import toast from 'react-hot-toast'

const ORIGINS: { value: LeadOrigin; label: string; color: string; emoji: string }[] = [
  { value: 'felicita',  label: 'Felicità',  color: 'from-rose-500/30 to-pink-500/20 border-rose-500/30',    emoji: '✨' },
  { value: 'meta_ads',  label: 'Meta ADS',  color: 'from-blue-500/30 to-indigo-500/20 border-blue-500/30',  emoji: '📱' },
  { value: 'portal',    label: 'Portal',    color: 'from-cyan-500/30 to-sky-500/20 border-cyan-500/30',     emoji: '🌐' },
  { value: 'offline',   label: 'Offline',   color: 'from-amber-500/30 to-orange-500/20 border-amber-500/30',emoji: '🤝' },
]

const STAGES: { value: LeadFunnelStage; label: string }[] = [
  { value: 'lead',        label: 'Lead' },
  { value: 'followup',    label: 'Followup' },
  { value: 'atendimento', label: 'Atendimento' },
  { value: 'visita',      label: 'Visita' },
  { value: 'proposta',    label: 'Proposta' },
  { value: 'venda',       label: 'Venda' },
]

function formatPhoneInput(v: string) {
  const digits = v.replace(/\D/g, '').slice(0, 11)
  if (digits.length > 10) return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`
  if (digits.length > 6)  return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`
  if (digits.length > 2)  return `(${digits.slice(0,2)}) ${digits.slice(2)}`
  return digits
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

  // wizard step: 1 = contact, 2 = funnel details
  const [step, setStep] = useState(1)

  // Step 1 — contact
  const [contactMode, setContactMode] = useState<ContactMode>('search')
  const [contactQuery, setContactQuery] = useState('')
  const [selectedContactId, setSelectedContactId] = useState<string | undefined>()
  const [showContactResults, setShowContactResults] = useState(false)
  const contactInputRef = useRef<HTMLInputElement>(null)

  // New contact fields
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newEmail, setNewEmail] = useState('')

  // Step 2 — funnel details
  const [origin, setOrigin] = useState<LeadOrigin>('felicita')
  const [stage, setStage] = useState<LeadFunnelStage>('lead')
  const [propertySearch, setPropertySearch] = useState('')
  const [propertyId, setPropertyId] = useState<string | undefined>()
  const [showPropertySearch, setShowPropertySearch] = useState(false)
  const [averageTicket, setAverageTicket] = useState('')
  const [notes, setNotes] = useState('')

  const isEdit = Boolean(lead)

  useEffect(() => {
    if (!isOpen) return
    if (lead) {
      // Edit mode: skip to step 2, pre-populate
      setStep(isEdit ? 2 : 1)
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
      setShowContactResults(false)
      setNewName(''); setNewPhone(''); setNewEmail('')
      setOrigin('felicita'); setStage('lead')
      setPropertyId(undefined); setPropertySearch('')
      setAverageTicket(''); setNotes('')
    }
  }, [isOpen, lead])

  // Contact search results
  const contactResults = contactQuery.length >= 2
    ? contacts.filter(c =>
        c.name.toLowerCase().includes(contactQuery.toLowerCase()) ||
        c.phone.replace(/\D/g, '').includes(contactQuery.replace(/\D/g, ''))
      ).slice(0, 6)
    : []

  const selectedContact = selectedContactId ? getById(selectedContactId) : undefined

  // Duplicate phone check for new contact
  const newPhoneDigits = newPhone.replace(/\D/g, '')
  const duplicateContact = newPhoneDigits.length >= 10
    ? contacts.find(c => c.phone.replace(/\D/g, '') === newPhoneDigits)
    : undefined

  function selectContact(id: string) {
    setSelectedContactId(id)
    const c = contacts.find(c => c.id === id)
    setContactQuery(c?.name ?? '')
    setShowContactResults(false)
  }

  function clearContact() {
    setSelectedContactId(undefined)
    setContactQuery('')
  }

  function selectProperty(id: string) {
    const p = properties.find(p => p.id === id)
    if (!p) return
    setPropertyId(id)
    setPropertySearch(p.name)
    setAverageTicket(String(p.value))
    setShowPropertySearch(false)
  }

  function handleAverageTicketChange(v: string) {
    const digits = v.replace(/\D/g, '')
    setAverageTicket(digits ? String(Number(digits)) : '')
  }

  function canAdvanceStep1() {
    if (contactMode === 'search') return Boolean(selectedContactId)
    return newName.trim().length > 0 && newPhone.replace(/\D/g, '').length >= 10
  }

  function handleStep1Next() {
    if (!canAdvanceStep1()) {
      if (contactMode === 'search') toast.error('Selecione um contato')
      else toast.error('Nome e telefone são obrigatórios')
      return
    }
    if (contactMode === 'create' && duplicateContact) {
      toast.error(`Já existe um contato com esse telefone: ${duplicateContact.name}`)
      return
    }
    setStep(2)
  }

  function handleSubmit() {
    let resolvedContactId = selectedContactId

    if (!isEdit && contactMode === 'create') {
      const newContact = addContact({
        name: newName.trim(),
        phone: newPhone.trim(),
        tags: [],
        hasChildren: false,
        isMarried: false,
      })
      resolvedContactId = newContact.id
    }

    const contactRef = resolvedContactId ? getById(resolvedContactId) : undefined
    const displayName = contactRef?.name ?? (isEdit ? lead!.name : newName.trim())
    const displayPhone = contactRef?.phone ?? (isEdit ? lead!.phone : newPhone.trim())

    const data = {
      name: displayName,
      phone: displayPhone,
      email: contactRef ? undefined : (isEdit ? lead?.email : undefined),
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

  const filteredProperties = properties.filter(p =>
    p.name.toLowerCase().includes(propertySearch.toLowerCase()) ||
    p.neighborhood.toLowerCase().includes(propertySearch.toLowerCase())
  ).slice(0, 8)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-[#1A1D27] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 bg-gradient-to-r from-violet-500/10 to-purple-500/5">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              {isEdit ? 'Editar Lead' : 'Novo Lead'}
            </h2>
            {!isEdit && (
              <p className="text-xs text-slate-500 mt-0.5">
                Passo {step} de 2 — {step === 1 ? 'Identificar contato' : 'Detalhes do funil'}
              </p>
            )}
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/8 text-slate-500 hover:text-slate-200 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Step indicator (new lead only) */}
        {!isEdit && (
          <div className="flex px-6 pt-4 gap-2">
            {[1, 2].map(s => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                  s <= step ? 'bg-violet-500' : 'bg-white/10'
                }`}
              />
            ))}
          </div>
        )}

        <div className="px-6 py-5 space-y-5 overflow-y-auto max-h-[calc(90vh-160px)]">

          {/* ── STEP 1: Contact ── */}
          {step === 1 && (
            <>
              {/* Mode toggle */}
              <div className="flex gap-2">
                <button
                  onClick={() => { setContactMode('search'); clearContact() }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                    contactMode === 'search'
                      ? 'bg-violet-500/15 border-violet-500/40 text-violet-300'
                      : 'bg-white/4 border-white/8 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Users size={15} />
                  Contato existente
                </button>
                <button
                  onClick={() => { setContactMode('create'); clearContact() }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                    contactMode === 'create'
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : 'bg-white/4 border-white/8 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <UserPlus size={15} />
                  Novo contato
                </button>
              </div>

              {/* Search existing contact */}
              {contactMode === 'search' && (
                <div>
                  <label className="text-xs font-medium text-slate-400 mb-1.5 block">
                    Buscar contato *
                  </label>

                  {selectedContact ? (
                    <div className="flex items-center gap-3 px-3 py-3 bg-violet-500/10 border border-violet-500/30 rounded-xl">
                      <div className="w-9 h-9 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                        <User size={16} className="text-violet-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-100 truncate">{selectedContact.name}</p>
                        <p className="text-xs text-slate-500">{formatPhone(selectedContact.phone)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={16} className="text-violet-400 flex-shrink-0" />
                        <button
                          onClick={clearContact}
                          className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                        >
                          Trocar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        ref={contactInputRef}
                        value={contactQuery}
                        onChange={e => { setContactQuery(e.target.value); setShowContactResults(true) }}
                        onFocus={() => setShowContactResults(true)}
                        placeholder="Nome ou telefone..."
                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-violet-500/50 focus:bg-violet-500/5 transition-all"
                      />
                      {showContactResults && contactResults.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-[#1E2130] border border-white/10 rounded-xl shadow-xl z-20 overflow-hidden">
                          {contactResults.map(c => (
                            <button
                              key={c.id}
                              onClick={() => selectContact(c.id)}
                              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 text-left transition-colors"
                            >
                              <div className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center flex-shrink-0">
                                <User size={14} className="text-slate-400" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-slate-200">{c.name}</p>
                                <p className="text-xs text-slate-500">{formatPhone(c.phone)}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      {showContactResults && contactQuery.length >= 2 && contactResults.length === 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-[#1E2130] border border-white/10 rounded-xl shadow-xl z-20 px-3 py-3">
                          <p className="text-xs text-slate-500">Nenhum contato encontrado — tente "Novo contato"</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Create new contact */}
              {contactMode === 'create' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-slate-400 mb-1.5 block">Nome *</label>
                    <div className="relative">
                      <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder="Nome completo"
                        className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-violet-500/50 focus:bg-violet-500/5 transition-all"
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
                              ? 'border-amber-500/50 focus:border-amber-500/80 bg-amber-500/5'
                              : 'border-white/10 focus:border-violet-500/50 focus:bg-violet-500/5'
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
                          placeholder="email@exemplo.com"
                          type="email"
                          className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-violet-500/50 focus:bg-violet-500/5 transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  {duplicateContact && (
                    <div className="flex items-start gap-2.5 px-3 py-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                      <AlertCircle size={15} className="text-amber-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-medium text-amber-300">Telefone já cadastrado</p>
                        <p className="text-xs text-amber-400/70 mt-0.5">
                          "{duplicateContact.name}" já usa este número. Use "Contato existente" para vinculá-lo.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── STEP 2: Funnel details ── */}
          {step === 2 && (
            <>
              {/* Show linked contact (edit or after step 1) */}
              {(selectedContact || (isEdit && lead?.contactId)) && (
                <div className="flex items-center gap-3 px-3 py-2.5 bg-white/4 border border-white/8 rounded-xl">
                  <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                    <User size={14} className="text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-500">Contato vinculado</p>
                    <p className="text-sm font-medium text-slate-200 truncate">
                      {selectedContact?.name ?? (isEdit ? getById(lead!.contactId!)?.name ?? lead!.name : lead?.name)}
                    </p>
                  </div>
                  <CheckCircle2 size={15} className="text-violet-400 flex-shrink-0" />
                </div>
              )}

              {/* Origem */}
              <div>
                <label className="text-xs font-medium text-slate-400 mb-2 block">Origem</label>
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

              {/* Produto / Imóvel */}
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Produto (Imóvel)</label>
                <div className="relative">
                  <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 z-10" />
                  <input
                    value={propertySearch}
                    onChange={e => {
                      setPropertySearch(e.target.value)
                      setShowPropertySearch(true)
                      if (!e.target.value) { setPropertyId(undefined) }
                    }}
                    onFocus={() => setShowPropertySearch(true)}
                    placeholder="Buscar imóvel cadastrado..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-9 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-violet-500/50 focus:bg-violet-500/5 transition-all"
                  />
                  <Search size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600" />
                  {showPropertySearch && propertySearch && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-[#1E2130] border border-white/10 rounded-xl shadow-xl z-20 overflow-hidden">
                      {filteredProperties.length === 0 ? (
                        <p className="text-xs text-slate-500 px-3 py-3">Nenhum imóvel encontrado</p>
                      ) : (
                        filteredProperties.map(p => (
                          <button
                            key={p.id}
                            onClick={() => selectProperty(p.id)}
                            className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/5 text-left transition-colors"
                          >
                            <div>
                              <p className="text-sm text-slate-200 font-medium">{p.name}</p>
                              <p className="text-xs text-slate-500">{p.neighborhood} · {p.kind === 'off_plan' ? 'Lançamento' : 'Pronto'}</p>
                            </div>
                            <span className="text-xs font-semibold text-violet-400 ml-3 flex-shrink-0">
                              {formatCurrencyFull(p.value)}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                {propertyId && (
                  <p className="text-xs text-violet-400 mt-1.5 flex items-center gap-1">
                    <MapPin size={10} />
                    Imóvel vinculado — ticket preenchido automaticamente
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
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-violet-500/50 focus:bg-violet-500/5 transition-all"
                  />
                </div>
              </div>

              {/* Etapa do Funil */}
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Etapa do Funil</label>
                <div className="grid grid-cols-3 gap-2">
                  {STAGES.map(s => (
                    <button
                      key={s.value}
                      onClick={() => setStage(s.value)}
                      className={`py-2 rounded-xl border text-xs font-medium transition-all ${
                        stage === s.value
                          ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                          : 'bg-white/3 border-white/8 text-slate-500 hover:text-slate-300'
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
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-violet-500/50 focus:bg-violet-500/5 transition-all resize-none"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-white/8 bg-white/2">
          <button
            onClick={() => {
              if (step === 1 || isEdit) onClose()
              else setStep(1)
            }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-slate-400 hover:text-slate-200 hover:bg-white/5 rounded-xl transition-all"
          >
            {step === 2 && !isEdit && <ChevronLeft size={15} />}
            {step === 1 || isEdit ? 'Cancelar' : 'Voltar'}
          </button>

          {step === 1 && !isEdit ? (
            <button
              onClick={handleStep1Next}
              disabled={!canAdvanceStep1() || Boolean(duplicateContact)}
              className="flex items-center gap-1.5 px-5 py-2 text-sm font-medium bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-xl transition-all shadow-lg shadow-violet-500/20 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
            >
              Próximo
              <ChevronRight size={15} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              className="px-5 py-2 text-sm font-medium bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-xl transition-all shadow-lg shadow-violet-500/20 active:scale-95"
            >
              {lead ? 'Salvar alterações' : 'Criar Lead'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
