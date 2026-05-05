import { useMemo } from 'react'
import {
  MapPin, Bed, Bath, Square, DollarSign, BadgePercent,
  CheckCircle2, Circle, AlertTriangle, Clock, Building2, ImageOff, User,
} from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { StatusBadge } from '../../components/shared/StatusBadge'
import { Property } from '../../types'
import { useTasksStore } from '../../store/useTasksStore'
import { useContactsStore } from '../../store/useContactsStore'
import { useSalesStore } from '../../store/useSalesStore'
import { formatCurrencyFull, formatDate } from '../../lib/formatters'
import { calcSaleCommissions } from '../../types'

const TYPE_LABELS: Record<string, string> = {
  apartment:        'Apartamento',
  apartment_duplex: 'Apartamento Duplex',
  penthouse_duplex: 'Cobertura Duplex',
  house:            'Casa',
  commercial:       'Comercial',
  land:             'Terreno',
}

const CATEGORY_LABELS: Record<string, string> = {
  visita:             'Visita',
  agenciamento:       'Agenciamento',
  proposta:           'Proposta',
  busca_imovel:       'Busca Imóvel',
  campanhas:          'Campanhas',
  administrativo:     'Administrativo',
  prospeccao_imoveis: 'Prospecção',
  outro:              'Outro',
}

const STATUS_CONFIG = {
  pending:   { icon: Circle,        color: 'text-indigo-400', label: 'Pendente'  },
  done:      { icon: CheckCircle2,  color: 'text-green-400',  label: 'Concluída' },
  cancelled: { icon: AlertTriangle, color: 'text-slate-500',  label: 'Cancelada' },
}

function calcCommission(value: number) { return value * 0.05 * 0.10 }

interface PropertyModalProps {
  property: Property | undefined
  isOpen: boolean
  onClose: () => void
}

export function PropertyModal({ property, isOpen, onClose }: PropertyModalProps) {
  const { tasks }    = useTasksStore()
  const { contacts } = useContactsStore()
  const { sales }    = useSalesStore()

  const linkedTasks = useMemo(
    () => property ? tasks.filter(t => t.propertyId === property.id).sort((a, b) => {
      if (a.status === 'done' && b.status !== 'done') return 1
      if (a.status !== 'done' && b.status === 'done') return -1
      return (a.dueDate ?? a.createdAt).localeCompare(b.dueDate ?? b.createdAt)
    }) : [],
    [property, tasks]
  )

  const linkedSales = useMemo(
    () => property ? sales.filter(s => s.propertyId === property.id).sort((a, b) => b.date.localeCompare(a.date)) : [],
    [property, sales]
  )

  const owner = property?.ownerId ? contacts.find(c => c.id === property.ownerId) : undefined

  if (!property) return null

  const commission = calcCommission(property.value)
  const pendingTasks = linkedTasks.filter(t => t.status === 'pending')
  const doneTasks    = linkedTasks.filter(t => t.status === 'done')

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Detalhes do imóvel" size="lg">
      <div className="flex flex-col gap-6">

        {/* Imagem + header */}
        {property.images[0] && (
          <div className="w-full h-40 rounded-xl overflow-hidden -mt-1">
            <img src={property.images[0]} alt={property.name} className="w-full h-full object-cover" />
          </div>
        )}
        {!property.images[0] && (
          <div className="w-full h-28 rounded-xl bg-white/3 border border-white/8 flex items-center justify-center -mt-1">
            <ImageOff size={24} className="text-slate-600" />
          </div>
        )}

        <div className="flex items-start gap-3 -mt-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-slate-100">{property.name}</h2>
              {property.unit && (
                <span className="text-xs text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-md font-medium">
                  {property.unit}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
              <MapPin size={11} />
              <span>{TYPE_LABELS[property.type] ?? property.type} · {property.neighborhood}{property.city ? ` · ${property.city}` : ''}</span>
            </div>
            {property.address && (
              <p className="text-xs text-slate-500 mt-0.5">{property.address}{property.complement ? `, ${property.complement}` : ''}</p>
            )}
          </div>
          <StatusBadge status={property.status} />
        </div>

        {/* Specs + financeiro */}
        <div className="grid grid-cols-2 gap-3">
          {(property.bedrooms || property.suites || property.areaSqm) && (
            <div className="flex flex-col gap-2 px-3 py-3 bg-white/3 rounded-xl border border-white/5">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Características</p>
              <div className="flex flex-col gap-1">
                {property.bedrooms && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-300">
                    <Bed size={11} className="text-slate-500" />
                    {property.bedrooms} dormitório{property.bedrooms > 1 ? 's' : ''}
                  </div>
                )}
                {property.suites && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-300">
                    <Bath size={11} className="text-slate-500" />
                    {property.suites} suíte{property.suites > 1 ? 's' : ''}
                  </div>
                )}
                {property.areaSqm && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-300">
                    <Square size={11} className="text-slate-500" />
                    {property.areaSqm} m²
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2 px-3 py-3 bg-white/3 rounded-xl border border-white/5">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Financeiro</p>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-xs">
                <DollarSign size={11} className="text-emerald-400" />
                <span className="font-bold text-emerald-400">{formatCurrencyFull(property.value)}</span>
              </div>
              {property.condoFee && (
                <p className="text-xs text-slate-400">Cond: {formatCurrencyFull(property.condoFee)}/mês</p>
              )}
              <div className="flex items-center gap-1.5 text-xs text-violet-400">
                <BadgePercent size={11} />
                <span>Comissão: {formatCurrencyFull(commission)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Proprietário */}
        {owner && (
          <div className="flex items-center gap-3 px-3 py-2.5 bg-white/3 rounded-xl border border-white/5">
            <User size={13} className="text-indigo-400 flex-shrink-0" />
            <div>
              <p className="text-[10px] text-slate-500">Proprietário</p>
              <p className="text-xs font-medium text-slate-200">{owner.name}</p>
            </div>
          </div>
        )}

        {/* Notas */}
        {property.notes && (
          <div className="px-3 py-2.5 bg-white/3 rounded-xl border border-white/5">
            <p className="text-[10px] text-slate-500 mb-1">Observações</p>
            <p className="text-xs text-slate-300 leading-relaxed">{property.notes}</p>
          </div>
        )}

        {/* Vendas vinculadas */}
        {linkedSales.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Building2 size={13} className="text-green-400" />
              <h3 className="text-sm font-semibold text-slate-300">Vendas realizadas</h3>
              <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/15">
                {linkedSales.length}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {linkedSales.map(sale => {
                const client = contacts.find(c => c.id === sale.clientId)
                const { brokerCommission } = calcSaleCommissions(sale)
                return (
                  <div key={sale.id} className="flex items-center gap-3 px-3 py-2.5 bg-white/3 rounded-xl border border-white/5">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-200">{client?.name ?? '—'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-green-400">{formatCurrencyFull(sale.value)}</p>
                      {brokerCommission > 0 && (
                        <p className="text-[10px] text-violet-400">{formatCurrencyFull(brokerCommission)}</p>
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
              <Clock size={13} className="text-indigo-400" />
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
            <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1">
              {linkedTasks.map(task => {
                const cfg = STATUS_CONFIG[task.status]
                const Icon = cfg.icon
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
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </Modal>
  )
}
