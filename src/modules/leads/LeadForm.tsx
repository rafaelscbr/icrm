import { useState, useEffect, useRef } from 'react'
import {
  UserPlus, AlertCircle, AlertTriangle,
  Sparkles, Smartphone, Globe, Handshake, Target, MessageCircle, PhoneCall, Home, FileText, Trophy,
} from 'lucide-react'
import { SidePanel } from '../../components/ui/SidePanel'
import { Button } from '../../components/ui/Button'
import { Lead, LeadOrigin, LeadFunnelStage } from '../../types'
import { useLeadsStore } from '../../store/useLeadsStore'
import { useContactsStore } from '../../store/useContactsStore'
import { useContactSearch, useContactByPhone } from '../../hooks/useContactSearch'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { useCampaignLeadsStore } from '../../store/useCampaignLeadsStore'
import { formatPhone, formatCurrencyFull, localDateStr } from '../../lib/formatters'
import toast from 'react-hot-toast'

// ─── Constantes ───────────────────────────────────────────────────────────────

const ORIGINS: { value: LeadOrigin; label: string; icon: typeof Sparkles; grad: string; ring: string }[] = [
  { value: 'felicita',  label: 'Felicità',  icon: Sparkles,   grad: 'bg-brand',   ring: 'ring-brand/30'   },
  { value: 'meta_ads',  label: 'Meta ADS',  icon: Smartphone, grad: 'from-blue-500 to-indigo-600',  ring: 'ring-info-line'   },
  { value: 'portal',    label: 'Portal',    icon: Globe,      grad: 'bg-info',    ring: 'ring-info-line'   },
  { value: 'offline',   label: 'Offline',   icon: Handshake,  grad: 'bg-warning', ring: 'ring-warning-line'  },
]

const STAGES: { value: LeadFunnelStage; label: string; icon: typeof Sparkles; color: string; active: string }[] = [
  { value: 'lead',        label: 'Lead',        icon: Target,        color: 'text-t3',  active: 'bg-slate-500/25 border-slate-400/50 text-t1' },
  { value: 'followup',    label: 'Followup',    icon: MessageCircle, color: 'text-info',   active: 'bg-info-bg border-info-line text-info'    },
  { value: 'atendimento', label: 'Atendimento', icon: PhoneCall,     color: 'text-brand-text', active: 'bg-brand-tint border-brand/25 text-brand-text'},
  { value: 'visita',      label: 'Visita',      icon: Home,          color: 'text-amber-400',  active: 'bg-amber-500/25 border-amber-400/50 text-amber-200'  },
  { value: 'proposta',    label: 'Proposta',    icon: FileText,      color: 'text-warning', active: 'bg-warning-bg border-warning-line text-warning'},
  { value: 'venda',       label: 'Venda',       icon: Trophy,        color: 'text-green-400',  active: 'bg-green-500/25 border-green-400/50 text-green-200'  },
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
  const { add: addContact, getById, mergeLocal } = useContactsStore()
  const { properties } = usePropertiesStore()
  const { leads: campaignLeads } = useCampaignLeadsStore()

  const isEdit = Boolean(lead)
  // v9 "folha limpa": uma página só (antes eram dois passos). Data de entrada
  // e observação ficam recolhidas — quase nunca mudam.
  const [maisDetalhes, setMaisDetalhes] = useState(false)

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
      setMaisDetalhes(Boolean(lead.notes))
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
      setAverageTicket(lead.averageTicket ? lead.averageTicket.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '')
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
      setMaisDetalhes(false)
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
  }, [isOpen, lead])  // eslint-disable-line react-hooks/exhaustive-deps -- campos semeados na abertura; properties muda com o realtime e reescreveria o que está sendo digitado

  // ─── Derived ──────────────────────────────────────────────────────────────────
  // Busca e dedupe vão ao BANCO. Antes varriam o array local, o que obrigava a
  // LeadsPage a baixar os 12.543 contatos (~7,7 MB) antes de abrir o formulário.
  const { resultados: contactResults } = useContactSearch(contactQuery, 8)

  const selectedContact = selectedContactId ? getById(selectedContactId) : undefined

  const newPhoneDigits   = newPhone.replace(/\D/g, '')
  const duplicateContact = useContactByPhone(newPhone) ?? undefined

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
    const c = contactResults.find(c => c.id === id)
    // O contato veio da busca no servidor e pode não estar no store — sem
    // isto, getById() devolveria undefined logo abaixo.
    if (c) mergeLocal([c])
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
    setAverageTicket(p.value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }))
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
    setAverageTicket(v.replace(/[^\d.,]/g, ''))
  }
  function handleAverageTicketBlur() {
    const raw = averageTicket.replace(/\./g, '').replace(',', '.')
    const n = parseFloat(raw) || 0
    setAverageTicket(n > 0 ? n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '')
  }

  function canAdvanceStep1() {
    if (contactMode === 'search') return Boolean(selectedContactId)
    return newName.trim().length > 0 && newPhoneDigits.length >= 10 && !duplicateContact
  }

  const [salvando, setSalvando] = useState(false)

  async function handleSubmit() {
    if (salvando) return
    if (!isEdit && !canAdvanceStep1()) {
      if (contactMode === 'search') toast.error('Escolha um contato da lista ou crie um novo')
      else if (duplicateContact) toast.error('Telefone já cadastrado — use o contato existente')
      else toast.error('Nome e telefone são obrigatórios')
      return
    }
    setSalvando(true)
    let resolvedContactId = selectedContactId
    if (!isEdit && contactMode === 'create') {
      // O contato precisa existir no banco antes do lead (FK contact_id).
      try {
        const nc = await addContact({ name: newName.trim(), phone: newPhone.trim(), tags: [], hasChildren: false, isMarried: false, permutaItems: [] })
        resolvedContactId = nc.id
      } catch {
        setSalvando(false)
        return  // erro já avisado pela camada db
      }
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
      averageTicket: averageTicket ? (parseFloat(averageTicket.replace(/\./g, '').replace(',', '.')) || undefined) : undefined,
      contactId: resolvedContactId,
      convertedAt: lead?.convertedAt,
      visitaTaskId: lead?.visitaTaskId,
      notes: notes.trim() || undefined,
    }

    try {
      if (lead) {
        await update(lead.id, { ...data, createdAt: entryDate + 'T12:00:00.000Z' })
        toast.success('Lead atualizado!')
      } else {
        await add({ ...data, createdAt: entryDate + 'T12:00:00.000Z' })
        if (isRetroactive) toast.success(`Lead registrado retroativamente para ${new Date(entryDate + 'T12:00:00').toLocaleDateString('pt-BR')}`)
        else toast.success('Lead criado!')
      }
      onClose()
    } catch { /* erro já toastado pela camada db — modal permanece aberto */ } finally {
      setSalvando(false)
    }
  }

  if (!isOpen) return null

  const pilula = (ativo: boolean) =>
    `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors cursor-pointer ${
      ativo ? 'bg-brand-fill text-brand-fill-text' : 'bg-s2 text-t2 hover:bg-s3'}`

  const contatoEdicao = isEdit && lead?.contactId ? getById(lead.contactId) : undefined
  const contatoPronto = selectedContact ?? contatoEdicao

  const footer = (
    <div className="flex items-center justify-end gap-2">
      <Button variant="ghost" onClick={onClose}>Cancelar</Button>
      <Button
        onClick={handleSubmit}
        variant={stage === 'venda' ? 'success' : 'primary'}
        disabled={!isEdit && !canAdvanceStep1()}
        carregando={salvando}
      >
        {lead ? 'Salvar alterações' : isRetroactive ? 'Registrar lead' : 'Criar lead'}
      </Button>
    </div>
  )

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Editar lead' : 'Novo lead'}
      size="md"
      footer={footer}
      confirmarSaida={!isEdit && !salvando && Boolean(selectedContactId || newName.trim() || newPhone.trim() || averageTicket || notes.trim() || propertyId || freePropertyName)}
    >
      <div className="flex flex-col gap-6">

        {/* ── Quem é — o título do formulário ─────────────────────────── */}
        {contatoPronto || (isEdit && lead) ? (
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="campo-titulo truncate">{contatoPronto?.name ?? lead?.name}</p>
              <p className="text-[13px] text-t3">{formatPhone(contatoPronto?.phone ?? lead?.phone ?? '')}</p>
            </div>
            {!isEdit && (
              <button onClick={clearContact} className="text-[13px] text-t3 hover:text-t1 px-2 py-1 rounded-lg hover:bg-s2 cursor-pointer">
                Trocar
              </button>
            )}
          </div>
        ) : contactMode === 'search' ? (
          <div className="flex flex-col gap-2">
            <input
              ref={searchRef}
              value={contactQuery}
              onChange={e => setContactQuery(e.target.value)}
              placeholder="Nome ou telefone do contato"
              aria-label="Buscar contato por nome ou telefone"
              // eslint-disable-next-line jsx-a11y/no-autofocus -- o painel abre para cadastrar: o cursor vai direto para a busca
              autoFocus
              className="campo-titulo campo-livre"
            />
            {contactQuery.length >= 1 && (
              <div className="flex flex-col animate-in fade-in duration-150">
                {contactResults.map(c => (
                  <button
                    key={c.id}
                    onClick={() => selectContact(c.id)}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-[10px] hover:bg-s2 text-left transition-colors cursor-pointer"
                  >
                    <span className="text-[14px] font-medium text-t1 truncate">{c.name}</span>
                    <span className="text-[12.5px] text-t4 tabular-nums flex-shrink-0">{formatPhone(c.phone)}</span>
                  </button>
                ))}
                <button
                  onClick={() => { setContactMode('create'); setNewName(contactQuery) }}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-[10px] hover:bg-s2 text-left text-[13.5px] text-t2 transition-colors cursor-pointer"
                >
                  <UserPlus size={14} aria-hidden /> Criar contato “{contactQuery}”
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3 animate-in fade-in duration-150">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Nome do contato"
              aria-label="Nome do contato"
              // eslint-disable-next-line jsx-a11y/no-autofocus -- veio do "Criar contato": o cursor continua no nome
              autoFocus
              className="campo-titulo campo-livre"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                inputMode="tel"
                aria-label="Telefone"
                aria-invalid={duplicateContact ? true : undefined}
                value={newPhone}
                onChange={e => setNewPhone(formatPhoneInput(e.target.value))}
                placeholder="Telefone"
                className="w-full px-3.5 py-2.5 min-h-[44px]"
              />
              <input
                type="email"
                aria-label="E-mail"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="E-mail (opcional)"
                className="w-full px-3.5 py-2.5 min-h-[44px]"
              />
            </div>
            {duplicateContact && (
              <p className="flex items-center gap-2 text-[13px] text-warning" role="alert">
                <AlertCircle size={14} aria-hidden />
                Telefone já é de “{duplicateContact.name}”.
                <button
                  onClick={() => { setContactMode('search'); setContactQuery(duplicateContact.name); setSelectedContactId(duplicateContact.id) }}
                  className="font-semibold underline underline-offset-2 cursor-pointer"
                >
                  Usar esse contato
                </button>
              </p>
            )}
            <button
              onClick={() => { setContactMode('search'); clearContact() }}
              className="self-start text-[13px] text-t3 hover:text-t1 cursor-pointer"
            >
              Buscar um contato existente
            </button>
          </div>
        )}

        {campaignHit && (
          <p className="flex items-center gap-2 text-[13px] text-warning -mt-3">
            <AlertTriangle size={14} aria-hidden /> Este número está numa campanha de mensagens ativa.
          </p>
        )}

        {/* ── Origem ───────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          <span id="grupo-origem-rotulo" className="rotulo-campo">Origem</span>
          <div role="radiogroup" aria-labelledby="grupo-origem-rotulo" className="flex flex-wrap gap-1.5">
            {ORIGINS.map(o => (
              <button key={o.value} role="radio" aria-checked={origin === o.value}
                onClick={() => setOrigin(o.value)} className={pilula(origin === o.value)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Etapa ────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          <span id="grupo-etapa-rotulo" className="rotulo-campo">Etapa</span>
          <div role="radiogroup" aria-labelledby="grupo-etapa-rotulo" className="flex flex-wrap gap-1.5">
            {STAGES.map(st => (
              <button key={st.value} role="radio" aria-checked={stage === st.value}
                onClick={() => setStage(st.value)} className={pilula(stage === st.value)}>
                <span className="w-2 h-2 rounded-full" style={{ background: `var(--stage-${st.value})` }} aria-hidden />
                {st.label}
              </button>
            ))}
          </div>
          {stage === 'visita' && (
            <p className="text-[12.5px] text-t3">Uma tarefa de visita é criada junto e conta para as suas metas.</p>
          )}
        </div>

        {/* ── Imóvel + ticket ──────────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          <span className="rotulo-campo">Imóvel de interesse</span>
          {propertyMode === 'search' ? (
            <>
              <input
                aria-label="Buscar imóvel ou digitar um nome"
                value={propertySearch}
                onChange={e => setPropertySearch(e.target.value)}
                placeholder="Buscar no sistema ou digitar um nome"
                className="w-full px-3.5 py-2.5 min-h-[44px]"
              />
              {propertySearch.length >= 1 && (
                <div className="flex flex-col animate-in fade-in duration-150">
                  {filteredProperties.map(p => (
                    <button key={p.id} onClick={() => selectProperty(p.id)}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-[10px] hover:bg-s2 text-left transition-colors cursor-pointer">
                      <span className="min-w-0">
                        <span className="block text-[14px] font-medium text-t1 truncate">{p.name}</span>
                        <span className="block text-[12px] text-t4">{p.neighborhood} · {p.kind === 'off_plan' ? 'Lançamento' : 'Pronto'}</span>
                      </span>
                      <span className="text-[12.5px] font-semibold text-t2 tabular-nums flex-shrink-0">{formatCurrencyFull(p.value)}</span>
                    </button>
                  ))}
                  <button onClick={useFreeProperty}
                    className="px-3 py-2.5 rounded-[10px] hover:bg-s2 text-left text-[13.5px] text-t2 transition-colors cursor-pointer">
                    Usar “{propertySearch}” sem cadastro
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-[10px] bg-s2">
              <span className="flex-1 min-w-0 text-[14px] font-medium text-t1 truncate">
                {propertyMode === 'selected' ? propertySearch : freePropertyName}
                {propertyMode === 'free' && <span className="text-t4 font-normal"> · sem cadastro</span>}
              </span>
              <button onClick={clearProperty} className="text-[13px] text-t3 hover:text-t1 cursor-pointer">Trocar</button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="lead-ticket" className="rotulo-campo">Ticket médio</label>
          <div className="relative flex items-center">
            <span className="absolute left-3.5 text-[13px] text-t4 select-none">R$</span>
            <input
              id="lead-ticket"
              type="text"
              inputMode="numeric"
              value={averageTicket}
              onChange={e => handleAverageTicketChange(e.target.value)}
              onBlur={handleAverageTicketBlur}
              placeholder="500.000"
              className="w-full pl-10 pr-4 py-2.5 min-h-[44px] tabular-nums"
            />
          </div>
          {propertyMode === 'selected' && propertyId && (
            <p className="text-[12px] text-t4">Preenchido com o valor do imóvel.</p>
          )}
        </div>

        {/* ── Mais detalhes ────────────────────────────────────────────── */}
        {!maisDetalhes ? (
          <button type="button" onClick={() => setMaisDetalhes(true)}
            className="self-start text-[13px] font-medium text-t3 hover:text-t1 cursor-pointer">
            + Mais detalhes <span className="text-t4">· data de entrada, observação</span>
          </button>
        ) : (
          <div className="flex flex-col gap-5 animate-in fade-in duration-150">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="lead-entry-date" className="rotulo-campo">
                Data de entrada{isRetroactive && <span className="text-info font-medium"> · retroativa</span>}
              </label>
              <input
                id="lead-entry-date"
                type="date"
                value={entryDate}
                max={localDateStr()}
                onChange={e => setEntryDate(e.target.value)}
                className="w-full px-3.5 py-2.5 min-h-[44px]"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="lead-obs" className="rotulo-campo">Observação</label>
              <textarea
                id="lead-obs"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Algo que vale lembrar sobre este lead"
                rows={3}
                className="w-full px-3.5 py-2.5 resize-none"
              />
            </div>
          </div>
        )}
      </div>
    </SidePanel>
  )
}
