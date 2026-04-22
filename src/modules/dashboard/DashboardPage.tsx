import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, Building2, TrendingUp, DollarSign, Cake, ArrowRight,
  Gift, MessageCircle, Sparkles, CheckSquare, Circle, CheckCircle2, AlertTriangle, Clock, Target
} from 'lucide-react'
import { PageLayout } from '../../components/layout/PageLayout'
import { Card } from '../../components/ui/Card'
import { StatCard } from '../../components/shared/StatCard'
import { Avatar } from '../../components/ui/Avatar'
import { Badge } from '../../components/ui/Badge'
import { useContactsStore } from '../../store/useContactsStore'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { useSalesStore } from '../../store/useSalesStore'
import { useTasksStore } from '../../store/useTasksStore'
import { useGoalsStore, calcProgress } from '../../store/useGoalsStore'
import { formatCurrency, formatDate, getBirthdayDay, whatsappUrl } from '../../lib/formatters'
import { ContactTag, GoalCategory } from '../../types'

const tagConfig: Record<ContactTag, { label: string; variant: 'indigo' | 'purple' | 'green' }> = {
  owner:    { label: 'Proprietário', variant: 'indigo' },
  investor: { label: 'Investidor',   variant: 'purple' },
  buyer:    { label: 'Comprou',      variant: 'green'  },
}

export function DashboardPage() {
  const navigate = useNavigate()
  const { contacts, load: loadContacts, getBirthdaysThisMonth } = useContactsStore()
  const { properties, load: loadProperties } = usePropertiesStore()
  const { sales, load: loadSales, getThisMonth, getTotalValue, getThisMonthValue } = useSalesStore()
  const { tasks, load: loadTasks, getUpcoming, getOverdue } = useTasksStore()
  const { goals, load: loadGoals } = useGoalsStore()

  useEffect(() => {
    loadContacts(); loadProperties(); loadSales(); loadTasks(); loadGoals()
  }, [loadContacts, loadProperties, loadSales, loadTasks, loadGoals])

  const birthdays       = getBirthdaysThisMonth()
  const salesThisMonth  = getThisMonth()
  const recentContacts  = contacts.slice(0, 5)
  const recentSales     = sales.slice(0, 5)
  const upcomingTasks   = getUpcoming().slice(0, 5)
  const overdueTasks    = getOverdue()
  const pendingCount    = tasks.filter(t => t.status === 'pending').length

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Bom dia'
    if (h < 18) return 'Boa tarde'
    return 'Boa noite'
  }

  const todayFormatted = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })

  const newContactsThisMonth = contacts.filter(c => {
    const d = new Date(c.createdAt), now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length

  return (
    <PageLayout
      title={`${greeting()}, Rafael ✨`}
      subtitle={todayFormatted.charAt(0).toUpperCase() + todayFormatted.slice(1)}
      ctaLabel="Nova Venda"
      onCta={() => navigate('/vendas?new=1')}
    >
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          label="Contatos"
          value={contacts.length}
          sub={`+${newContactsThisMonth} este mês`}
          icon={<Users size={18} />}
          accent="indigo"
        />
        <StatCard
          label="Imóveis"
          value={properties.length}
          sub={`${properties.filter(p => p.status === 'opportunity').length} oportunidades`}
          icon={<Building2 size={18} />}
          accent="blue"
        />
        <StatCard
          label="Total de vendas"
          value={formatCurrency(getTotalValue())}
          sub={`${sales.length} vendas realizadas`}
          icon={<DollarSign size={18} />}
          accent="green"
        />
        <StatCard
          label="Vendas no mês"
          value={formatCurrency(getThisMonthValue())}
          sub={`${salesThisMonth.length} venda${salesThisMonth.length !== 1 ? 's' : ''}`}
          icon={<TrendingUp size={18} />}
          accent="purple"
        />
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

        {/* Birthdays */}
        <Card accent="yellow" className="animate-slide-up">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 bg-yellow-500/15 rounded-lg flex items-center justify-center">
              <Cake size={14} className="text-yellow-400" />
            </div>
            <h2 className="text-sm font-semibold text-slate-200">Aniversários do mês</h2>
            {birthdays.length > 0 && (
              <span className="ml-auto bg-yellow-500/20 text-yellow-400 text-xs font-bold px-2 py-0.5 rounded-lg border border-yellow-500/30">
                {birthdays.length}
              </span>
            )}
          </div>

          {birthdays.length === 0 ? (
            <div className="flex flex-col items-center py-6 gap-2">
              <Gift size={28} className="text-slate-700" />
              <p className="text-xs text-slate-600 text-center">Nenhum aniversário este mês</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {birthdays.slice(0, 5).map(c => (
                <div key={c.id} className="flex items-center gap-3 group">
                  <Avatar name={c.name} photoUrl={c.photoUrl} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 truncate font-medium">{c.name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-yellow-400 tabular-nums">
                      {getBirthdayDay(c.birthdate!).replace(/^0/, '')}/{c.birthdate!.split('-')[1]}
                    </span>
                    <a
                      href={whatsappUrl(c.phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-lg bg-green-500/10 text-green-400 transition-all"
                      title="Mandar parabéns!"
                    >
                      <MessageCircle size={12} />
                    </a>
                  </div>
                </div>
              ))}
              {birthdays.length > 5 && (
                <p className="text-xs text-slate-600 text-center pt-1">+{birthdays.length - 5} mais</p>
              )}
            </div>
          )}
        </Card>

        {/* Recent sales */}
        <Card className="lg:col-span-2 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-green-500/15 rounded-lg flex items-center justify-center">
                <TrendingUp size={14} className="text-green-400" />
              </div>
              <h2 className="text-sm font-semibold text-slate-200">Últimas vendas</h2>
            </div>
            <button
              onClick={() => navigate('/vendas')}
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors cursor-pointer hover:gap-2"
            >
              Ver todas <ArrowRight size={12} />
            </button>
          </div>

          {recentSales.length === 0 ? (
            <div className="flex flex-col items-center py-8 gap-2">
              <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center">
                <Sparkles size={20} className="text-slate-600" />
              </div>
              <p className="text-sm text-slate-500">Nenhuma venda registrada ainda</p>
              <button
                onClick={() => navigate('/vendas?new=1')}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer mt-1"
              >
                Registrar primeira venda →
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {recentSales.map(s => {
                const client = contacts.find(c => c.id === s.clientId)
                return (
                  <div key={s.id} className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-white/4 transition-colors group -mx-3">
                    <Avatar name={client?.name ?? s.propertyName} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-200 truncate">{client?.name ?? '—'}</p>
                      <p className="text-xs text-slate-500 truncate">{s.propertyName}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-green-400 tabular-nums">{formatCurrency(s.value)}</p>
                      <p className="text-xs text-slate-600">{formatDate(s.date)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Tasks widget */}
      <Card className="animate-slide-up mb-6" accent="indigo">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-orange-500/15 rounded-lg flex items-center justify-center">
              <CheckSquare size={14} className="text-orange-400" />
            </div>
            <h2 className="text-sm font-semibold text-slate-200">Tarefas pendentes</h2>
            {pendingCount > 0 && (
              <span className="bg-orange-500/20 text-orange-400 text-xs font-bold px-2 py-0.5 rounded-lg border border-orange-500/30">
                {pendingCount}
              </span>
            )}
            {overdueTasks.length > 0 && (
              <span className="flex items-center gap-1 bg-red-500/10 text-red-400 text-xs font-medium px-2 py-0.5 rounded-lg border border-red-500/20">
                <AlertTriangle size={10} /> {overdueTasks.length} em atraso
              </span>
            )}
          </div>
          <button
            onClick={() => navigate('/tarefas')}
            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors cursor-pointer hover:gap-2"
          >
            Ver todas <ArrowRight size={12} />
          </button>
        </div>

        {upcomingTasks.length === 0 ? (
          <div className="flex flex-col items-center py-6 gap-2">
            <CheckCircle2 size={28} className="text-green-500/40" />
            <p className="text-sm text-slate-500">Nenhuma tarefa pendente</p>
            <button
              onClick={() => navigate('/tarefas')}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer mt-1"
            >
              + Criar tarefa →
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {upcomingTasks.map(t => {
              const today = new Date().toISOString().split('T')[0]
              const isOverdue = t.dueDate && t.dueDate < today
              const contact  = contacts.find(c => c.id === t.contactId)
              const property = properties.find(p => p.id === t.propertyId)
              return (
                <div key={t.id} className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-white/4 transition-colors -mx-3 group">
                  <button onClick={() => navigate('/tarefas')} className="flex-shrink-0 cursor-pointer">
                    <Circle size={17} className="text-slate-600 group-hover:text-indigo-400 transition-colors" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate">{t.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {contact && (
                        <span className="text-xs text-indigo-400 flex items-center gap-0.5">
                          <Users size={10} /> {contact.name}
                        </span>
                      )}
                      {property && (
                        <span className="text-xs text-cyan-400 flex items-center gap-0.5">
                          <Building2 size={10} /> {property.name}
                        </span>
                      )}
                    </div>
                  </div>
                  {t.dueDate && (
                    <span className={`flex-shrink-0 flex items-center gap-1 text-xs font-medium tabular-nums
                      ${isOverdue ? 'text-red-400' : 'text-slate-500'}`}>
                      <Clock size={11} />
                      {t.dueDate.split('-').reverse().join('/')}
                      {t.dueTime && ` ${t.dueTime}`}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Goals widget */}
      {goals.filter(g => g.active).length > 0 && (
        <Card className="animate-slide-up mb-6" accent="yellow">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-amber-500/15 rounded-lg flex items-center justify-center">
                <Target size={14} className="text-amber-400" />
              </div>
              <h2 className="text-sm font-semibold text-slate-200">Metas</h2>
            </div>
            <button
              onClick={() => navigate('/metas')}
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors cursor-pointer hover:gap-2"
            >
              Ver todas <ArrowRight size={12} />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {goals.filter(g => g.active).map(goal => {
              const progress = calcProgress(goal, tasks, sales)
              const pct  = Math.min(100, Math.round((progress / goal.target) * 100))
              const done = progress >= goal.target
              const colorMap: Record<GoalCategory, { bar: string; text: string }> = {
                visita:       { bar: 'bg-indigo-500', text: 'text-indigo-400' },
                agenciamento: { bar: 'bg-cyan-500',   text: 'text-cyan-400'   },
                proposta:     { bar: 'bg-amber-500',  text: 'text-amber-400'  },
                venda:        { bar: 'bg-green-500',  text: 'text-green-400'  },
              }
              const c = colorMap[goal.category]
              return (
                <div key={goal.id} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400 truncate">{goal.name}</span>
                    {done && <CheckCircle2 size={12} className="text-green-400 flex-shrink-0" />}
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-xl font-bold tabular-nums ${done ? 'text-green-400' : 'text-slate-100'}`}>{progress}</span>
                    <span className="text-xs text-slate-600">/{goal.target}</span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${done ? 'bg-green-500' : c.bar}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[10px] text-slate-600">{goal.period === 'weekly' ? 'esta semana' : 'este mês'}</span>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Recent contacts */}
      <Card className="animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-500/15 rounded-lg flex items-center justify-center">
              <Users size={14} className="text-indigo-400" />
            </div>
            <h2 className="text-sm font-semibold text-slate-200">Últimos contatos</h2>
          </div>
          <button
            onClick={() => navigate('/contatos')}
            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors cursor-pointer hover:gap-2"
          >
            Ver todos <ArrowRight size={12} />
          </button>
        </div>

        {recentContacts.length === 0 ? (
          <div className="flex flex-col items-center py-8 gap-2">
            <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center">
              <Users size={20} className="text-slate-600" />
            </div>
            <p className="text-sm text-slate-500">Nenhum contato cadastrado ainda</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {recentContacts.map(c => (
              <div key={c.id} className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-white/4 transition-colors group -mx-3">
                <Avatar name={c.name} photoUrl={c.photoUrl} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200">{c.name}</p>
                  {c.company && <p className="text-xs text-slate-500">{c.company}</p>}
                </div>
                <div className="flex gap-1.5 items-center">
                  {c.tags.map(tag => (
                    <Badge key={tag} variant={tagConfig[tag].variant}>{tagConfig[tag].label}</Badge>
                  ))}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <a
                    href={whatsappUrl(c.phone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"
                  >
                    <MessageCircle size={13} />
                  </a>
                  <span className="text-xs text-slate-600">{c.phone}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </PageLayout>
  )
}
