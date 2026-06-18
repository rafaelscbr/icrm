import { useMemo, useState, useEffect } from 'react'
import {
  Phone, Building2, Cake, Heart, Baby, Tag, CheckCircle2,
  Clock, Circle, AlertTriangle, TrendingUp, MessageCircle,
  UserPlus, ArrowLeftRight, Pencil, Plus, X, Home, Bed, Square, Megaphone, Car,
} from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Badge } from '../../components/ui/Badge'
import { Avatar } from '../../components/ui/Avatar'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { Contact, ContactTag, PermutaItem } from '../../types'
import { STAGE_THEME } from '../../lib/stageTheme'
import { useTasksStore } from '../../store/useTasksStore'
import { useSalesStore } from '../../store/useSalesStore'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { useLeadsStore } from '../../store/useLeadsStore'
import { useContactsStore } from '../../store/useContactsStore'
import { formatPhone, formatDate, formatCurrencyFull, whatsappUrl } from '../../lib/formatters'
import { calcSaleCommissions } from '../../types'
import { LeadModal } from '../leads/LeadModal'
import { PropertyModal } from '../properties/PropertyModal'
import { ContactCampaignHistory } from '../lead-lists/ContactCampaignHistory'
import { ScoreBadge } from '../../components/ui/ScoreBadge'
import { fetchLeadScore, LeadScoreResult } from '../../lib/leadScore'

const TAG_LABELS: Record<ContactTag, string> = {
  owner:    'Proprietário',
  investor: 'Investidor',
  buyer:    'Já comprou',
}
const TAG_VARIANTS: Record<ContactTag, 'indigo' | 'purple' | 'green'> = {
  owner:    'indigo',
  investor: 'purple',
  buyer:    'green',
}

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  apartment:        'Apartamento',
  apartment_duplex: 'Apê Duplex',
  penthouse_duplex: 'Cobertura',
  house:            'Casa',
  commercial:       'Comercial',
  land:             'Terreno',
}

const CATEGORY_LABELS: Record<string, string> = {
  visita:              'Visita',
  agenciamento:        'Agenciamento',
  proposta:            'Proposta',
  busca_imovel:        'Busca Imóvel',
  campanhas:           'Campanhas',
  administrativo:      'Administrativo',
  prospeccao_imoveis:  'Prospecção',
  souza_financeiro:    'Souza Financeiro',
  outro:               'Outro',
}

const STATUS_CONFIG = {
  pending:   { icon: Circle,       color: 'text-brand',  label: 'Pendente'   },
  done:      { icon: CheckCircle2, color: 'text-green-400',   label: 'Concluída'  },
  cancelled: { icon: AlertTriangle,color: 'text-t3',   label: 'Cancelada'  },
}

function daysAgo(dateStr?: string): string | null {
  if (!dateStr) return null
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
  if (diff === 0) return 'hoje'
  if (diff === 1) return 'ontem'
  return `${diff} dias atrás`
}

interface ContactModalProps {
  contact: Contact | undefined
  isOpen: boolean
  onClose: () => void
}

// Tema das etapas vem da fonte única — mesma cor no kanban, modal e dashboard
const LEAD_STAGE_CONFIG = STAGE_THEME

export function ContactModal({ contact, isOpen, onClose }: ContactModalProps) {
  const { tasks }      = useTasksStore()
  const { sales }      = useSalesStore()
  const { properties } = usePropertiesStore()
  const { leads }      = useLeadsStore()
  const { update: updateContact } = useContactsStore()
  const [selectedLead, setSelectedLead] = useState<string | null>(null)
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null)
  const [score, setScore] = useState<LeadScoreResult | null>(null)

  useEffect(() => {
    if (!contact || !isOpen) return
    setScore(null)
    fetchLeadScore(contact.id, contact.phone).then(setScore).catch(() => {})
  }, [contact?.id, isOpen])

  // Permuta edit state
  const [editingPermuta, setEditingPermuta] = useState(false)
  const [permutaItems, setPermutaItems] = useState<PermutaItem[]>([])

  function openPermutaEdit() {
    if (!contact) return
    const existing = contact.permutaItems ?? []
    setPermutaItems(
      existing.length > 0
        ? existing
        : [{ id: `new-${Date.now()}`, type: 'imovel' }]
    )
    setEditingPermuta(true)
  }

  function savePermuta() {
    if (!contact) return
    const filled = permutaItems.filter(it =>
      it.type === 'imovel' ? (it.region || it.value) : (it.carModel || it.carValue)
    )
    updateContact(contact.id, { permutaItems: filled })
    setEditingPermuta(false)
  }

  function cancelPermuta() {
    setEditingPermuta(false)
  }

  function addPermutaItem() {
    setPermutaItems(prev => [...prev, { id: `new-${Date.now()}`, type: 'imovel' }])
  }

  function removePermutaItem(id: string) {
    setPermutaItems(prev => prev.filter(it => it.id !== id))
  }

  function updatePermutaItem(id: string, patch: Partial<PermutaItem>) {
    setPermutaItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it))
  }

  const linkedTasks = useMemo(
    () => contact ? tasks.filter(t => t.contactId === contact.id).sort((a, b) => {
      // Ordenação: pendentes primeiro (por dueDate), depois concluídas
      if (a.status === 'done' && b.status !== 'done') return 1
      if (a.status !== 'done' && b.status === 'done') return -1
      const aDate = a.dueDate ?? a.createdAt
      const bDate = b.dueDate ?? b.createdAt
      return aDate.localeCompare(bDate)
    }) : [],
    [contact, tasks]
  )

  const linkedSales = useMemo(
    () => contact ? sales.filter(s => s.clientId === contact.id).sort((a, b) => b.date.localeCompare(a.date)) : [],
    [contact, sales]
  )

  const ownedProperties = useMemo(
    () => contact ? properties.filter(p => p.ownerId === contact.id) : [],
    [contact, properties]
  )

  const activeLeads = useMemo(
    () => contact ? leads.filter(l => l.contactId === contact.id && !l.discardReason) : [],
    [contact, leads]
  )

  const totalSalesValue = linkedSales.reduce((a, s) => a + s.value, 0)
  const totalCommission = linkedSales.reduce((a, s) => a + calcSaleCommissions(s).brokerCommission, 0)

  if (!contact) return null

  const pendingTasks   = linkedTasks.filter(t => t.status === 'pending')
  const doneTasks      = linkedTasks.filter(t => t.status === 'done')
  const cancelledTasks = linkedTasks.filter(t => t.status === 'cancelled')

  return (
    <>
    <Modal isOpen={isOpen} onClose={onClose} title="Detalhes do contato" size="lg">
      <div className="flex flex-col gap-6">

        {/* Header do contato */}
        <div className="flex items-start gap-4 pb-4 border-b border-line">
          <Avatar name={contact.name} photoUrl={contact.photoUrl} size="lg" />
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-slate-100">{contact.name}</h2>
            {contact.company && (
              <div className="flex items-center gap-1.5 text-sm text-t3 mt-0.5">
                <Building2 size={12} />
                <span>{contact.company}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-sm text-t3 mt-0.5">
              <Phone size={12} />
              <span className="font-mono">{formatPhone(contact.phone)}</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {contact.tags.map(tag => (
                <Badge key={tag} variant={TAG_VARIANTS[tag]}>{TAG_LABELS[tag]}</Badge>
              ))}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            {score && <ScoreBadge size="md" {...score} />}
            <a
              href={whatsappUrl(contact.phone)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-500/15 hover:bg-green-500/25 text-green-400 text-xs font-medium border border-green-500/25 transition-all"
            >
              <MessageCircle size={13} /> WhatsApp
            </a>
          </div>
        </div>

        {/* Info pessoal */}
        {(contact.birthdate || contact.isMarried || contact.hasChildren) && (
          <div className="grid grid-cols-2 gap-3">
            {contact.birthdate && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-s2/50 rounded-xl border border-line">
                <Cake size={13} className="text-yellow-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] text-t3">Aniversário</p>
                  <p className="text-xs text-t1 font-medium">{formatDate(contact.birthdate)}</p>
                </div>
              </div>
            )}
            {contact.isMarried && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-s2/50 rounded-xl border border-line">
                <Heart size={13} className="text-pink-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] text-t3">Cônjuge</p>
                  <p className="text-xs text-t1 font-medium truncate">{contact.spouseName ?? 'Sim'}</p>
                </div>
              </div>
            )}
            {contact.hasChildren && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-s2/50 rounded-xl border border-line">
                <Baby size={13} className="text-cyan-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] text-t3">Filhos</p>
                  <p className="text-xs text-t1 font-medium truncate">{contact.childrenNames ?? 'Sim'}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Imóveis cadastrados */}
        {ownedProperties.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Home size={13} className="text-indigo-400" />
              <h3 className="text-sm font-semibold text-t2">Imóveis cadastrados</h3>
              <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/20 font-medium">
                {ownedProperties.length} imóvel{ownedProperties.length > 1 ? 'is' : ''}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {ownedProperties.map(prop => (
                <button
                  key={prop.id}
                  onClick={() => setSelectedPropertyId(prop.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 bg-s2/50 hover:bg-s3/50 border border-line hover:border-indigo-500/30 rounded-xl transition-all text-left group"
                >
                  {/* Thumbnail */}
                  <div className="w-14 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-s3/60 border border-line">
                    {prop.images[0] ? (
                      <img src={prop.images[0]} alt={prop.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Building2 size={18} className="text-t4" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-t1 truncate group-hover:text-white transition-colors">
                      {prop.name}
                    </p>
                    <p className="text-[11px] text-t3 truncate mt-0.5">
                      {PROPERTY_TYPE_LABELS[prop.type] ?? prop.type} · {prop.neighborhood}{prop.city ? ` · ${prop.city}` : ''}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {prop.bedrooms != null && (
                        <span className="flex items-center gap-0.5 text-[11px] text-t3">
                          <Bed size={9} /> {prop.bedrooms} dorm{prop.bedrooms !== 1 ? 's' : ''}
                        </span>
                      )}
                      {prop.areaSqm != null && (
                        <span className="flex items-center gap-0.5 text-[11px] text-t3">
                          <Square size={9} /> {prop.areaSqm}m²
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Valor + status */}
                  <div className="text-right flex-shrink-0 space-y-1">
                    <p className="text-xs font-bold text-slate-100 tabular-nums">{formatCurrencyFull(prop.value)}</p>
                    <StatusBadge status={prop.status} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Resumo financeiro (se tiver vendas) */}
        {linkedSales.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1 px-3 py-2.5 bg-green-500/8 rounded-xl border border-green-500/20">
              <p className="text-[11px] text-t3">Vendas</p>
              <p className="text-lg font-bold text-green-400 tabular-nums">{linkedSales.length}</p>
            </div>
            <div className="flex flex-col gap-1 px-3 py-2.5 bg-s3/50 rounded-xl border border-blue-500/20">
              <p className="text-[11px] text-t3">VGV gerado</p>
              <p className="text-sm font-bold text-blue-400 tabular-nums">{formatCurrencyFull(totalSalesValue)}</p>
            </div>
            <div className="flex flex-col gap-1 px-3 py-2.5 bg-violet-500/8 rounded-xl border border-violet-500/20">
              <p className="text-[11px] text-t3">Sua comissão</p>
              <p className="text-sm font-bold text-violet-400 tabular-nums">{formatCurrencyFull(totalCommission)}</p>
            </div>
          </div>
        )}

        {/* Histórico de vendas */}
        {linkedSales.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={13} className="text-green-400" />
              <h3 className="text-sm font-semibold text-t2">Histórico de vendas</h3>
            </div>
            <div className="flex flex-col gap-2">
              {linkedSales.map(sale => {
                const prop = properties.find(p => p.id === sale.propertyId)
                const { brokerCommission } = calcSaleCommissions(sale)
                return (
                  <div key={sale.id} className="flex items-center gap-3 px-3 py-2.5 bg-s2/50 rounded-xl border border-line">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-t1 truncate">{sale.propertyName}</p>
                      {prop && <p className="text-[11px] text-t3 truncate">{prop.neighborhood}{prop.city ? ` · ${prop.city}` : ''}</p>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-bold text-green-400">{formatCurrencyFull(sale.value)}</p>
                      {brokerCommission > 0 && (
                        <p className="text-[11px] text-violet-400">Comissão: {formatCurrencyFull(brokerCommission)}</p>
                      )}
                      <p className="text-[11px] text-t4">{formatDate(sale.date)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Leads no Funil */}
        {activeLeads.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <UserPlus size={13} className="text-violet-400" />
              <h3 className="text-sm font-semibold text-t2">Leads no Funil</h3>
              <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/20 font-medium">
                {activeLeads.length} ativo{activeLeads.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {activeLeads.map(lead => {
                const conf = LEAD_STAGE_CONFIG[lead.funnelStage]
                const prop = lead.propertyId ? properties.find(p => p.id === lead.propertyId) : undefined
                return (
                  <button
                    key={lead.id}
                    onClick={() => setSelectedLead(lead.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 bg-s2/50 hover:bg-s3/50 border border-line rounded-xl transition-all text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex text-[11px] font-medium px-1.5 py-0.5 rounded-full border ${conf.bg} ${conf.color} ${conf.border}`}>
                          {conf.label}
                          {lead.funnelStage === 'followup' && lead.followupStep > 0 && ` · ${lead.followupStep}ª msg`}
                        </span>
                      </div>
                      {prop && (
                        <p className="text-[11px] text-t3 mt-0.5 truncate flex items-center gap-1"><Home size={10} className="flex-shrink-0" /> {prop.name}</p>
                      )}
                      {lead.averageTicket && !prop && (
                        <p className="text-[11px] text-violet-400 mt-0.5">{formatCurrencyFull(lead.averageTicket)}</p>
                      )}
                    </div>
                    <p className="text-[11px] text-t4 flex-shrink-0">{formatDate(lead.createdAt)}</p>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Permuta */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <ArrowLeftRight size={13} className="text-amber-400" />
            <h3 className="text-sm font-semibold text-t2">Permuta</h3>
            {!editingPermuta && (
              (contact?.permutaItems?.length ?? 0) > 0 ? (
                <button
                  onClick={openPermutaEdit}
                  className="ml-auto flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-lg bg-s3/50 hover:bg-s3/70 border border-line text-t3 hover:text-t1 transition-all"
                >
                  <Pencil size={9} /> Editar
                </button>
              ) : (
                <button
                  onClick={openPermutaEdit}
                  className="ml-auto flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/20 text-amber-400 hover:text-amber-300 transition-all"
                >
                  <Plus size={9} /> Adicionar
                </button>
              )
            )}
          </div>

          {/* Visualização dos itens */}
          {!editingPermuta && (contact?.permutaItems?.length ?? 0) === 0 && (
            <p className="text-xs text-t4 text-center py-3">Sem informação de permuta</p>
          )}

          {!editingPermuta && (contact?.permutaItems?.length ?? 0) > 0 && (
            <div className="flex flex-col gap-2">
              {contact!.permutaItems.map(item => (
                <div key={item.id} className="flex items-start gap-2 px-3 py-2.5 bg-s2/50 rounded-xl border border-line">
                  <span className={`inline-flex self-start text-[11px] font-medium px-2 py-0.5 rounded-full border flex-shrink-0 ${
                    item.type === 'imovel'
                      ? 'bg-brand-tint text-brand-text border-indigo-500/25'
                      : 'bg-amber-500/15 text-amber-300 border-amber-500/25'
                  }`}>
                    {item.type === 'imovel'
                      ? <span className="flex items-center gap-1"><Home size={11} /> Imóvel</span>
                      : <span className="flex items-center gap-1"><Car size={11} /> Carro</span>}
                  </span>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    {item.type === 'imovel' && (
                      <>
                        {item.region && <p className="text-xs text-t3">Região: <span className="text-t1">{item.region}</span></p>}
                        {item.value && <p className="text-xs text-t3">Valor: <span className="text-t1 font-medium">{formatCurrencyFull(item.value)}</span></p>}
                      </>
                    )}
                    {item.type === 'carro' && (
                      <>
                        {item.carModel && <p className="text-xs text-t3">Modelo: <span className="text-t1">{item.carModel}</span></p>}
                        {item.carValue && <p className="text-xs text-t3">Valor: <span className="text-t1 font-medium">{formatCurrencyFull(item.carValue)}</span></p>}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Formulário de edição */}
          {editingPermuta && (
            <div className="space-y-3">
              {permutaItems.map((item, idx) => (
                <div key={item.id} className="bg-s2/50 border border-line rounded-xl p-3 space-y-2">
                  {/* Tipo */}
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5 flex-1">
                      {(['imovel', 'carro'] as const).map(t => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => updatePermutaItem(item.id, { type: t, region: undefined, value: undefined, carModel: undefined, carValue: undefined })}
                          className={`flex-1 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                            item.type === t
                              ? 'bg-brand-tint border-brand/40 text-brand-text'
                              : 'bg-s3/50 border-line text-t3 hover:text-t2'
                          }`}
                        >
                          {t === 'imovel'
                            ? <span className="flex items-center gap-1"><Home size={12} /> Imóvel</span>
                            : <span className="flex items-center gap-1"><Car size={12} /> Carro</span>}
                        </button>
                      ))}
                    </div>
                    {permutaItems.length > 1 && (
                      <button
                        onClick={() => removePermutaItem(item.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-500/8 hover:bg-red-500/15 border border-red-500/20 text-red-400 hover:text-red-300 transition-all flex-shrink-0"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>

                  {item.type === 'imovel' ? (
                    <div className="space-y-1.5">
                      <input
                        type="text"
                        aria-label="Região do imóvel de permuta"
                        value={item.region ?? ''}
                        onChange={e => updatePermutaItem(item.id, { region: e.target.value || undefined })}
                        placeholder="Região (ex: Balneário Camboriú)"
                        className="w-full bg-s3/50 border border-line rounded-xl px-3 py-2 text-sm text-slate-100 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-brand/25"
                      />
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-t3 pointer-events-none">R$</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          aria-label="Valor do imóvel de permuta"
                          value={item.value ? item.value.toLocaleString('pt-BR') : ''}
                          onChange={e => updatePermutaItem(item.id, { value: e.target.value.replace(/\D/g, '') ? Number(e.target.value.replace(/\D/g, '')) : undefined })}
                          placeholder="Valor do imóvel"
                          className="w-full bg-s3/50 border border-line rounded-xl pl-9 pr-3 py-2 text-sm text-slate-100 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-brand/25"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <input
                        type="text"
                        aria-label="Modelo do carro de permuta"
                        value={item.carModel ?? ''}
                        onChange={e => updatePermutaItem(item.id, { carModel: e.target.value || undefined })}
                        placeholder="Modelo (ex: Toyota Corolla 2022)"
                        className="w-full bg-s3/50 border border-line rounded-xl px-3 py-2 text-sm text-slate-100 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-brand/25"
                      />
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-t3 pointer-events-none">R$</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          aria-label="Valor de entrada do carro de permuta"
                          value={item.carValue ? item.carValue.toLocaleString('pt-BR') : ''}
                          onChange={e => updatePermutaItem(item.id, { carValue: e.target.value.replace(/\D/g, '') ? Number(e.target.value.replace(/\D/g, '')) : undefined })}
                          placeholder="Valor de entrada"
                          className="w-full bg-s3/50 border border-line rounded-xl pl-9 pr-3 py-2 text-sm text-slate-100 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-brand/25"
                        />
                      </div>
                    </div>
                  )}

                  {idx === permutaItems.length - 1 && (
                    <button
                      onClick={addPermutaItem}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-t3 hover:text-t2 border border-dashed border-line hover:border-white/22 rounded-lg transition-all"
                    >
                      <Plus size={10} /> Adicionar outro bem
                    </button>
                  )}
                </div>
              ))}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={cancelPermuta}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs text-t3 hover:text-t1 bg-s3/50 rounded-lg border border-line transition-all"
                >
                  <X size={11} /> Cancelar
                </button>
                <button
                  onClick={savePermuta}
                  className="flex-1 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all"
                >
                  Salvar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Histórico de tarefas */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Tag size={13} className="text-brand" />
              <h3 className="text-sm font-semibold text-t2">Tarefas vinculadas</h3>
            </div>
            <div className="flex gap-2 text-[11px]">
              {pendingTasks.length > 0 && (
                <span className="bg-brand-tint text-brand px-2 py-0.5 rounded-full font-medium border border-brand/25">
                  {pendingTasks.length} pendente{pendingTasks.length > 1 ? 's' : ''}
                </span>
              )}
              {doneTasks.length > 0 && (
                <span className="bg-green-500/10 text-green-500 px-2 py-0.5 rounded-full font-medium border border-green-500/15">
                  {doneTasks.length} concluída{doneTasks.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>

          {linkedTasks.length === 0 ? (
            <p className="text-xs text-t4 text-center py-4">Nenhuma tarefa vinculada ainda</p>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-1">
              {linkedTasks.map(task => {
                const cfg = STATUS_CONFIG[task.status]
                const Icon = cfg.icon
                const ago = task.status === 'done' ? daysAgo(task.completedAt) : daysAgo(task.dueDate ? task.dueDate + 'T23:59:59' : undefined)
                return (
                  <div
                    key={task.id}
                    className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border transition-all
                      ${task.status === 'done' ? 'bg-s2/30 border-line opacity-60' : 'bg-s2/50 border-line'}
                    `}
                  >
                    <Icon size={13} className={`${cfg.color} flex-shrink-0 mt-0.5`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium truncate ${task.status === 'done' ? 'line-through text-t3' : 'text-t1'}`}>
                        {task.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {task.category && (
                          <span className="text-[11px] text-t4">
                            {CATEGORY_LABELS[task.category] ?? task.category}
                          </span>
                        )}
                        {task.dueDate && (
                          <span className="text-[11px] text-t4 flex items-center gap-0.5">
                            <Clock size={8} /> {formatDate(task.dueDate)}
                          </span>
                        )}
                      </div>
                    </div>
                    {ago && (
                      <span className="text-[11px] text-t4 flex-shrink-0">{ago}</span>
                    )}
                  </div>
                )
              })}
              {cancelledTasks.length > 0 && (
                <p className="text-[11px] text-t5 text-center mt-1">
                  + {cancelledTasks.length} cancelada{cancelledTasks.length > 1 ? 's' : ''} (oculta{cancelledTasks.length > 1 ? 's' : ''})
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Base de Leads & Campanhas ── */}
        <div>
          <p className="text-xs font-bold text-t3 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Megaphone size={11} /> Base de Leads & Campanhas
          </p>
          <ContactCampaignHistory contactId={contact.id} />
        </div>

      </div>
    </Modal>

    {selectedLead && (() => {
      const lead = leads.find(l => l.id === selectedLead)
      return lead ? <LeadModal lead={lead} onClose={() => setSelectedLead(null)} /> : null
    })()}

    {selectedPropertyId && (() => {
      const prop = properties.find(p => p.id === selectedPropertyId)
      return prop ? (
        <PropertyModal
          property={prop}
          isOpen={true}
          onClose={() => setSelectedPropertyId(null)}
        />
      ) : null
    })()}
    </>
  )
}
