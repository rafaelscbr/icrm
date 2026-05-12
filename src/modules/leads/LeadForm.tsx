import { useState, useEffect, useRef } from 'react'
import {
  X, User, Phone, Mail, Building2, DollarSign,
  Search, MapPin, ChevronRight, ChevronLeft,
  UserPlus, Users, CheckCircle2, AlertCircle, AlertTriangle,
  Calendar, Sparkles, PenLine,
} from 'lucide-react'
import { Lead, LeadOrigin, LeadFunnelStage } from '../../types'
import { useLeadsStore } from '../../store/useLeadsStore'
import { useContactsStore } from '../../store/useContactsStore'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { useCampaignLeadsStore } from '../../store/useCampaignLeadsStore'
import { formatPhone, formatCurrencyFull, localDateStr } from '../../lib/formatters'
import toast from 'react-hot-toast'

// ─── Constantes ───────────────────────────────────────────────────────────────

const ORIGINS: { value: LeadOrigin; label: string; emoji: string; grad: string; ring: string }[] = [
  { value: 'felicita',  label: 'Felicità',  emoji: '✨', grad: 'from-rose-500 to-pink-600',    ring: 'ring-rose-500/50'   },
  { value: 'meta_ads',  label: 'Meta ADS',  emoji: '📱', grad: 'from-blue-500 to-indigo-600',  ring: 'ring-blue-500/50'   },
  { value: 'portal',    label: 'Portal',    emoji: '🌐', grad: 'from-cyan-500 to-sky-600',     ring: 'ring-cyan-500/50'   },
  { value: 'offline',   label: 'Offline',   emoji: '🤝', grad: 'from-amber-500 to-orange-600', ring: 'ring-amber-500/50'  },
]

const STAGES: { value: LeadFunnelStage; label: string; emoji: string; color: string; active: string }[] = [
  { value: 'lead',        label: 'Lead',        emoji: '🎯', color: 'text-slate-400',  active: 'bg-slate-500/25 border-slate-400/50 text-slate-200' },
  { value: 'followup',    label: 'Followup',    emoji: '💬', color: 'text-blue-400',   active: 'bg-blue-500/25 border-blue-400/50 text-blue-200'    },
  { value: 'atendimento', label: 'Atendimento', emoji: '🤙', color: 'text-violet-400', active: 'bg-violet-500/25 border-violet-400/50 text-violet-200'},
  { value: 'visita',      label: 'Visita',      emoji: '🏠', color: 'text-amber-400',  active: 'bg-amber-500/25 border-amber-400/50 text-amber-200'  },
  { value: 'proposta',    label: 'Proposta',    emoji: '📝', color: 'text-orange-400', active: 'bg-orange-500/25 border-orange-400/50 text-orange-200'},
  { value: 'venda',       label: 'Venda',       emoji: '🏆', color: 'text-green-400',  active: 'bg-green-500/25 border-green-400/50 text-green-200'  },
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
  const [animDir, setAnimDir] = useState<'forward' | 'back'>('forward')

  // Step 1 — contact
  const [contactMode, setContactMode] = useState<ContactMode>('search')
  const [contactQuery, setContactQuery] = useState('')
  const [selectedContactId, setSelectedContactId] = useState<string | undefined>()
  const searchRef = useRef<HTMLInputElement>(null)

  // New contact fields
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newEmail, setNewEmail] = useState('')

  // Step 2 — funnel
  const [origin, setOrigin] = useState<LeadOrigin>('felicita')
  const [stage, setStage] = useState<LeadFunnelStage>('lead')
  const [propertySearch, setPropertySearch] = useState('')
  const [propertyId, setPropertyId] = useState<string | undefined>()
  const [freePropertyName, setFreePropertyName] = useState('')  // free-text property
  const [propertyMode, setPropertyMode] = useState<'search' | 'free' | 'selected'>('search')
  const [averageTicket, setAverageTicket] = useState('')
  const [notes, setNotes] = useState('')
  const [entryDate, setEntryDate] = useState(localDateStr())   // retroactive date

  // ─── Reset on open ────────────────────────────────────────────────────────────
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
      setEntryDate(lead.createdAt.split('T')[0])
      if (lead.propertyId) {
        const p = properties.find(p => p.id === lead.propertyId)
        setPropertySearch(p?.name ?? '')
        setPropertyMode('selected')
      } else if (lead.propertyName) {
        setFreePropertyName(lead.propertyName)
        setPropertyMode('free')
      } else {
        setPropertyMode('search')
      }
    } else {
      setStep(1)
      setAnimDir('forward')
      setContactMode('search')
      setContactQuery('')
      setSelectedContactId(undefined)
      setNewName(''); setNewPhone(''); setNewEmail('')
      setOrigin('felicita'); setStage('lead')
      setPropertyId(undefined); setPropertySearch('')
      setFreePropertyName(''); setPropertyMode('search')
      setAverageTicket(''); setNotes('')
      setEntryDate(localDateStr())
    }
  }, [isOpen, lead])

  // ─── Derived ──────────────────────────────────────────────────────────────────
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

  const isRetroactive = entryDate < localDateStr()

  // ─── Handlers ────────────────────────────────────────────────────────────────
  function selectContact(id: string) {
    setSelectedContactId(id)
    const c = contacts.find(c => c.id === id)
    setContactQuery(c?.name ?? '')
  }

  function clearContact() {
    setSelectedContactId(undefined)
    setContactQuery('')
    setTimeout(() => searchRef.current?.focus(), 50)
  }

  function selectProperty(id: string) {
    const p = properties.find(p => p.id === id)
    if (!p) return
    setPropertyId(id)
    setPropertySearch(p.name)
    setPropertyMode('selected')
    setAverageTicket(String(p.value))
    setFreePropertyName('')
  }

  function useFreeProperty() {
    setPropertyId(undefined)
    setFreePropertyName(propertySearch)
    setPropertyMode('free')
  }

  function clearProperty() {
    setPropertyId(undefined)
    setFreePropertyName('')
    setPropertySearch('')
    setPropertyMode('search')
  }

  function handleAverageTicketChange(v: string) {
    const digits = v.replace(/\D/g, '')
    setAverageTicket(digits ? String(Number(digits)) : '')
  }

  function canAdvanceStep1() {
    if (contactMode === 'search') return Boolean(selectedContactId)
    return newName.trim().length > 0 && newPhoneDigits.length >= 10 && !duplicateContact
  }

  function goNext() {
    if (!canAdvanceStep1()) {
      if (contactMode === 'search') toast.error('Selecione um contato da lista')
      else if (duplicateContact) toast.error('Telefone já cadastrado')
      else toast.error('Nome e telefone são obrigatórios')
      return
    }
    setAnimDir('forward')
    setStep(2)
  }

  function goBack() {
    setAnimDir('back')
    setStep(1)
  }

  function handleSubmit() {
    let resolvedContactId = selectedContactId
    if (!isEdit && contactMode === 'create') {
      const nc = addContact({ name: newName.trim(), phone: newPhone.trim(), tags: [], hasChildren: false, isMarried: false, permutaItems: [] })
      resolvedContactId = nc.id
    }

    const contactRef = resolvedContactId ? getById(resolvedContactId) : undefined
    const displayName  = contactRef?.name  ?? (isEdit ? lead!.name  : newName.trim())
    const displayPhone = contactRef?.phone ?? (isEdit ? lead!.phone : newPhone.trim())

    const resolvedPropertyName = propertyMode === 'free' ? freePropertyName.trim() || undefined : undefined

    const data = {
      name: displayName,
      phone: displayPhone,
      origin,
      funnelStage: stage,
      followupStep: lead?.followupStep ?? 0,
      discardReason: lead?.discardReason,
      discardedAt: lead?.discardedAt,
      propertyId: propertyMode === 'selected' ? propertyId : undefined,
      propertyName: resolvedPropertyName,
      averageTicket: averageTicket ? Number(averageTicket) : undefined,
      contactId: resolvedContactId,
      convertedAt: lead?.convertedAt,
      visitaTaskId: lead?.visitaTaskId,
      notes: notes.trim() || undefined,
    }

    if (lead) {
      update(lead.id, { ...data, createdAt: entryDate + 'T00:00:00.000Z' })
      toast.success('Lead atualizado!')
    } else {
      add({ ...data, createdAt: entryDate + 'T00:00:00.000Z' })
      if (isRetroactive) toast.success(`Lead registrado retroativamente para ${new Date(entryDate + 'T12:00:00').toLocaleDateString('pt-BR')}`)
      else toast.success('Lead criado!')
    }
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg modal-surface rounded-xl shadow-2xl shadow-black/50 flex flex-col max-h-[92vh] overflow-hidden
        animate-in fade-in zoom-in-95 duration-200">

        {/* Gradient top border */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500 via-blue-400 to-cyan-500" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center
              bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/20`}>
              <Sparkles size={16} className="text-blue-300" />
            </div>
            <div>
              <h2 className="text-base font-bold text-t1">
                {isEdit ? 'Editar Lead' : 'Novo Lead'}
              </h2>
              {!isEdit && (
                <p className="text-[11px] text-t3 mt-0.5">
                  {step === 1 ? '① Identificar contato' : '② Detalhes do funil'}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-s3 text-t3 hover:text-t1 transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* Progress bar */}
        {!isEdit && (
          <div className="flex gap-1.5 px-6 pb-4 flex-shrink-0">
            <div className="h-1 flex-1 rounded-full bg-gradient-to-r from-blue-500 to-blue-600" />
            <div className={`h-1 flex-1 rounded-full transition-all duration-500 ${step >= 2 ? 'bg-gradient-to-r from-blue-400 to-cyan-500' : 'bg-s3'}`} />
          </div>
        )}

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-6 pb-2 space-y-4">

          {/* ────── STEP 1: Contact ────── */}
          {step === 1 && (
            <div className={`space-y-4 ${animDir === 'forward' ? 'animate-in fade-in slide-in-from-right-4' : 'animate-in fade-in slide-in-from-left-4'} duration-200`}>

              {/* Toggle */}
              <div className="flex gap-1 p-1 bg-s2/60 rounded-xl border border-line">
                <button
                  onClick={() => { setContactMode('search'); clearContact() }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    contactMode === 'search'
                      ? 'bg-gradient-to-br bg-blue-600/30 text-blue-100 shadow-sm border border-blue-500/30'
                      : 'text-t3 hover:text-t2'
                  }`}
                >
                  <Users size={14} /> Contato existente
                </button>
                <button
                  onClick={() => { setContactMode('create'); setSelectedContactId(undefined) }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    contactMode === 'create'
                      ? 'bg-gradient-to-br from-emerald-600/40 to-teal-600/30 text-emerald-200 shadow-sm border border-emerald-500/30'
                      : 'text-t3 hover:text-t2'
                  }`}
                >
                  <UserPlus size={14} /> Novo contato
                </button>
              </div>

              {/* Search mode */}
              {contactMode === 'search' && (
                <div className="space-y-2">
                  {selectedContact ? (
                    <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-blue-500/10 to-blue-600/5 border border-blue-500/25 rounded-xl
                      animate-in fade-in zoom-in-95 duration-200">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br bg-blue-600/30 text-blue-100 border border-blue-500/30">
                        {selectedContact.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-t1 truncate">{selectedContact.name}</p>
                        <p className="text-xs text-t2">{formatPhone(selectedContact.phone)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={16} className="text-violet-400" />
                        <button
                          onClick={clearContact}
                          className="text-xs text-t3 hover:text-blue-300 px-2 py-1 rounded-lg hover:bg-blue-500/10 transition-all"
                        >
                          Trocar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-t2">Buscar contato *</label>
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-t3 pointer-events-none" />
                        <input
                          ref={searchRef}
                          value={contactQuery}
                          onChange={e => setContactQuery(e.target.value)}
                          autoFocus
                          placeholder="Nome ou telefone..."
                          className="w-full bg-s3/50 border border-line-input rounded-xl pl-9 pr-4 py-3 text-sm text-t1 placeholder:text-t4
                            focus:outline-none focus:border-violet-500/60 focus:bg-violet-500/5 focus:ring-1 focus:ring-violet-500/20 transition-all"
                        />
                      </div>

                      {contactQuery.length >= 1 && (
                        <div className="rounded-xl border border-line overflow-hidden bg-s2 animate-in fade-in slide-in-from-top-1 duration-150">
                          {contactResults.length === 0 ? (
                            <div className="flex flex-col items-center gap-2 py-6 px-4">
                              <p className="text-xs text-t3 text-center">Nenhum contato com "{contactQuery}"</p>
                              <button
                                onClick={() => { setContactMode('create'); setNewName(contactQuery) }}
                                className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/15 px-3 py-1.5 rounded-lg border border-emerald-500/20 transition-all"
                              >
                                <UserPlus size={12} /> Criar "{contactQuery}"
                              </button>
                            </div>
                          ) : (
                            <>
                              <p className="text-[10px] font-semibold text-t4 px-3 pt-2.5 pb-1 uppercase tracking-widest">
                                {contactResults.length} encontrado{contactResults.length > 1 ? 's' : ''}
                              </p>
                              <div className="max-h-52 overflow-y-auto">
                                {contactResults.map(c => (
                                  <button
                                    key={c.id}
                                    onClick={() => selectContact(c.id)}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-violet-500/12 text-left transition-all group border-t border-line first:border-0"
                                  >
                                    <div className="w-8 h-8 rounded-full bg-s3 group-hover:bg-blue-500/20 flex items-center justify-center text-xs font-bold text-t2 group-hover:text-blue-200 transition-all flex-shrink-0">
                                      {c.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-t1 group-hover:text-t1 truncate">{c.name}</p>
                                      <p className="text-xs text-t3">{formatPhone(c.phone)}</p>
                                    </div>
                                    <ChevronRight size={13} className="text-t4 group-hover:text-blue-400 flex-shrink-0 transition-colors" />
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                      {contactQuery.length === 0 && (
                        <p className="text-xs text-t4 text-center py-2">
                          {contacts.length} contatos disponíveis — comece a digitar
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Create mode */}
              {contactMode === 'create' && (
                <div className="space-y-3 animate-in fade-in slide-in-from-right-2 duration-200">
                  <div>
                    <label className="text-xs font-medium text-t2 mb-1.5 block">Nome completo *</label>
                    <div className="relative">
                      <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-t3" />
                      <input
                        autoFocus
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder="Nome do lead"
                        className="w-full bg-s3/50 border border-line-input rounded-xl pl-9 pr-4 py-3 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/20 transition-all"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-t2 mb-1.5 block">Telefone *</label>
                      <div className="relative">
                        <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-t3" />
                        <input
                          value={newPhone}
                          onChange={e => setNewPhone(formatPhoneInput(e.target.value))}
                          placeholder="(11) 99999-9999"
                          className={`w-full bg-s3/50 border rounded-xl pl-9 pr-3 py-3 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:ring-1 transition-all ${
                            duplicateContact
                              ? 'border-amber-500/60 focus:border-amber-500 focus:ring-amber-500/20 bg-amber-500/5'
                              : 'border-line-input focus:border-violet-500/60 focus:ring-violet-500/20'
                          }`}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-t2 mb-1.5 block">E-mail</label>
                      <div className="relative">
                        <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-t3" />
                        <input
                          value={newEmail}
                          onChange={e => setNewEmail(e.target.value)}
                          placeholder="email@..."
                          type="email"
                          className="w-full bg-s3/50 border border-line-input rounded-xl pl-9 pr-3 py-3 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/20 transition-all"
                        />
                      </div>
                    </div>
                  </div>
                  {duplicateContact && (
                    <div className="flex items-start gap-2.5 px-3 py-3 bg-amber-500/10 border border-amber-500/30 rounded-xl animate-in fade-in duration-200">
                      <AlertCircle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-amber-300">Telefone já cadastrado</p>
                        <p className="text-xs text-amber-400/70 mt-0.5">"{duplicateContact.name}"</p>
                      </div>
                      <button
                        onClick={() => { setContactMode('search'); setContactQuery(duplicateContact.name); setSelectedContactId(duplicateContact.id) }}
                        className="text-xs text-amber-300 hover:text-amber-100 bg-amber-500/20 hover:bg-amber-500/30 px-2.5 py-1.5 rounded-lg transition-all flex-shrink-0 font-medium"
                      >
                        Usar esse
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Campaign alert */}
              {campaignHit && (
                <div className="flex items-start gap-2.5 px-3 py-2.5 bg-orange-500/10 border border-orange-500/30 rounded-xl animate-in fade-in duration-200">
                  <AlertTriangle size={14} className="text-orange-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-orange-300">Já está em campanha</p>
                    <p className="text-xs text-orange-400/70 mt-0.5">Este número está em uma campanha de mensagens ativa.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ────── STEP 2: Funnel ────── */}
          {step === 2 && (
            <div className={`space-y-5 ${animDir === 'forward' ? 'animate-in fade-in slide-in-from-right-4' : 'animate-in fade-in slide-in-from-left-4'} duration-200`}>

              {/* Contact pill */}
              {(selectedContact || (isEdit && lead?.contactId)) && (() => {
                const c = selectedContact ?? (lead?.contactId ? getById(lead.contactId) : undefined)
                if (!c) return null
                return (
                  <div className="flex items-center gap-2.5 px-3 py-2.5 bg-s2/60 border border-line rounded-xl">
                    <div className="w-7 h-7 rounded-full bg-violet-500/25 flex items-center justify-center text-xs font-bold text-blue-200 flex-shrink-0">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-t3">Contato</p>
                      <p className="text-sm font-semibold text-t1 truncate">{c.name}</p>
                    </div>
                    <CheckCircle2 size={14} className="text-blue-400 flex-shrink-0" />
                  </div>
                )
              })()}

              {/* Campaign alert */}
              {campaignHit && (
                <div className="flex items-center gap-2 px-3 py-2 bg-orange-500/10 border border-orange-500/25 rounded-xl">
                  <AlertTriangle size={12} className="text-orange-400 flex-shrink-0" />
                  <p className="text-xs text-orange-300">Este contato está em uma campanha ativa.</p>
                </div>
              )}

              {/* Origem */}
              <div>
                <label className="text-xs font-semibold text-t2 mb-2 block uppercase tracking-wider">Origem</label>
                <div className="grid grid-cols-2 gap-2">
                  {ORIGINS.map(o => (
                    <button
                      key={o.value}
                      onClick={() => setOrigin(o.value)}
                      className={`relative flex items-center gap-2.5 px-3 py-3 rounded-xl border text-sm font-medium transition-all duration-200 overflow-hidden ${
                        origin === o.value
                          ? `bg-gradient-to-r ${o.grad} bg-opacity-20 border-white/30 text-white shadow-lg ring-2 ${o.ring}`
                          : 'bg-s2/60 border-line text-t3 hover:bg-s3 hover:text-t2 hover:border-line-strong'
                      }`}
                    >
                      <span className="text-lg leading-none">{o.emoji}</span>
                      <span>{o.label}</span>
                      {origin === o.value && (
                        <CheckCircle2 size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/70" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Produto */}
              <div>
                <label className="text-xs font-semibold text-t2 mb-2 block uppercase tracking-wider">Produto / Imóvel</label>

                {propertyMode === 'selected' && (
                  <div className="flex items-center gap-3 px-3 py-2.5 bg-gradient-to-r from-blue-500/10 to-blue-500/5 border border-blue-500/20 rounded-xl animate-in fade-in zoom-in-95 duration-150">
                    <Building2 size={14} className="text-blue-400 flex-shrink-0" />
                    <p className="flex-1 text-sm font-medium text-t1 truncate">{propertySearch}</p>
                    <button onClick={clearProperty} className="text-xs text-t3 hover:text-red-400 transition-colors px-2 py-0.5 rounded">Trocar</button>
                  </div>
                )}

                {propertyMode === 'free' && (
                  <div className="flex items-center gap-3 px-3 py-2.5 bg-gradient-to-r from-amber-500/10 to-orange-500/8 border border-amber-500/25 rounded-xl animate-in fade-in zoom-in-95 duration-150">
                    <PenLine size={14} className="text-amber-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-amber-400/70">Nome livre (não cadastrado)</p>
                      <p className="text-sm font-medium text-t1 truncate">{freePropertyName}</p>
                    </div>
                    <button onClick={clearProperty} className="text-xs text-t3 hover:text-red-400 transition-colors px-2 py-0.5 rounded">Trocar</button>
                  </div>
                )}

                {propertyMode === 'search' && (
                  <div className="space-y-1">
                    <div className="relative">
                      <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-t3" />
                      <input
                        value={propertySearch}
                        onChange={e => setPropertySearch(e.target.value)}
                        placeholder="Buscar no sistema ou digitar nome livre..."
                        className="w-full bg-s3/50 border border-line-input rounded-xl pl-9 pr-4 py-3 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/20 transition-all"
                      />
                    </div>
                    {propertySearch.length >= 1 && (
                      <div className="rounded-xl border border-line overflow-hidden bg-s2 animate-in fade-in slide-in-from-top-1 duration-150">
                        {filteredProperties.length > 0 ? (
                          <>
                            {filteredProperties.map(p => (
                              <button
                                key={p.id}
                                onClick={() => selectProperty(p.id)}
                                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-s3 text-left transition-all border-t border-line first:border-0 group"
                              >
                                <div>
                                  <p className="text-sm font-medium text-t1 group-hover:text-t1">{p.name}</p>
                                  <p className="text-xs text-t3">{p.neighborhood} · {p.kind === 'off_plan' ? 'Lançamento' : 'Pronto'}</p>
                                </div>
                                <span className="text-xs font-bold text-blue-400 ml-3 flex-shrink-0">{formatCurrencyFull(p.value)}</span>
                              </button>
                            ))}
                            <button
                              onClick={useFreeProperty}
                              className="w-full flex items-center gap-2 px-3 py-2.5 text-amber-400 hover:bg-amber-500/8 border-t border-line transition-all text-left"
                            >
                              <PenLine size={13} />
                              <span className="text-xs font-medium">Usar "{propertySearch}" como nome livre</span>
                            </button>
                          </>
                        ) : (
                          <div className="flex flex-col items-start gap-1 px-3 py-3">
                            <p className="text-xs text-t3">Nenhum imóvel cadastrado encontrado</p>
                            <button
                              onClick={useFreeProperty}
                              className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/15 px-3 py-1.5 rounded-lg border border-amber-500/20 transition-all mt-1"
                            >
                              <PenLine size={12} /> Usar "{propertySearch}" como nome livre
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {(propertyMode === 'selected' && propertyId) && (
                  <p className="text-xs text-blue-400 mt-1 flex items-center gap-1">
                    <MapPin size={9} /> Ticket preenchido automaticamente
                  </p>
                )}
              </div>

              {/* Ticket */}
              <div>
                <label className="text-xs font-semibold text-t2 mb-1.5 block uppercase tracking-wider">Ticket Médio (R$)</label>
                <div className="relative">
                  <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-t3" />
                  <input
                    value={averageTicket ? Number(averageTicket).toLocaleString('pt-BR') : ''}
                    onChange={e => handleAverageTicketChange(e.target.value)}
                    placeholder="0"
                    className="w-full bg-s3/50 border border-line-input rounded-xl pl-9 pr-4 py-3 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/20 transition-all"
                  />
                </div>
              </div>

              {/* Etapa */}
              <div>
                <label className="text-xs font-semibold text-t2 mb-2 block uppercase tracking-wider">Etapa do Funil</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {STAGES.map(s => (
                    <button
                      key={s.value}
                      onClick={() => setStage(s.value)}
                      className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-medium transition-all duration-200 ${
                        stage === s.value
                          ? `${s.active} shadow-sm scale-[1.02]`
                          : `bg-s2 border-line text-t3 hover:text-t2 hover:bg-s3`
                      }`}
                    >
                      <span className="text-base leading-none">{s.emoji}</span>
                      <span>{s.label}</span>
                    </button>
                  ))}
                </div>
                {stage === 'visita' && (
                  <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/25 rounded-xl animate-in fade-in duration-200">
                    <span className="text-sm">🏠</span>
                    <p className="text-xs text-amber-300 font-medium">Uma tarefa de visita será criada automaticamente e vai alimentar suas metas!</p>
                  </div>
                )}
              </div>

              {/* Data de entrada */}
              <div>
                <label className="text-xs font-semibold text-t2 mb-1.5 block uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar size={11} />
                  Data de entrada
                  {isRetroactive && (
                    <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded-full border border-blue-500/25">
                      Retroativo
                    </span>
                  )}
                </label>
                <input
                  type="date"
                  value={entryDate}
                  max={localDateStr()}
                  onChange={e => setEntryDate(e.target.value)}
                  className="w-full bg-s3/50 border border-line-input rounded-xl px-4 py-3 text-sm text-t1 focus:outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/20 transition-all"
                />
                {isRetroactive && (
                  <p className="text-xs text-blue-400 mt-1 flex items-center gap-1">
                    <Calendar size={10} /> Este lead será registrado com a data retroativa selecionada
                  </p>
                )}
              </div>

              {/* Notas */}
              <div>
                <label className="text-xs font-semibold text-t2 mb-1.5 block uppercase tracking-wider">Observações</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Informações adicionais sobre o lead..."
                  rows={3}
                  className="w-full bg-s3/50 border border-line-input rounded-xl px-4 py-3 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/20 transition-all resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-line bg-s2/50 flex-shrink-0">
          <button
            onClick={() => { if (step === 1 || isEdit) onClose(); else goBack() }}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm text-t2 hover:text-t1 hover:bg-s3 rounded-xl transition-all"
          >
            {step === 2 && !isEdit && <ChevronLeft size={14} />}
            {step === 1 || isEdit ? 'Cancelar' : 'Voltar'}
          </button>

          {step === 1 && !isEdit ? (
            <button
              onClick={goNext}
              disabled={!canAdvanceStep1()}
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold bg-gradient-to-r bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all shadow-lg shadow-blue-600/30 active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
            >
              Próximo <ChevronRight size={15} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              className={`flex items-center gap-2 px-6 py-2.5 text-sm font-bold rounded-xl transition-all shadow-lg active:scale-95 ${
                stage === 'venda'
                  ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white shadow-green-500/30'
                  : stage === 'visita'
                  ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-amber-500/30'
                  : 'bg-gradient-to-r bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30'
              }`}
            >
              {lead ? 'Salvar alterações' : isRetroactive ? '📅 Registrar lead' : '✨ Criar Lead'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
