import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2, Circle, AlertTriangle, Building2, MessageCircle, ClipboardList,
} from 'lucide-react'
import { FichaPainel, FichaBarraTopo, FichaNome, FichaAgora, FichaNumeros, FichaSecao } from '../../components/shared/Ficha'
import type { TomFicha } from '../../components/shared/Ficha'
import { Destaque } from '../../components/shared/Destaque'
import { TaskForm } from '../tasks/TaskForm'
import { Property } from '../../types'
import { useTasksStore } from '../../store/useTasksStore'
import { useContactsStore } from '../../store/useContactsStore'
import { useSalesStore } from '../../store/useSalesStore'
import { useAuthStore } from '../../store/useAuthStore'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { formatCurrency, formatCurrencyFull, formatDate, formatPhone, whatsappUrl } from '../../lib/formatters'
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
  souza_financeiro:   'Souza Financeiro',
  outro:              'Outro',
}

const STATUS_CONFIG = {
  pending:   { icon: Circle,        color: 'text-t3',      label: 'Pendente'  },
  done:      { icon: CheckCircle2,  color: 'text-success', label: 'Concluída' },
  cancelled: { icon: AlertTriangle, color: 'text-t4',      label: 'Cancelada' },
}

const PRECO: Record<string, { label: string; cor: string }> = {
  opportunity:  { label: 'Oportunidade',     cor: 'text-success' },
  market_price: { label: 'Preço de mercado', cor: 'text-t3' },
  above_market: { label: 'Acima do mercado', cor: 'text-error' },
}

function calcCommission(value: number) { return value * 0.05 * 0.10 }

interface PropertyModalProps {
  property: Property | undefined
  isOpen: boolean
  onClose: () => void
}

export function PropertyModal({ property, isOpen, onClose }: PropertyModalProps) {
  const { tasks }    = useTasksStore()
  const { contacts, loadByIds: loadContactsByIds } = useContactsStore()
  const { sales }    = useSalesStore()
  const { isAdmin }  = useAuthStore()
  const loadImages   = usePropertiesStore(s => s.loadImages)
  const [novaTarefa, setNovaTarefa] = useState(false)
  // A listagem baixa só a thumbnail — as fotos completas vêm sob demanda ao
  // abrir o detalhe. Lê do store (não do prop) para re-renderizar quando chegam.
  const fullImages   = usePropertiesStore(
    s => property ? s.properties.find(p => p.id === property.id)?.images : undefined
  )

  useEffect(() => {
    if (!isOpen || !property) return
    loadImages(property.id).catch(err => console.error('[PropertyModal] loadImages:', err))
  }, [isOpen, property?.id])  // eslint-disable-line react-hooks/exhaustive-deps -- fotos carregadas na abertura do imóvel escolhido

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

  // Os clientes das vendas vinculadas NÃO estão cobertos pelo loadByIds da
  // PropertiesPage (que carrega só os proprietários). Sem isto, o nome do
  // cliente de cada venda apareceria como "—" agora que o store deixou de
  // manter os 12.543 contatos em memória.
  useEffect(() => {
    const ids = linkedSales.map(s => s.clientId).filter(Boolean)
    if (ids.length > 0) loadContactsByIds(ids)
  }, [linkedSales]) // eslint-disable-line react-hooks/exhaustive-deps

  const owner = property?.ownerId ? contacts.find(c => c.id === property.ownerId) : undefined

  if (!property || !isOpen) return null

  const commission   = calcCommission(property.value)
  const pendingTasks = linkedTasks.filter(t => t.status === 'pending')
  const foto         = fullImages?.[0] ?? property.thumbnail
  const preco        = PRECO[property.status]

  // ── O que fazer agora ─────────────────────────────────────────────────────
  const proxima = pendingTasks[0]
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const diasAte = proxima?.dueDate
    ? Math.round((new Date(proxima.dueDate + 'T00:00:00').getTime() - hoje.getTime()) / 86_400_000)
    : null
  const agora: { tom: TomFicha; rotulo: string; texto: string; prazo?: string } =
    linkedSales.length > 0
      ? { tom: 'sucesso', rotulo: 'Imóvel vendido',
          texto: `Vendido em ${formatDate(linkedSales[0].date)}. Peça indicação ao comprador.` }
      : proxima
        ? { tom: diasAte !== null && diasAte < 0 ? 'risco' : diasAte === 0 ? 'atencao' : 'neutro',
            rotulo: 'Próxima tarefa', texto: proxima.title,
            prazo: diasAte === null ? undefined : diasAte < 0 ? `Atrasada ${-diasAte}d` : diasAte === 0 ? 'Hoje' : formatDate(proxima.dueDate!) }
        : property.status === 'opportunity'
          ? { tom: 'info', rotulo: 'Sem próximo passo', texto: 'Preço de oportunidade — apresente aos leads com esse perfil.' }
          : property.status === 'above_market'
            ? { tom: 'atencao', rotulo: 'Sem próximo passo', texto: 'Acima do mercado — alinhe o valor com o proprietário.' }
            : { tom: 'atencao', rotulo: 'Sem próximo passo', texto: 'Agende uma visita ou divulgação para o imóvel girar.' }

  const specs = [
    property.bedrooms ? `${property.bedrooms} dorm${property.bedrooms > 1 ? 's' : ''}` : null,
    property.suites ? `${property.suites} suíte${property.suites > 1 ? 's' : ''}` : null,
    property.areaSqm ? `${property.areaSqm} m²` : null,
  ].filter(Boolean).join(' · ')

  return (
    <>
      <FichaPainel
        rotulo={`Imóvel ${property.name}`}
        onClose={onClose}
        pausarEsc={novaTarefa}
        topo={
          <>
            <FichaBarraTopo
              onClose={onClose}
              contexto={<><Building2 size={13} strokeWidth={1.8} aria-hidden />
                <span className="truncate">{TYPE_LABELS[property.type] ?? property.type} · {property.kind === 'off_plan' ? 'Lançamento' : 'Pronto'}</span></>}
            />
            <FichaNome>{property.name}</FichaNome>
            <div className="flex items-center gap-x-3 gap-y-1 mt-2 flex-wrap text-[14px]">
              <span className="text-t2">{property.neighborhood}{property.city ? `, ${property.city}` : ''}</span>
              {property.unit && <span className="text-t4">{property.unit}</span>}
              {preco && <span className={`font-semibold ${preco.cor}`}>{preco.label}</span>}
            </div>
            <div className="h-5" />
          </>
        }
      >
        <div className="flex flex-col gap-6">
          {foto && (
            <div className="rounded-[16px] overflow-hidden bg-s2 aspect-[16/9]">
              <img src={foto} alt={property.name} className="w-full h-full object-cover" />
            </div>
          )}

          <FichaAgora tom={agora.tom} rotulo={agora.rotulo} prazo={agora.prazo} texto={agora.texto}>
            <div className={`grid gap-2 ${isAdmin && owner?.phone ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <button onClick={() => setNovaTarefa(true)} className="ficha-acao">
                <ClipboardList size={16} strokeWidth={1.9} aria-hidden /> Nova tarefa
              </button>
              {isAdmin && owner?.phone && (
                <button onClick={() => window.open(whatsappUrl(owner.phone), '_blank')} className="ficha-acao ficha-acao-zap">
                  <MessageCircle size={17} strokeWidth={2} aria-hidden /> Proprietário
                </button>
              )}
            </div>
          </FichaAgora>

          <FichaNumeros itens={[
            { rotulo: property.kind === 'off_plan' ? 'Ticket médio' : 'Valor', valor: formatCurrency(property.value) },
            { rotulo: 'Comissão', valor: formatCurrency(commission), tom: 'sucesso' },
            property.condoFee
              ? { rotulo: 'Condomínio', valor: formatCurrency(property.condoFee) }
              : { rotulo: 'Área', valor: property.areaSqm ? `${property.areaSqm} m²` : '—' },
          ]} />

          {(specs || property.address) && (
            <div className="text-[14px] text-t2 leading-relaxed">
              {specs && <p>{specs}</p>}
              {property.address && <p className="text-t4">{property.address}{property.complement ? `, ${property.complement}` : ''}</p>}
            </div>
          )}

          {isAdmin && owner && (
            <FichaSecao titulo="Proprietário">
              <p className="text-[14.5px] font-semibold text-t1">{owner.name}</p>
              {owner.phone && <p className="text-[13.5px] text-t4 tabular-nums">{formatPhone(owner.phone)}</p>}
            </FichaSecao>
          )}

          {property.notes && (
            <FichaSecao titulo="Observações">
              <p className="text-[14px] text-t2 leading-relaxed whitespace-pre-wrap">{property.notes}</p>
            </FichaSecao>
          )}

          {linkedSales.length > 0 && (
            <FichaSecao titulo={<>Vendas <Destaque>fechadas</Destaque></>}>
              <ul className="flex flex-col">
                {linkedSales.map(sale => {
                  const client = contacts.find(c => c.id === sale.clientId)
                  const { brokerCommission } = calcSaleCommissions(sale)
                  return (
                    <li key={sale.id} className="flex items-center gap-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] text-t1 truncate">{client?.name ?? '—'}</p>
                        <p className="text-[12.5px] text-t4">{formatDate(sale.date)}</p>
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

          <FichaSecao titulo={<>Tarefas <span className="text-t4 font-normal">{linkedTasks.length || ''}</span></>}>
            {linkedTasks.length === 0 ? (
              <p className="text-[13.5px] text-t4">Nenhuma tarefa ligada a este imóvel.</p>
            ) : (
              <ul className="flex flex-col">
                {linkedTasks.map(task => {
                  const cfg = STATUS_CONFIG[task.status]
                  const Icon = cfg.icon
                  return (
                    <li key={task.id} className={`flex items-start gap-3 py-2 ${task.status === 'done' ? 'opacity-60' : ''}`}>
                      <Icon size={16} strokeWidth={1.8} className={`${cfg.color} flex-shrink-0 mt-0.5`} aria-label={cfg.label} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-[14px] truncate ${task.status === 'done' ? 'line-through text-t3' : 'text-t1'}`}>{task.title}</p>
                        <p className="text-[12.5px] text-t4">
                          {[task.category ? (CATEGORY_LABELS[task.category] ?? task.category) : null, task.dueDate ? formatDate(task.dueDate) : null].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </FichaSecao>
        </div>
      </FichaPainel>

      {novaTarefa && <TaskForm isOpen onClose={() => setNovaTarefa(false)} defaultPropertyId={property.id} />}
    </>
  )
}
