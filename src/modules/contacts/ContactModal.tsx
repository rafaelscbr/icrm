import { useMemo } from 'react'
import {
  Phone, Building2, Cake, Heart, Baby, Tag, CheckCircle2,
  Clock, Circle, AlertTriangle, TrendingUp, MessageCircle,
} from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Badge } from '../../components/ui/Badge'
import { Avatar } from '../../components/ui/Avatar'
import { Contact, ContactTag } from '../../types'
import { useTasksStore } from '../../store/useTasksStore'
import { useSalesStore } from '../../store/useSalesStore'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { formatPhone, formatDate, formatCurrencyFull, whatsappUrl } from '../../lib/formatters'
import { calcSaleCommissions } from '../../types'

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

const CATEGORY_LABELS: Record<string, string> = {
  visita:              'Visita',
  agenciamento:        'Agenciamento',
  proposta:            'Proposta',
  busca_imovel:        'Busca Imóvel',
  campanhas:           'Campanhas',
  administrativo:      'Administrativo',
  prospeccao_imoveis:  'Prospecção',
  outro:               'Outro',
}

const STATUS_CONFIG = {
  pending:   { icon: Circle,       color: 'text-indigo-400',  label: 'Pendente'   },
  done:      { icon: CheckCircle2, color: 'text-green-400',   label: 'Concluída'  },
  cancelled: { icon: AlertTriangle,color: 'text-slate-500',   label: 'Cancelada'  },
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

export function ContactModal({ contact, isOpen, onClose }: ContactModalProps) {
  const { tasks }      = useTasksStore()
  const { sales }      = useSalesStore()
  const { properties } = usePropertiesStore()

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

  const totalSalesValue = linkedSales.reduce((a, s) => a + s.value, 0)
  const totalCommission = linkedSales.reduce((a, s) => a + calcSaleCommissions(s).brokerCommission, 0)

  if (!contact) return null

  const pendingTasks   = linkedTasks.filter(t => t.status === 'pending')
  const doneTasks      = linkedTasks.filter(t => t.status === 'done')
  const cancelledTasks = linkedTasks.filter(t => t.status === 'cancelled')

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Detalhes do contato" size="lg">
      <div className="flex flex-col gap-6">

        {/* Header do contato */}
        <div className="flex items-start gap-4 pb-4 border-b border-white/8">
          <Avatar name={contact.name} photoUrl={contact.photoUrl} size="lg" />
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-slate-100">{contact.name}</h2>
            {contact.company && (
              <div className="flex items-center gap-1.5 text-sm text-slate-400 mt-0.5">
                <Building2 size={12} />
                <span>{contact.company}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-sm text-slate-400 mt-0.5">
              <Phone size={12} />
              <span className="font-mono">{formatPhone(contact.phone)}</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {contact.tags.map(tag => (
                <Badge key={tag} variant={TAG_VARIANTS[tag]}>{TAG_LABELS[tag]}</Badge>
              ))}
            </div>
          </div>
          <a
            href={whatsappUrl(contact.phone)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-500/15 hover:bg-green-500/25 text-green-400 text-xs font-medium border border-green-500/25 transition-all"
          >
            <MessageCircle size={13} /> WhatsApp
          </a>
        </div>

        {/* Info pessoal */}
        {(contact.birthdate || contact.isMarried || contact.hasChildren) && (
          <div className="grid grid-cols-2 gap-3">
            {contact.birthdate && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-white/3 rounded-xl border border-white/5">
                <Cake size={13} className="text-yellow-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-slate-500">Aniversário</p>
                  <p className="text-xs text-slate-200 font-medium">{formatDate(contact.birthdate)}</p>
                </div>
              </div>
            )}
            {contact.isMarried && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-white/3 rounded-xl border border-white/5">
                <Heart size={13} className="text-pink-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-slate-500">Cônjuge</p>
                  <p className="text-xs text-slate-200 font-medium truncate">{contact.spouseName ?? 'Sim'}</p>
                </div>
              </div>
            )}
            {contact.hasChildren && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-white/3 rounded-xl border border-white/5">
                <Baby size={13} className="text-cyan-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-slate-500">Filhos</p>
                  <p className="text-xs text-slate-200 font-medium truncate">{contact.childrenNames ?? 'Sim'}</p>
                </div>
              </div>
            )}
            {ownedProperties.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-white/3 rounded-xl border border-white/5">
                <Building2 size={13} className="text-indigo-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] text-slate-500">Imóveis próprios</p>
                  <p className="text-xs text-slate-200 font-medium">{ownedProperties.length} imóvel{ownedProperties.length > 1 ? 's' : ''}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Resumo financeiro (se tiver vendas) */}
        {linkedSales.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1 px-3 py-2.5 bg-green-500/8 rounded-xl border border-green-500/20">
              <p className="text-[10px] text-slate-500">Vendas</p>
              <p className="text-lg font-bold text-green-400 tabular-nums">{linkedSales.length}</p>
            </div>
            <div className="flex flex-col gap-1 px-3 py-2.5 bg-blue-500/8 rounded-xl border border-blue-500/20">
              <p className="text-[10px] text-slate-500">VGV gerado</p>
              <p className="text-sm font-bold text-blue-400 tabular-nums">{formatCurrencyFull(totalSalesValue)}</p>
            </div>
            <div className="flex flex-col gap-1 px-3 py-2.5 bg-violet-500/8 rounded-xl border border-violet-500/20">
              <p className="text-[10px] text-slate-500">Sua comissão</p>
              <p className="text-sm font-bold text-violet-400 tabular-nums">{formatCurrencyFull(totalCommission)}</p>
            </div>
          </div>
        )}

        {/* Histórico de vendas */}
        {linkedSales.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={13} className="text-green-400" />
              <h3 className="text-sm font-semibold text-slate-300">Histórico de vendas</h3>
            </div>
            <div className="flex flex-col gap-2">
              {linkedSales.map(sale => {
                const prop = properties.find(p => p.id === sale.propertyId)
                const { brokerCommission } = calcSaleCommissions(sale)
                return (
                  <div key={sale.id} className="flex items-center gap-3 px-3 py-2.5 bg-white/3 rounded-xl border border-white/5">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-200 truncate">{sale.propertyName}</p>
                      {prop && <p className="text-[10px] text-slate-500 truncate">{prop.neighborhood}{prop.city ? ` · ${prop.city}` : ''}</p>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-bold text-green-400">{formatCurrencyFull(sale.value)}</p>
                      {brokerCommission > 0 && (
                        <p className="text-[10px] text-violet-400">Comissão: {formatCurrencyFull(brokerCommission)}</p>
                      )}
                      <p className="text-[10px] text-slate-600">{formatDate(sale.date)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Histórico de tarefas */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Tag size={13} className="text-indigo-400" />
              <h3 className="text-sm font-semibold text-slate-300">Tarefas vinculadas</h3>
            </div>
            <div className="flex gap-2 text-[10px]">
              {pendingTasks.length > 0 && (
                <span className="bg-indigo-500/15 text-indigo-400 px-2 py-0.5 rounded-full font-medium border border-indigo-500/20">
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
            <p className="text-xs text-slate-600 text-center py-4">Nenhuma tarefa vinculada ainda</p>
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
                      ${task.status === 'done' ? 'bg-white/2 border-white/5 opacity-60' : 'bg-white/3 border-white/8'}
                    `}
                  >
                    <Icon size={13} className={`${cfg.color} flex-shrink-0 mt-0.5`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium truncate ${task.status === 'done' ? 'line-through text-slate-400' : 'text-slate-200'}`}>
                        {task.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {task.category && (
                          <span className="text-[10px] text-slate-600">
                            {CATEGORY_LABELS[task.category] ?? task.category}
                          </span>
                        )}
                        {task.dueDate && (
                          <span className="text-[10px] text-slate-600 flex items-center gap-0.5">
                            <Clock size={8} /> {formatDate(task.dueDate)}
                          </span>
                        )}
                      </div>
                    </div>
                    {ago && (
                      <span className="text-[10px] text-slate-600 flex-shrink-0">{ago}</span>
                    )}
                  </div>
                )
              })}
              {cancelledTasks.length > 0 && (
                <p className="text-[10px] text-slate-700 text-center mt-1">
                  + {cancelledTasks.length} cancelada{cancelledTasks.length > 1 ? 's' : ''} (oculta{cancelledTasks.length > 1 ? 's' : ''})
                </p>
              )}
            </div>
          )}
        </div>

      </div>
    </Modal>
  )
}
