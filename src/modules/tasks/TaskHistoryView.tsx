import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2, Circle, Clock, User, Building2,
  ChevronLeft, ChevronRight, CalendarDays
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell
} from 'recharts'
import { Card } from '../../components/ui/Card'
import { Task, TaskCategory } from '../../types'
import { useContactsStore } from '../../store/useContactsStore'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { localDateStr } from '../../lib/formatters'
import { Home, FileText, TrendingUp, Zap } from 'lucide-react'

// ─── config ───────────────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<TaskCategory, { icon: typeof Home; color: string; bar: string; label: string }> = {
  visita:             { icon: Home,       color: 'text-cyan-400',    bar: '#22d3ee', label: 'Visita'                },
  agenciamento:       { icon: Building2,  color: 'text-indigo-400',  bar: '#818cf8', label: 'Agenciamento'          },
  proposta:           { icon: FileText,   color: 'text-amber-400',   bar: '#fbbf24', label: 'Proposta'              },
  busca_imovel:       { icon: TrendingUp, color: 'text-violet-400',  bar: '#a78bfa', label: 'Busca de Imóvel'       },
  prospeccao_imoveis: { icon: TrendingUp, color: 'text-emerald-400', bar: '#34d399', label: 'Prospecção de Imóveis' },
  campanhas:          { icon: Zap,        color: 'text-pink-400',    bar: '#f472b6', label: 'Campanhas'             },
  administrativo:     { icon: FileText,   color: 'text-slate-300',   bar: '#94a3b8', label: 'Administrativo'        },
  outro:              { icon: Zap,        color: 'text-slate-400',   bar: '#64748b', label: 'Outro'                 },
}
const CATEGORY_ORDER: TaskCategory[] = ['visita', 'agenciamento', 'proposta', 'busca_imovel', 'prospeccao_imoveis', 'campanhas', 'administrativo', 'outro']

function pad(n: number) { return String(n).padStart(2, '0') }
function todayStr() { return localDateStr() }
function offsetDay(base: string, days: number): string {
  const d = new Date(base + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function fmtLabel(d: string): string {
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
}
function fmtFull(d: string): string {
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
}

// ─── custom tooltip ───────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#1A1D27] border border-white/10 rounded-xl px-3 py-2 shadow-xl">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} className="text-xs font-semibold" style={{ color: p.fill }}>
          {p.name === 'done' ? 'Concluídas' : 'Pendentes'}: {p.value}
        </p>
      ))}
    </div>
  )
}

// ─── TaskDayRow ───────────────────────────────────────────────────────────────

function TaskDayRow({ task, isLast }: { task: Task; isLast: boolean }) {
  const navigate   = useNavigate()
  const { contacts }   = useContactsStore()
  const { properties } = usePropertiesStore()

  const contact  = contacts.find(c => c.id === task.contactId)
  const property = properties.find(p => p.id === task.propertyId)
  const isDone   = task.status === 'done'

  return (
    <div className={`flex items-start gap-3 px-4 py-3 transition-colors hover:bg-white/3
      ${!isLast ? 'border-b border-white/5' : ''}
      ${isDone ? 'opacity-60' : ''}
    `}>
      {isDone
        ? <CheckCircle2 size={16} className="text-green-400 mt-0.5 flex-shrink-0" />
        : <Circle       size={16} className="text-slate-600 mt-0.5 flex-shrink-0" />
      }

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${isDone ? 'line-through text-slate-500' : 'text-slate-100'}`}>
          {task.title}
        </p>
        {task.description && (
          <p className="text-xs text-slate-600 truncate mt-0.5">{task.description}</p>
        )}
        <div className="flex items-center gap-3 flex-wrap mt-1">
          {task.dueTime && (
            <span className="flex items-center gap-1 text-xs text-slate-600">
              <Clock size={10} /> {task.dueTime}
            </span>
          )}
          {contact && (
            <button
              onClick={() => navigate('/contatos')}
              className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 hover:underline transition-colors cursor-pointer"
            >
              <User size={10} /> {contact.name}
            </button>
          )}
          {property && (
            <button
              onClick={() => navigate('/imoveis')}
              className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 hover:underline transition-colors cursor-pointer"
            >
              <Building2 size={10} /> {property.name}
            </button>
          )}
          {isDone && task.completedAt && (
            <span className="text-xs text-green-400/60">
              ✓ {new Date(task.completedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TaskHistoryView({ tasks }: { tasks: Task[] }) {
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const today = todayStr()

  // Tarefas do dia selecionado (por dueDate)
  const dayTasks = useMemo(
    () => tasks.filter(t => t.dueDate === selectedDate),
    [tasks, selectedDate]
  )

  const doneTasks = dayTasks.filter(t => t.status === 'done')
  const total     = dayTasks.length
  const pct          = total > 0 ? Math.round((doneTasks.length / total) * 100) : 0

  // Gráfico por categoria
  const chartData = useMemo(() =>
    CATEGORY_ORDER
      .map(cat => {
        const catTasks = dayTasks.filter(t => (t.category ?? 'outro') === cat)
        return {
          name:  CATEGORY_CONFIG[cat].label,
          done:  catTasks.filter(t => t.status === 'done').length,
          open:  catTasks.filter(t => t.status !== 'done').length,
          color: CATEGORY_CONFIG[cat].bar,
          total: catTasks.length,
        }
      })
      .filter(d => d.total > 0),
    [dayTasks]
  )

  // Tarefas agrupadas por categoria
  const byCategory = useMemo(() =>
    CATEGORY_ORDER
      .map(cat => ({
        cat,
        cfg:   CATEGORY_CONFIG[cat],
        tasks: dayTasks.filter(t => (t.category ?? 'outro') === cat),
      }))
      .filter(g => g.tasks.length > 0),
    [dayTasks]
  )

  // Últimos 7 dias para mini-calendário
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = offsetDay(today, i - 6)
      const count = tasks.filter(t => t.dueDate === d).length
      const done  = tasks.filter(t => t.dueDate === d && t.status === 'done').length
      return { date: d, count, done }
    })
  }, [tasks, today])

  const isToday    = selectedDate === today
  const isFuture   = selectedDate > today
  const dateLabel  = isToday ? 'Hoje' : fmtFull(selectedDate)

  return (
    <div className="flex flex-col gap-6">

      {/* ── Seletor de data ────────────────────────────────────────── */}
      <Card className="!p-4">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setSelectedDate(d => offsetDay(d, -1))}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/8 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          >
            <ChevronLeft size={16} />
          </button>

          <div className="flex items-center gap-2">
            <CalendarDays size={15} className="text-indigo-400" />
            <span className="text-sm font-semibold text-slate-100 capitalize">{dateLabel}</span>
            {isToday && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-500/25 text-indigo-300 border border-indigo-500/30">
                HOJE
              </span>
            )}
          </div>

          <button
            onClick={() => setSelectedDate(d => offsetDay(d, 1))}
            disabled={isToday}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/8 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Mini calendário últimos 7 dias */}
        <div className="flex gap-1.5 justify-between">
          {weekDays.map(({ date, count, done }) => {
            const dt  = new Date(date + 'T00:00:00')
            const sel = date === selectedDate
            const pct = count > 0 ? Math.round((done / count) * 100) : 0
            return (
              <button
                key={date}
                onClick={() => setSelectedDate(date)}
                className={`flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-xl transition-all cursor-pointer
                  ${sel
                    ? 'bg-indigo-500/20 border border-indigo-500/40'
                    : 'hover:bg-white/5 border border-transparent'
                  }`}
              >
                <span className="text-[10px] text-slate-600 uppercase">
                  {dt.toLocaleDateString('pt-BR', { weekday: 'short' }).slice(0, 3)}
                </span>
                <span className={`text-sm font-bold ${sel ? 'text-indigo-300' : 'text-slate-300'}`}>
                  {pad(dt.getDate())}
                </span>
                {count > 0 ? (
                  <div className="flex flex-col items-center gap-0.5 w-full px-1">
                    <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-400 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[9px] text-slate-600">{done}/{count}</span>
                  </div>
                ) : (
                  <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
                )}
              </button>
            )
          })}
        </div>
      </Card>

      {/* ── KPIs do dia ───────────────────────────────────────────── */}
      {total > 0 ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1 px-4 py-3 rounded-xl bg-white/3 border border-white/8">
              <p className="text-xs text-slate-600">Total</p>
              <p className="text-2xl font-bold text-slate-100 tabular-nums">{total}</p>
              <p className="text-[11px] text-slate-600">tarefas no dia</p>
            </div>
            <div className="flex flex-col gap-1 px-4 py-3 rounded-xl bg-green-500/8 border border-green-500/20">
              <p className="text-xs text-slate-600">Concluídas</p>
              <p className="text-2xl font-bold text-green-400 tabular-nums">{doneTasks.length}</p>
              <p className="text-[11px] text-slate-600">de {total}</p>
            </div>
            <div className="flex flex-col gap-1 px-4 py-3 rounded-xl bg-indigo-500/8 border border-indigo-500/20">
              <p className="text-xs text-slate-600">Conclusão</p>
              <p className="text-2xl font-bold text-indigo-400 tabular-nums">{pct}%</p>
              <div className="w-full h-1.5 bg-white/10 rounded-full mt-1">
                <div
                  className="h-full bg-indigo-400 rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>

          {/* ── Gráfico por categoria ──────────────────────────────── */}
          {chartData.length > 0 && (
            <Card>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
                Tarefas por categoria — {isToday ? 'Hoje' : fmtLabel(selectedDate)}
              </p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} margin={{ top: 0, right: 0, left: -25, bottom: 0 }} barSize={22}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar dataKey="done" name="done" stackId="a" radius={[0, 0, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} fillOpacity={0.9} />
                    ))}
                  </Bar>
                  <Bar dataKey="open" name="open" stackId="a" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} fillOpacity={0.25} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-2 justify-center">
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="w-2.5 h-2.5 rounded-sm bg-indigo-400" /> Concluídas
                </span>
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className="w-2.5 h-2.5 rounded-sm bg-indigo-400 opacity-30" /> Pendentes
                </span>
              </div>
            </Card>
          )}

          {/* ── Lista por categoria ────────────────────────────────── */}
          {byCategory.map(({ cat, cfg, tasks: catTasks }) => {
            const CatIcon  = cfg.icon
            const doneInCat = catTasks.filter(t => t.status === 'done').length
            return (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider ${cfg.color}`}>
                    <CatIcon size={12} /> {cfg.label}
                  </span>
                  <span className="text-xs text-slate-600 font-medium">
                    {doneInCat}/{catTasks.length}
                  </span>
                </div>
                <Card className="!p-0 overflow-hidden">
                  {catTasks.map((t, i) => (
                    <TaskDayRow key={t.id} task={t} isLast={i === catTasks.length - 1} />
                  ))}
                </Card>
              </div>
            )
          })}

          {/* Sem categoria */}
          {(() => {
            const uncategorized = dayTasks.filter(t => !t.category)
            if (uncategorized.length === 0) return null
            return (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Sem categoria</span>
                  <span className="text-xs text-slate-600">{uncategorized.length}</span>
                </div>
                <Card className="!p-0 overflow-hidden">
                  {uncategorized.map((t, i) => (
                    <TaskDayRow key={t.id} task={t} isLast={i === uncategorized.length - 1} />
                  ))}
                </Card>
              </div>
            )
          })()}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-3">
            <CalendarDays size={20} className="text-slate-600" />
          </div>
          <p className="text-sm font-medium text-slate-400">
            {isFuture ? 'Nenhuma tarefa agendada para este dia' : 'Nenhuma tarefa registrada neste dia'}
          </p>
          <p className="text-xs text-slate-600 mt-1">
            {isFuture ? 'As tarefas futuras aparecerão aqui.' : 'Tarefas com essa data aparecerão aqui.'}
          </p>
        </div>
      )}
    </div>
  )
}
