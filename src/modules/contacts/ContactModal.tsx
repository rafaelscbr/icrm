import { useMemo, useState, useEffect } from 'react'
import {
  Building2, CheckCircle2, Circle, AlertTriangle, MessageCircle, PhoneCall, ClipboardList,
  Plus, X, Home, Car, ChevronRight, UserRound,
} from 'lucide-react'
import { FichaPainel, FichaBarraTopo, FichaNome, FichaAgora, FichaNumeros, FichaSecao } from '../../components/shared/Ficha'
import type { TomFicha } from '../../components/shared/Ficha'
import { Abas } from '../../components/shared/Abas'
import { Destaque } from '../../components/shared/Destaque'
import { TaskForm } from '../tasks/TaskForm'
import { Contact, ContactTag, PermutaItem } from '../../types'
import { STAGE_THEME } from '../../lib/stageTheme'
import { useTasksStore } from '../../store/useTasksStore'
import { useSalesStore } from '../../store/useSalesStore'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { useLeadsStore } from '../../store/useLeadsStore'
import { useContactsStore } from '../../store/useContactsStore'
import { formatPhone, formatDate, formatCurrency, formatCurrencyFull, whatsappUrl } from '../../lib/formatters'
import { calcSaleCommissions } from '../../types'
import { LeadModal } from '../leads/LeadModal'
import { PropertyModal } from '../properties/PropertyModal'
import { ContactCampaignHistory } from '../lead-lists/ContactCampaignHistory'
import { ScoreBadge } from '../../components/ui/ScoreBadge'
import { fetchLeadScore, LeadScoreResult } from '../../lib/leadScore'
import toast from 'react-hot-toast'

const TAG_LABELS: Record<ContactTag, string> = {
  owner:    'Proprietário',
  investor: 'Investidor',
  buyer:    'Já comprou',
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
  pending:   { icon: Circle,        color: 'text-t3',      label: 'Pendente'  },
  done:      { icon: CheckCircle2,  color: 'text-success', label: 'Concluída' },
  cancelled: { icon: AlertTriangle, color: 'text-t4',      label: 'Cancelada' },
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
  const [aba, setAba] = useState<'resumo' | 'negocios' | 'historico'>('resumo')
  const [novaTarefa, setNovaTarefa] = useState(false)

  useEffect(() => {
    if (!contact || !isOpen) return
    setScore(null)
    fetchLeadScore(contact.id, contact.phone).then(setScore).catch(() => {})
  }, [contact?.id, isOpen])  // eslint-disable-line react-hooks/exhaustive-deps -- estado semeado do contato aberto; incluir contact perderia a edição em andamento

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

  async function savePermuta() {
    if (!contact) return
    const filled = permutaItems.filter(it =>
      it.type === 'imovel' ? (it.region || it.value) : (it.carModel || it.carValue)
    )
    try {
      await updateContact(contact.id, { permutaItems: filled })
      toast.success('Permuta salva')
      setEditingPermuta(false)
    } catch { /* erro já avisado pela camada db — a edição continua aberta */ }
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

  if (!contact || !isOpen) return null

  const pendingTasks   = linkedTasks.filter(t => t.status === 'pending')
  const cancelledTasks = linkedTasks.filter(t => t.status === 'cancelled')
  const visiveis       = linkedTasks.filter(t => t.status !== 'cancelled')

  // ── O que fazer agora ─────────────────────────────────────────────────────
  const proxima = pendingTasks[0]
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const diasAte = proxima?.dueDate
    ? Math.round((new Date(proxima.dueDate + 'T00:00:00').getTime() - hoje.getTime()) / 86_400_000)
    : null
  const leadPrincipal = activeLeads[0]
  const agora: { tom: TomFicha; rotulo: string; texto: string; prazo?: string } =
    proxima
      ? { tom: diasAte !== null && diasAte < 0 ? 'risco' : diasAte === 0 ? 'atencao' : 'neutro',
          rotulo: 'Próxima tarefa', texto: proxima.title,
          prazo: diasAte === null ? undefined : diasAte < 0 ? `Atrasada ${-diasAte}d` : diasAte === 0 ? 'Hoje' : formatDate(proxima.dueDate!) }
      : leadPrincipal
        ? { tom: 'info', rotulo: `Lead em ${LEAD_STAGE_CONFIG[leadPrincipal.funnelStage].label}`,
            texto: 'Abra o lead para seguir o funil — a próxima ação está lá.' }
        : linkedSales.length > 0
          ? { tom: 'sucesso', rotulo: 'Cliente que já comprou', texto: 'Peça uma indicação ou apresente um produto novo.' }
          : { tom: 'atencao', rotulo: 'Sem próximo passo', texto: 'Mande uma mensagem para retomar o contato.' }

  const familia = [
    contact.birthdate ? `Aniversário em ${formatDate(contact.birthdate)}` : null,
    contact.isMarried ? (contact.spouseName ? `Casado(a) com ${contact.spouseName}` : 'Casado(a)') : null,
    contact.hasChildren ? (contact.childrenNames ? `Filhos: ${contact.childrenNames}` : 'Tem filhos') : null,
  ].filter(Boolean) as string[]

  const campoPermuta = 'campo w-full px-3.5 py-2.5 min-h-[44px]'

  return (
    <>
      <FichaPainel
        rotulo={`Contato ${contact.name}`}
        onClose={onClose}
        pausarEsc={novaTarefa || !!selectedLead || !!selectedPropertyId}
        topo={
          <>
            <FichaBarraTopo
              onClose={onClose}
              contexto={<><UserRound size={13} strokeWidth={1.8} aria-hidden />
                <span className="truncate">{contact.tags.length ? contact.tags.map(t => TAG_LABELS[t]).join(' · ') : 'Contato'}</span></>}
              acoes={score ? <span className="mr-1"><ScoreBadge size="sm" {...score} /></span> : undefined}
            />
            <FichaNome>{contact.name}</FichaNome>
            <div className="flex items-center gap-x-3 gap-y-1 mt-2 flex-wrap text-[14px]">
              <a href={`tel:${contact.phone}`} className="text-t2 hover:text-t1 tabular-nums">{formatPhone(contact.phone)}</a>
              {contact.company && <span className="text-t4">{contact.company}</span>}
            </div>
            <div className="mt-4 -mx-0 border-b border-line">
              <Abas
                rotulo="Seções do contato"
                variante="sublinhado"
                valor={aba}
                onChange={setAba}
                abas={[
                  { value: 'resumo'    as const, label: 'Resumo' },
                  { value: 'negocios'  as const, label: 'Negócios', badge: (activeLeads.length + ownedProperties.length + linkedSales.length) || undefined },
                  { value: 'historico' as const, label: 'Histórico', badge: visiveis.length || undefined },
                ]}
              />
            </div>
          </>
        }
      >
        {aba === 'resumo' && (
          <div className="flex flex-col gap-6">
            <FichaAgora tom={agora.tom} rotulo={agora.rotulo} prazo={agora.prazo} texto={agora.texto}>
              <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-2">
                <a href={whatsappUrl(contact.phone)} target="_blank" rel="noopener noreferrer" className="ficha-acao ficha-acao-zap">
                  <MessageCircle size={17} strokeWidth={2} aria-hidden /> WhatsApp
                </a>
                <a href={`tel:${contact.phone}`} className="ficha-acao">
                  <PhoneCall size={16} strokeWidth={1.9} aria-hidden /> Ligar
                </a>
                <button onClick={() => setNovaTarefa(true)} className="ficha-acao">
                  <ClipboardList size={16} strokeWidth={1.9} aria-hidden /> Tarefa
                </button>
              </div>
              {leadPrincipal && !proxima && (
                <button onClick={() => setSelectedLead(leadPrincipal.id)}
                  className="mt-2 w-full inline-flex items-center justify-center gap-1.5 h-10 rounded-[12px] text-[13.5px] font-semibold text-t1 hover:bg-surface">
                  Abrir o lead <ChevronRight size={15} strokeWidth={2} aria-hidden />
                </button>
              )}
            </FichaAgora>

            {linkedSales.length > 0 ? (
              <FichaNumeros itens={[
                { rotulo: 'Compras', valor: linkedSales.length },
                { rotulo: 'VGV', valor: formatCurrency(totalSalesValue) },
                { rotulo: 'Sua comissão', valor: formatCurrency(totalCommission), tom: 'sucesso' },
              ]} />
            ) : (
              <FichaNumeros itens={[
                { rotulo: 'Leads ativos', valor: activeLeads.length },
                { rotulo: 'Imóveis', valor: ownedProperties.length },
                { rotulo: 'Tarefas abertas', valor: pendingTasks.length, tom: pendingTasks.length > 0 ? 'atencao' : undefined },
              ]} />
            )}

            {familia.length > 0 && (
              <FichaSecao titulo={<>Para lembrar na <Destaque>conversa</Destaque></>}>
                <ul className="flex flex-col gap-1 text-[14px] text-t2">
                  {familia.map(f => <li key={f}>{f}</li>)}
                </ul>
              </FichaSecao>
            )}

            {/* Permuta */}
            <FichaSecao
              titulo="Permuta"
              acao={!editingPermuta && (
                <button onClick={openPermutaEdit} className="text-[13px] font-medium text-t3 hover:text-t1">
                  {(contact.permutaItems?.length ?? 0) > 0 ? 'Editar' : 'Adicionar'}
                </button>
              )}
            >
              {!editingPermuta && (contact.permutaItems?.length ?? 0) === 0 && (
                <p className="text-[13.5px] text-t4">Sem bens para permuta.</p>
              )}
              {!editingPermuta && (contact.permutaItems?.length ?? 0) > 0 && (
                <ul className="flex flex-col">
                  {contact.permutaItems.map(item => (
                    <li key={item.id} className="flex items-center gap-3 py-2">
                      {item.type === 'imovel'
                        ? <Home size={16} strokeWidth={1.8} className="text-t4 flex-shrink-0" aria-label="Imóvel" />
                        : <Car size={16} strokeWidth={1.8} className="text-t4 flex-shrink-0" aria-label="Carro" />}
                      <span className="flex-1 min-w-0 text-[14px] text-t2 truncate">
                        {item.type === 'imovel' ? (item.region ?? 'Imóvel') : (item.carModel ?? 'Carro')}
                      </span>
                      {(item.type === 'imovel' ? item.value : item.carValue) && (
                        <span className="text-[14px] font-semibold text-t1 tabular-nums">
                          {formatCurrencyFull((item.type === 'imovel' ? item.value : item.carValue)!)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {editingPermuta && (
                <div className="flex flex-col gap-4">
                  {permutaItems.map(item => (
                    <div key={item.id} className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1.5 flex-1" role="radiogroup" aria-label="Tipo do bem">
                          {(['imovel', 'carro'] as const).map(t => (
                            <button key={t} type="button" role="radio" aria-checked={item.type === t}
                              onClick={() => updatePermutaItem(item.id, { type: t, region: undefined, value: undefined, carModel: undefined, carValue: undefined })}
                              className={`px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors ${item.type === t ? 'bg-brand-fill text-brand-fill-text' : 'bg-s2 text-t2 hover:bg-s3'}`}>
                              {t === 'imovel' ? 'Imóvel' : 'Carro'}
                            </button>
                          ))}
                        </div>
                        {permutaItems.length > 1 && (
                          <button onClick={() => removePermutaItem(item.id)} aria-label="Remover este bem"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-t4 hover:text-error hover:bg-error-bg">
                            <X size={15} />
                          </button>
                        )}
                      </div>
                      {item.type === 'imovel' ? (
                        <div className="grid grid-cols-2 gap-2">
                          <input type="text" aria-label="Região do imóvel de permuta" value={item.region ?? ''}
                            onChange={e => updatePermutaItem(item.id, { region: e.target.value || undefined })}
                            placeholder="Região" className={campoPermuta} />
                          <input type="text" inputMode="numeric" aria-label="Valor do imóvel de permuta"
                            value={item.value ? `R$ ${item.value.toLocaleString('pt-BR')}` : ''}
                            onChange={e => updatePermutaItem(item.id, { value: e.target.value.replace(/\D/g, '') ? Number(e.target.value.replace(/\D/g, '')) : undefined })}
                            placeholder="R$ valor" className={`${campoPermuta} tabular-nums`} />
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          <input type="text" aria-label="Modelo do carro de permuta" value={item.carModel ?? ''}
                            onChange={e => updatePermutaItem(item.id, { carModel: e.target.value || undefined })}
                            placeholder="Modelo" className={campoPermuta} />
                          <input type="text" inputMode="numeric" aria-label="Valor de entrada do carro de permuta"
                            value={item.carValue ? `R$ ${item.carValue.toLocaleString('pt-BR')}` : ''}
                            onChange={e => updatePermutaItem(item.id, { carValue: e.target.value.replace(/\D/g, '') ? Number(e.target.value.replace(/\D/g, '')) : undefined })}
                            placeholder="R$ entrada" className={`${campoPermuta} tabular-nums`} />
                        </div>
                      )}
                    </div>
                  ))}
                  <button onClick={addPermutaItem} className="self-start inline-flex items-center gap-1.5 text-[13px] font-medium text-t3 hover:text-t1">
                    <Plus size={13} strokeWidth={2} aria-hidden /> Outro bem
                  </button>
                  <div className="flex justify-end gap-2">
                    <button onClick={cancelPermuta} className="h-9 px-3 rounded-[10px] text-[13.5px] text-t3 hover:text-t1 hover:bg-s2">Cancelar</button>
                    <button onClick={savePermuta} className="h-9 px-4 rounded-[10px] text-[13.5px] font-semibold bg-brand-fill text-brand-fill-text hover:bg-brand-fill-hover">Salvar permuta</button>
                  </div>
                </div>
              )}
            </FichaSecao>
          </div>
        )}

        {aba === 'negocios' && (
          <div className="flex flex-col gap-8">
            <FichaSecao titulo={<>Leads no <Destaque>funil</Destaque></>}>
              {activeLeads.length === 0 ? (
                <p className="text-[13.5px] text-t4">Nenhum lead ativo para este contato.</p>
              ) : (
                <ul className="flex flex-col">
                  {activeLeads.map(lead => {
                    const conf = LEAD_STAGE_CONFIG[lead.funnelStage]
                    const prop = lead.propertyId ? properties.find(p => p.id === lead.propertyId) : undefined
                    return (
                      <li key={lead.id}>
                        <button onClick={() => setSelectedLead(lead.id)} className="w-full flex items-center gap-3 py-2.5 text-left rounded-[10px] hover:bg-s2 -mx-2 px-2">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: conf.solidVar }} aria-hidden />
                          <span className="flex-1 min-w-0">
                            <span className="block text-[14px] font-semibold text-t1">{conf.label}{lead.funnelStage === 'followup' && lead.followupStep > 0 ? ` · ${lead.followupStep}ª msg` : ''}</span>
                            <span className="block text-[12.5px] text-t4 truncate">{prop?.name ?? (lead.averageTicket ? formatCurrencyFull(lead.averageTicket) : 'Sem imóvel')} · desde {formatDate(lead.createdAt)}</span>
                          </span>
                          <ChevronRight size={16} strokeWidth={1.8} className="text-t4" aria-hidden />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </FichaSecao>

            {ownedProperties.length > 0 && (
              <FichaSecao titulo="Imóveis dele">
                <ul className="flex flex-col">
                  {ownedProperties.map(prop => (
                    <li key={prop.id}>
                      <button onClick={() => setSelectedPropertyId(prop.id)} className="w-full flex items-center gap-3 py-2 text-left rounded-[10px] hover:bg-s2 -mx-2 px-2">
                        <span className="w-12 h-10 rounded-[10px] overflow-hidden bg-s2 flex-shrink-0 flex items-center justify-center">
                          {prop.thumbnail ? <img src={prop.thumbnail} alt="" className="w-full h-full object-cover" /> : <Building2 size={16} className="text-t4" />}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[14px] font-semibold text-t1 truncate">{prop.name}</span>
                          <span className="block text-[12.5px] text-t4 truncate">{PROPERTY_TYPE_LABELS[prop.type] ?? prop.type} · {prop.neighborhood}</span>
                        </span>
                        <span className="text-[14px] font-semibold text-t1 tabular-nums">{formatCurrency(prop.value)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </FichaSecao>
            )}

            {linkedSales.length > 0 && (
              <FichaSecao titulo={<>Compras <Destaque>fechadas</Destaque></>}>
                <ul className="flex flex-col">
                  {linkedSales.map(sale => {
                    const prop = properties.find(p => p.id === sale.propertyId)
                    const { brokerCommission } = calcSaleCommissions(sale)
                    return (
                      <li key={sale.id} className="flex items-center gap-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] text-t1 truncate">{sale.propertyName}</p>
                          <p className="text-[12.5px] text-t4 truncate">{formatDate(sale.date)}{prop ? ` · ${prop.neighborhood}` : ''}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[14px] font-semibold text-t1 tabular-nums">{formatCurrencyFull(sale.value)}</p>
                          {brokerCommission > 0 && <p className="text-[12.5px] text-success tabular-nums">{formatCurrencyFull(brokerCommission)}</p>}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </FichaSecao>
            )}
          </div>
        )}

        {aba === 'historico' && (
          <div className="flex flex-col gap-8">
            <FichaSecao titulo="Tarefas">
              {visiveis.length === 0 ? (
                <p className="text-[13.5px] text-t4">Nenhuma tarefa ligada a este contato.</p>
              ) : (
                <ul className="flex flex-col">
                  {visiveis.map(task => {
                    const cfg = STATUS_CONFIG[task.status]
                    const Icon = cfg.icon
                    const ago = task.status === 'done' ? daysAgo(task.completedAt) : daysAgo(task.dueDate ? task.dueDate + 'T23:59:59' : undefined)
                    return (
                      <li key={task.id} className={`flex items-start gap-3 py-2 ${task.status === 'done' ? 'opacity-60' : ''}`}>
                        <Icon size={16} strokeWidth={1.8} className={`${cfg.color} flex-shrink-0 mt-0.5`} aria-label={cfg.label} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-[14px] truncate ${task.status === 'done' ? 'line-through text-t3' : 'text-t1'}`}>{task.title}</p>
                          <p className="text-[12.5px] text-t4">
                            {[task.category ? (CATEGORY_LABELS[task.category] ?? task.category) : null, task.dueDate ? formatDate(task.dueDate) : null].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        {ago && <span className="text-[12.5px] text-t4 flex-shrink-0">{ago}</span>}
                      </li>
                    )
                  })}
                </ul>
              )}
              {cancelledTasks.length > 0 && (
                <p className="text-[12.5px] text-t4 mt-1">+ {cancelledTasks.length} cancelada{cancelledTasks.length > 1 ? 's' : ''}</p>
              )}
            </FichaSecao>

            <FichaSecao titulo="Listas e campanhas">
              <ContactCampaignHistory contactId={contact.id} />
            </FichaSecao>
          </div>
        )}
      </FichaPainel>

      {novaTarefa && <TaskForm isOpen onClose={() => setNovaTarefa(false)} defaultContactId={contact.id} />}

      {selectedLead && (() => {
        const lead = leads.find(l => l.id === selectedLead)
        return lead ? <LeadModal lead={lead} onClose={() => setSelectedLead(null)} /> : null
      })()}

      {selectedPropertyId && (() => {
        const prop = properties.find(p => p.id === selectedPropertyId)
        return prop ? (
          <PropertyModal property={prop} isOpen={true} onClose={() => setSelectedPropertyId(null)} />
        ) : null
      })()}
    </>
  )
}
