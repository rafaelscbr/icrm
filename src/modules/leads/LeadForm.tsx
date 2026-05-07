import { useState, useEffect } from 'react'
import { X, User, Phone, Mail, MapPin, Building2, DollarSign, ChevronDown, Search } from 'lucide-react'
import { Lead, LeadOrigin, LeadFunnelStage } from '../../types'
import { useLeadsStore } from '../../store/useLeadsStore'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { formatCurrencyFull } from '../../lib/formatters'
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

interface LeadFormProps {
  isOpen: boolean
  onClose: () => void
  lead?: Lead
}

export function LeadForm({ isOpen, onClose, lead }: LeadFormProps) {
  const { add, update } = useLeadsStore()
  const { properties } = usePropertiesStore()

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [origin, setOrigin] = useState<LeadOrigin>('felicita')
  const [stage, setStage] = useState<LeadFunnelStage>('lead')
  const [propertySearch, setPropertySearch] = useState('')
  const [propertyId, setPropertyId] = useState<string | undefined>()
  const [averageTicket, setAverageTicket] = useState('')
  const [notes, setNotes] = useState('')
  const [showPropertySearch, setShowPropertySearch] = useState(false)

  useEffect(() => {
    if (lead) {
      setName(lead.name)
      setPhone(lead.phone)
      setEmail(lead.email ?? '')
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
      setName(''); setPhone(''); setEmail(''); setOrigin('felicita')
      setStage('lead'); setPropertyId(undefined); setAverageTicket('')
      setNotes(''); setPropertySearch('')
    }
  }, [lead, isOpen, properties])

  const filteredProperties = properties.filter(p =>
    p.name.toLowerCase().includes(propertySearch.toLowerCase()) ||
    p.neighborhood.toLowerCase().includes(propertySearch.toLowerCase())
  ).slice(0, 8)

  function selectProperty(id: string) {
    const p = properties.find(p => p.id === id)
    if (!p) return
    setPropertyId(id)
    setPropertySearch(p.name)
    setAverageTicket(String(p.value))
    setShowPropertySearch(false)
  }

  function clearProperty() {
    setPropertyId(undefined)
    setPropertySearch('')
  }

  function handlePhoneChange(v: string) {
    const digits = v.replace(/\D/g, '').slice(0, 11)
    let formatted = digits
    if (digits.length > 10) formatted = `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`
    else if (digits.length > 6) formatted = `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`
    else if (digits.length > 2) formatted = `(${digits.slice(0,2)}) ${digits.slice(2)}`
    setPhone(formatted)
  }

  function handleAverageTicketChange(v: string) {
    const digits = v.replace(/\D/g, '')
    setAverageTicket(digits ? String(Number(digits)) : '')
  }

  function handleSubmit() {
    if (!name.trim()) { toast.error('Nome é obrigatório'); return }
    if (!phone.trim()) { toast.error('Telefone é obrigatório'); return }

    const data = {
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || undefined,
      origin,
      funnelStage: stage,
      followupStep: lead?.followupStep ?? 0,
      discardReason: lead?.discardReason,
      discardedAt: lead?.discardedAt,
      propertyId: propertyId || undefined,
      averageTicket: averageTicket ? Number(averageTicket) : undefined,
      contactId: lead?.contactId,
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
      <div className="relative w-full max-w-lg bg-[#1A1D27] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 bg-gradient-to-r from-violet-500/10 to-purple-500/5">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              {lead ? 'Editar Lead' : 'Novo Lead'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Preencha os dados do lead para adicioná-lo ao funil</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/8 text-slate-500 hover:text-slate-200 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 overflow-y-auto max-h-[calc(90vh-120px)]">
          {/* Nome */}
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Nome *</label>
            <div className="relative">
              <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Nome completo"
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-violet-500/50 focus:bg-violet-500/5 transition-all"
              />
            </div>
          </div>

          {/* Telefone + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Telefone *</label>
              <div className="relative">
                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  value={phone}
                  onChange={e => handlePhoneChange(e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-violet-500/50 focus:bg-violet-500/5 transition-all"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">E-mail</label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="email@exemplo.com"
                  type="email"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-violet-500/50 focus:bg-violet-500/5 transition-all"
                />
              </div>
            </div>
          </div>

          {/* Origem */}
          <div>
            <label className="text-xs font-medium text-slate-400 mb-2 block">Origem</label>
            <div className="grid grid-cols-2 gap-2">
              {ORIGINS.map(o => (
                <button
                  key={o.value}
                  onClick={() => setOrigin(o.value)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all duration-150
                    ${origin === o.value
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
                onChange={e => { setPropertySearch(e.target.value); setShowPropertySearch(true); if (!e.target.value) clearProperty() }}
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
            <div className="relative">
              <select
                value={stage}
                onChange={e => setStage(e.target.value as LeadFunnelStage)}
                className="w-full appearance-none bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-violet-500/50 focus:bg-violet-500/5 transition-all cursor-pointer"
              >
                {STAGES.map(s => (
                  <option key={s.value} value={s.value} className="bg-[#1A1D27]">
                    {s.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
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
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/8 bg-white/2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 hover:bg-white/5 rounded-xl transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            className="px-5 py-2 text-sm font-medium bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-xl transition-all shadow-lg shadow-violet-500/20 active:scale-95"
          >
            {lead ? 'Salvar alterações' : 'Criar Lead'}
          </button>
        </div>
      </div>
    </div>
  )
}
