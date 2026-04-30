import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, Building2, TrendingUp, DollarSign, Cake, ArrowRight,
  Gift, MessageCircle, Sparkles, Circle, CheckCircle2,
  AlertTriangle, Clock, Target, CalendarCheck, Siren, ClipboardCheck, ListTodo,
} from 'lucide-react'
import { useState } from 'react'
import { Task, Contact, Property, calcSaleCommissions } from '../../types'
import { TaskForm } from '../tasks/TaskForm'
import { PageLayout } from '../../components/layout/PageLayout'
import { Card } from '../../components/ui/Card'
import { StatCard } from '../../components/shared/StatCard'
import { Avatar } from '../../components/ui/Avatar'
import { PeriodSelector } from '../../components/shared/PeriodSelector'
import { useContactsStore } from '../../store/useContactsStore'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { useSalesStore } from '../../store/useSalesStore'
import { useTasksStore } from '../../store/useTasksStore'
import { useGoalsStore, calcProgress } from '../../store/useGoalsStore'
import { usePeriodStore, matchesPeriod } from '../../store/usePeriodStore'
import { formatCurrency, formatCurrencyFull, formatDate, getBirthdayDay, whatsappUrl } from '../../lib/formatters'
import { GoalCategory } from '../../types'
import { useCampaignsStore } from '../../store/useCampaignsStore'
import { useCampaignLeadsStore } from '../../store/useCampaignLeadsStore'
import { Megaphone, Zap, ThumbsUp } from 'lucide-react'

function daysOverdue(dueDate: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due   = new Date(dueDate + 'T00:00:00')
  return Math.floor((today.getTime() - due.getTime()) / 86_400_000)
}

function dueDateLabel(dueDate?: string): { text: string; color: string } {
  if (!dueDate) return { text: 'Sem prazo', color: 'text-slate-600' }
  const today    = new Date(); today.setHours(0, 0, 0, 0)
  const due      = new Date(dueDate + 'T00:00:00')
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000)
  if (diffDays === 0) return { text: 'Hoje!',    color: 'text-amber-400' }
  if (diffDays === 1) return { text: 'Amanhã',   color: 'text-yellow-400' }
  if (diffDays <= 7)  return { text: `Em ${diffDays} dias`, color: 'text-slate-400' }
  return { text: dueDate.split('-').reverse().join('/'), color: 'text-slate-500' }
}

function OverdueCard({
  tasks, contacts, properties, onNavigate,
}: { tasks: Task[]; contacts: Contact[]; properties: Property[]; onNavigate: () => void }) {
  if (tasks.length === 0) return null
  return (
    <div className="relative rounded-2xl border border-red-500/40 bg-red-500/5 ring-1 ring-red-500/20 overflow-hidden mb-6 animate-slide-up">
      {/* topo vermelho */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-red-500/20">
        <div className="flex items-center gap-2.5">
          <div className="relative w-8 h-8 bg-red-500/20 rounded-xl flex items-center justify-center">
            <Siren size={15} className="text-red-400 animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-red-300 leading-none">Tarefas em atraso</h2>
            <p className="text-[11px] text-red-500/70 mt-0.5">Atenção imediata necessária</p>
          </div>
          <span className="ml-1 bg-red-500/25 text-red-300 text-xs font-bold px-2.5 py-1 rounded-xl border border-red-500/30 tabular-nums animate-pulse">
            {tasks.length}
          </span>
        </div>
        <button
          onClick={onNavigate}
          className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors cursor-pointer"
        >
          Resolver <ArrowRight size={12} />
        </button>
      </div>

      <div className="flex flex-col divide-y divide-red-500/10">
        {tasks.map(t => {
          const days     = daysOverdue(t.dueDate!)
          const contact  = contacts.find(c => c.id === t.contactId)
          const property = properties.find(p => p.id === t.propertyId)
          return (
            <div
              key={t.id}
              onClick={onNavigate}
              className="flex items-center gap-3 px-5 py-3 hover:bg-red-500/8 transition-colors cursor-pointer group"
            >
              <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-red-500/15 flex items-center justify-center">
                <AlertTriangle size={13} className="text-red-400" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-200 truncate">{t.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {contact && (
                    <span className="text-xs text-slate-500 flex items-center gap-0.5">
                      <Users size={9} /> {contact.name}
                    </span>
                  )}
                  {property && (
                    <span className="text-xs text-slate-500 flex items-center gap-0.5">
                      <Building2 size={9} /> {property.name}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex-shrink-0 text-right">
                <span className="inline-flex items-center gap-1 text-xs font-bold text-red-400 bg-red-500/15 px-2 py-0.5 rounded-lg border border-red-500/20">
                  <Clock size={10} />
                  {days === 1 ? '1 dia' : `${days} dias`} de atraso
                </span>
                <p className="text-[10px] text-red-600 mt-0.5 text-right">
                  {t.dueDate!.split('-').reverse().join('/')}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function UpcomingCard({
  tasks, contacts, properties, onNavigate,
}: { tasks: Task[]; contacts: Contact[]; properties: Property[]; onNavigate: () => void }) {
  const shown = tasks.slice(0, 6)
  return (
    <div className="relative rounded-2xl border border-white/8 bg-[#13151f] overflow-hidden mb-6 animate-slide-up">
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/7">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-indigo-500/15 rounded-xl flex items-center justify-center">
            <CalendarCheck size={15} className="text-indigo-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-200">Próximas tarefas</h2>
            {tasks.length > 0
              ? <p className="text-[11px] text-slate-500 mt-0.5">Você tem {tasks.length} tarefa{tasks.length !== 1 ? 's' : ''} agendada{tasks.length !== 1 ? 's' : ''} — siga em frente! 💪</p>
              : <p className="text-[11px] text-slate-500 mt-0.5">Agenda livre — aproveite para planejar! ✨</p>
            }
          </div>
        </div>
        <button
          onClick={onNavigate}
          className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors cursor-pointer hover:gap-2"
        >
          Ver todas <ArrowRight size={12} />
        </button>
      </div>

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center py-8 gap-2">
          <CheckCircle2 size={30} className="text-green-500/40" />
          <p className="text-sm text-slate-500">Nenhuma tarefa futura por enquanto</p>
          <button
            onClick={onNavigate}
            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer mt-1"
          >
            + Criar tarefa →
          </button>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-white/5">
          {shown.map(t => {
            const due      = dueDateLabel(t.dueDate)
            const contact  = contacts.find(c => c.id === t.contactId)
            const property = properties.find(p => p.id === t.propertyId)
            return (
              <div
                key={t.id}
                onClick={onNavigate}
                className="flex items-center gap-3 px-5 py-3 hover:bg-white/4 transition-colors cursor-pointer group"
              >
                <Circle size={16} className="text-slate-700 group-hover:text-indigo-400 transition-colors flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">{t.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {contact && (
                      <span className="text-xs text-slate-600 flex items-center gap-0.5">
                        <Users size={9} /> {contact.name}
                      </span>
                    )}
                    {property && (
                      <span className="text-xs text-slate-600 flex items-center gap-0.5">
                        <Building2 size={9} /> {property.name}
                      </span>
                    )}
                  </div>
                </div>
                {t.dueDate && (
                  <span className={`flex-shrink-0 flex items-center gap-1 text-xs font-medium tabular-nums ${due.color}`}>
                    <Clock size={10} /> {due.text}
                  </span>
                )}
              </div>
            )
          })}
          {tasks.length > 6 && (
            <div className="px-5 py-2.5 text-center">
              <button onClick={onNavigate} className="text-xs text-slate-600 hover:text-indigo-400 transition-colors cursor-pointer">
                +{tasks.length - 6} mais tarefas →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Mensagem inteligente por campanha ───────────────────────────────────────

function smartCampaignMessage(total: number, acionados: number, interessados: number): { text: string; color: string } {
  if (total === 0)
    return { text: 'Importe leads para começar a prospectar.', color: 'text-slate-500' }

  const acRate  = acionados / total
  const intRate = acionados > 0 ? interessados / acionados : 0

  if (acionados === 0)
    return { text: `${total.toLocaleString('pt-BR')} leads aguardando o 1º contato — vamos lá! 📋`, color: 'text-amber-400' }

  if (acRate < 0.15)
    return { text: `Ainda há muitos leads para acionar — ${(total - acionados).toLocaleString('pt-BR')} esperando! 📲`, color: 'text-orange-400' }

  if (intRate === 0)
    return { text: `Acionamento em curso, mas nenhum interesse registrado ainda. Revise a abordagem. 🔍`, color: 'text-slate-400' }

  if (intRate < 0.15)
    return { text: `Conversão de interesse baixa (${Math.round(intRate * 100)}%). Tente uma abordagem diferente. 💡`, color: 'text-yellow-400' }

  if (intRate < 0.30)
    return { text: `Boa conversão! ${Math.round(intRate * 100)}% dos acionados demonstraram interesse. 📈`, color: 'text-cyan-400' }

  return { text: `Excelente! ${Math.round(intRate * 100)}% de interesse — foque em avançar para propostas. 🎯`, color: 'text-green-400' }
}

// ─── Widget de campanhas ativas ───────────────────────────────────────────────

function CampaignsWidget({ onNavigate }: { onNavigate: (id: string) => void }) {
  const { campaigns } = useCampaignsStore()
  const { leads }     = useCampaignLeadsStore()

  const active = campaigns.filter(c => c.status === 'active')
  if (active.length === 0) return null

  return (
    <div className="rounded-2xl border border-white/8 bg-[#13151f] overflow-hidden mb-6 animate-slide-up">
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/7">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-purple-500/15 rounded-xl flex items-center justify-center">
            <Megaphone size={15} className="text-purple-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-200">Campanhas ativas</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">{active.length} campanha{active.length !== 1 ? 's' : ''} em andamento</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col divide-y divide-white/5">
        {active.map(c => {
          const cLeads      = leads.filter(l => l.campaignId === c.id)
          const total       = cLeads.length
          const acionados   = cLeads.filter(l => l.firstContactAt).length
          const interessados = cLeads.filter(l => ['attended','scheduled','presentation','proposal','sale'].includes(l.funnelStage)).length
          const msg         = smartCampaignMessage(total, acionados, interessados)

          const acPct  = total     > 0 ? Math.round(acionados    / total     * 100) : 0
          const intPct = acionados > 0 ? Math.round(interessados / acionados * 100) : 0

          return (
            <div
              key={c.id}
              onClick={() => onNavigate(c.id)}
              className="px-5 py-4 hover:bg-white/3 transition-colors cursor-pointer group"
            >
              {/* Nome + mensagem */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-sm font-semibold text-slate-200 group-hover:text-indigo-300 transition-colors">{c.name}</p>
                  <p className={`text-[11px] mt-0.5 ${msg.color}`}>{msg.text}</p>
                </div>
                <ArrowRight size={14} className="text-slate-700 group-hover:text-indigo-400 transition-colors mt-0.5 flex-shrink-0" />
              </div>

              {/* Métricas em 3 colunas */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { icon: <Users size={11} />,    label: 'Leads',     value: total.toLocaleString('pt-BR'),       pct: null,   color: 'text-slate-400'  },
                  { icon: <Zap size={11} />,      label: 'Acionados', value: acionados.toLocaleString('pt-BR'),   pct: acPct,  color: 'text-blue-400'   },
                  { icon: <ThumbsUp size={11} />, label: 'Interesse', value: interessados.toLocaleString('pt-BR'),pct: intPct, color: 'text-cyan-400'   },
                ].map(m => (
                  <div key={m.label} className="flex flex-col gap-1 bg-white/3 rounded-xl px-3 py-2.5 border border-white/5">
                    <div className={`flex items-center gap-1 ${m.color} text-[10px] font-medium`}>
                      {m.icon} {m.label}
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className={`text-base font-bold tabular-nums ${m.color}`}>{m.value}</span>
                      {m.pct !== null && <span className="text-[10px] text-slate-600">{m.pct}%</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Dashboard principal ──────────────────────────────────────────────────────

export function DashboardPage() {
  const navigate = useNavigate()
  const [taskFormOpen, setTaskFormOpen] = useState(false)
  const { contacts, load: loadContacts, getBirthdaysThisMonth } = useContactsStore()
  const { properties, load: loadProperties } = usePropertiesStore()
  const { sales, load: loadSales, getByPeriod, getValueByPeriod } = useSalesStore()
  const { tasks, load: loadTasks, getUpcoming, getOverdue } = useTasksStore()
  const { goals, load: loadGoals } = useGoalsStore()
  const { load: loadCampaigns } = useCampaignsStore()
  const { load: loadLeads }     = useCampaignLeadsStore()
  const { startDate, endDate, getLabel } = usePeriodStore()

  useEffect(() => {
    loadContacts(); loadProperties(); loadSales(); loadTasks(); loadGoals()
    loadCampaigns(); loadLeads()
  }, [loadContacts, loadProperties, loadSales, loadTasks, loadGoals, loadCampaigns, loadLeads])

  const periodLabel   = getLabel()
  const salesInPeriod = getByPeriod(startDate, endDate)
  const valueInPeriod = getValueByPeriod(startDate, endDate)

  // Total acumulado até o fim do período selecionado (não exibe vendas além do endDate)
  const totalAccumulated      = sales.filter(s => s.date <= endDate).reduce((acc, s) => acc + s.value, 0)
  const totalAccumulatedCount = sales.filter(s => s.date <= endDate).length
  const recentSales   = salesInPeriod.slice(0, 5)
  const upcomingTasks = getUpcoming()
  const overdueTasks  = getOverdue()
  const birthdays     = getBirthdaysThisMonth()

  // Comissões do período selecionado
  const periodComm   = salesInPeriod.reduce((a, s) => a + calcSaleCommissions(s).totalCommission, 0)
  const periodBroker = salesInPeriod.reduce((a, s) => a + calcSaleCommissions(s).brokerCommission, 0)

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Bom dia'
    if (h < 18) return 'Boa tarde'
    return 'Boa noite'
  }

  const todayFormatted = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })

  // Tarefas do período
  const tasksDoneInPeriod = tasks.filter(t =>
    t.status === 'done' && t.completedAt && matchesPeriod(t.completedAt.split('T')[0], startDate, endDate)
  ).length
  const tasksPendingInPeriod = tasks.filter(t =>
    t.status !== 'done' && t.dueDate && matchesPeriod(t.dueDate, startDate, endDate)
  ).length

  return (
    <PageLayout
      title={`${greeting()}, Rafael ✨`}
      subtitle={todayFormatted.charAt(0).toUpperCase() + todayFormatted.slice(1)}
      ctaLabel="Nova Tarefa"
      onCta={() => setTaskFormOpen(true)}
    >
      {/* Seletor de período */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-xs text-slate-500">Exibindo dados de <span className="text-slate-300 font-medium">{periodLabel}</span></p>
        <PeriodSelector />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Card combinado de tarefas */}
        <Card className="!py-4 col-span-2 sm:col-span-1">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg leading-none">🔥</span>
            <span className="text-xs text-slate-500">Tarefas — {periodLabel}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <p className="text-2xl font-bold tabular-nums text-green-400">{tasksDoneInPeriod}</p>
              <p className="text-[10px] text-slate-600 mt-0.5 flex items-center gap-1">
                <ClipboardCheck size={9} className="text-green-500" /> realizadas
              </p>
            </div>
            <div className="w-px h-10 bg-white/8 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-2xl font-bold tabular-nums text-indigo-400">{tasksPendingInPeriod}</p>
              <p className="text-[10px] text-slate-600 mt-0.5 flex items-center gap-1">
                <ListTodo size={9} className="text-indigo-500" /> pendentes
              </p>
            </div>
          </div>
          {tasksPendingInPeriod > 0 && (
            <div className="mt-3 pt-2 border-t border-white/5">
              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-green-500 transition-all duration-500"
                  style={{ width: `${tasksDoneInPeriod + tasksPendingInPeriod > 0 ? Math.round(tasksDoneInPeriod / (tasksDoneInPeriod + tasksPendingInPeriod) * 100) : 0}%` }}
                />
              </div>
            </div>
          )}
        </Card>
        <StatCard
          label="Imóveis"
          value={properties.length}
          sub={`${properties.filter(p => p.status === 'opportunity').length} oportunidades`}
          icon={<span className="text-lg leading-none">🏠</span>}
          accent="blue"
        />
        <StatCard
          label="Total acumulado"
          value={formatCurrency(totalAccumulated)}
          sub={`${totalAccumulatedCount} venda${totalAccumulatedCount !== 1 ? 's' : ''} até ${periodLabel}`}
          icon={<span className="text-lg leading-none">💰</span>}
          accent="green"
        />
        <StatCard
          label={`Vendas — ${periodLabel}`}
          value={formatCurrency(valueInPeriod)}
          sub={`${salesInPeriod.length} venda${salesInPeriod.length !== 1 ? 's' : ''}`}
          icon={<span className="text-lg leading-none">💰</span>}
          accent="purple"
        />
      </div>

      {/* Comissões do período */}
      {salesInPeriod.length > 0 && (
        <div className="grid grid-cols-2 gap-4 mb-8">
          <StatCard
            label={`Comissão gerada — ${periodLabel}`}
            value={formatCurrencyFull(periodComm)}
            sub="soma das comissões negociadas no período"
            icon={<DollarSign size={18} />}
            accent="purple"
          />
          <StatCard
            label={`Sua comissão — ${periodLabel}`}
            value={formatCurrencyFull(periodBroker)}
            sub="sua parte no período selecionado"
            icon={<TrendingUp size={18} />}
            accent="green"
          />
        </div>
      )}

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
                      <p className="text-sm font-bold text-green-400 tabular-nums">{formatCurrencyFull(s.value)}</p>
                      <p className="text-xs text-slate-600">{formatDate(s.date)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Tasks — atrasadas (sempre visíveis e chamativas) */}
      <OverdueCard
        tasks={overdueTasks}
        contacts={contacts}
        properties={properties}
        onNavigate={() => navigate('/tarefas')}
      />

      {/* Tasks — futuras (mensagem amigável) */}
      <UpcomingCard
        tasks={upcomingTasks}
        contacts={contacts}
        properties={properties}
        onNavigate={() => navigate('/tarefas')}
      />

      {/* Campanhas ativas */}
      <CampaignsWidget onNavigate={id => navigate(`/campanhas?id=${id}`)} />

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

      <TaskForm
        isOpen={taskFormOpen}
        onClose={() => setTaskFormOpen(false)}
      />
    </PageLayout>
  )
}
