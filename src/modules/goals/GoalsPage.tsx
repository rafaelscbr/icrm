import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Target, Pencil, Trash2, CheckCircle2, TrendingUp,
  Calendar, CalendarDays, Footprints, Handshake, FileText,
  BadgeDollarSign, History, Users, Megaphone, Zap, MessageCircle,
  ChevronRight, Plus, Award,
} from 'lucide-react'
import confetti from 'canvas-confetti'
import { useAuthStore, Profile } from '../../store/useAuthStore'
import { PageLayout } from '../../components/layout/PageLayout'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { GoalForm } from './GoalForm'
import { useGoalsStore, calcProgress, getVisitMetrics } from '../../store/useGoalsStore'
import { useWeekSnapshotStore } from '../../store/useWeekSnapshotStore'
import { useTasksStore } from '../../store/useTasksStore'
import { useSalesStore } from '../../store/useSalesStore'
import { useLeadInteractionsStore } from '../../store/useLeadInteractionsStore'
import { useDisparosStore } from '../../store/useDisparosStore'
import { getDailySends } from '../campaigns/dailyCounter'
import { Goal, GoalCategory, Task } from '../../types'

// ─── Constantes ───────────────────────────────────────────────────────────────

const REAL_TYPES = new Set(['ligacao', 'whatsapp', 'email', 'visita', 'reuniao', 'nota'])

const TARGETS = {
  hoje:   { interacoes: 10, disparos: 30 },
  semana: { visitas: 2, propostas: 1, disparos: 150 },
  mes:    { visitas: 8, propostas: 4, vendas: 2, disparos: 600 },
}

type PeriodTab = 'hoje' | 'semana' | 'mes'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWeekStart(): Date {
  const d = new Date(); d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d
}
function getMonthStart(): Date {
  const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1)
}
function toLocalDate(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// ─── Score Hero ───────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r = 54; const sz = 136; const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  const color = score >= 80 ? '#22c55e' : score >= 50 ? '#6366f1' : score >= 25 ? '#f59e0b' : '#ef4444'
  const label = score >= 80 ? 'Excelente' : score >= 50 ? 'No caminho' : score >= 25 ? 'Atenção' : 'Começar agora'
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`}>
        <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={10} />
        <circle
          cx={sz/2} cy={sz/2} r={r} fill="none"
          stroke={color} strokeWidth={10} strokeLinecap="round"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeDashoffset={circ / 4}
          style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.16,1,0.3,1), stroke 0.5s' }}
        />
        <text x={sz/2} y={sz/2 - 6} textAnchor="middle" fill="white" fontSize={28} fontWeight="900" fontFamily="system-ui">
          {score}
        </text>
        <text x={sz/2} y={sz/2 + 10} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize={10} fontFamily="system-ui">
          pontos
        </text>
      </svg>
      <span className="text-xs font-semibold" style={{ color }}>{label}</span>
    </div>
  )
}

// ─── KPI Individual ───────────────────────────────────────────────────────────

type KpiStatus = 'done' | 'good' | 'warn' | 'behind'

function getStatus(value: number, target: number): KpiStatus {
  const pct = target > 0 ? value / target : 0
  if (pct >= 1)    return 'done'
  if (pct >= 0.7)  return 'good'
  if (pct >= 0.3)  return 'warn'
  return 'behind'
}

const STATUS_CONFIG: Record<KpiStatus, {
  bar: string; num: string; bg: string; border: string; badge: string; label: string
}> = {
  done:   { bar: 'bg-green-500',    num: 'text-green-400',  bg: 'bg-green-500/8',   border: 'border-green-500/30',  badge: 'bg-green-500/20 text-green-400',  label: 'Meta atingida!'  },
  good:   { bar: 'bg-indigo-500',   num: 'text-t1',         bg: 'bg-indigo-500/8',  border: 'border-indigo-500/25', badge: 'bg-indigo-500/15 text-indigo-300', label: 'No caminho'     },
  warn:   { bar: 'bg-amber-500',    num: 'text-t1',         bg: 'bg-amber-500/8',   border: 'border-amber-500/25',  badge: 'bg-amber-500/15 text-amber-400',  label: 'Acelerar'       },
  behind: { bar: 'bg-rose-500/80',  num: 'text-t3',         bg: 'bg-rose-500/5',    border: 'border-rose-500/20',   badge: 'bg-rose-500/10 text-rose-400',    label: 'Atenção'        },
}

function KpiCard({ label, value, target, icon, note }: {
  label: string; value: number; target: number; icon: React.ReactNode; note?: string
}) {
  const pct    = Math.min(100, target > 0 ? Math.round(value / target * 100) : 0)
  const status = getStatus(value, target)
  const cfg    = STATUS_CONFIG[status]
  const done   = status === 'done'

  return (
    <div className={`relative rounded-2xl border p-5 flex flex-col gap-3 transition-all duration-200 ${cfg.bg} ${cfg.border}`}>
      {done && (
        <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{ boxShadow: '0 0 0 1px rgba(34,197,94,0.3), inset 0 0 20px rgba(34,197,94,0.04)' }} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-t3 min-w-0">
          <span className="flex-shrink-0 opacity-70">{icon}</span>
          <span className="text-xs font-medium truncate">{label}</span>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${cfg.badge}`}>
          {done ? '✓' : `${pct}%`}
        </span>
      </div>

      {/* Número */}
      <div className="flex items-end gap-1.5">
        <span className={`text-4xl font-black tabular-nums leading-none tracking-tight ${cfg.num}`}>{value}</span>
        <span className="text-sm text-t4 mb-0.5 font-medium">/{target}</span>
        {done && <CheckCircle2 size={16} className="text-green-400 mb-0.5 ml-auto flex-shrink-0" />}
      </div>

      {/* Barra de progresso */}
      <div className="space-y-1.5">
        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${cfg.bar}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between items-center">
          <span className={`text-[10px] font-medium ${done ? 'text-green-400' : 'text-t4'}`}>{cfg.label}</span>
          {note && <span className="text-[10px] text-t4">{note}</span>}
        </div>
      </div>
    </div>
  )
}

// ─── Métricas por período (com score) ────────────────────────────────────────

interface PeriodData {
  disparosHoje: number
  disparosSemana: number
  disparosMes: number
  daily: number
  weekVisits: number
  weekProp: number
  monthVisits: number
  monthProp: number
  monthSales: number
}

function usePeriodData(tasks: Task[]): PeriodData {
  const { getAllInteractions, loadAll, allLoaded } = useLeadInteractionsStore()
  const { sales }        = useSalesStore()
  const { countDay: disparosDb, countWeek: disparosSemana, countMonth: disparosMes, load: loadDisparos } = useDisparosStore()
  const disparosHoje = Math.max(disparosDb, getDailySends())

  useEffect(() => { loadDisparos() }, [loadDisparos])
  useEffect(() => { if (!allLoaded) loadAll() }, [allLoaded, loadAll])

  const weekStartMs  = useMemo(() => getWeekStart().getTime(), [])
  const monthStartMs = useMemo(() => getMonthStart().getTime(), [])

  const metrics = useMemo(() => {
    const all    = getAllInteractions()
    const wStart = new Date(weekStartMs)
    const mStart = new Date(monthStartMs)
    const now    = new Date()
    const today  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`

    const daily = all.filter(i => REAL_TYPES.has(i.type) && toLocalDate(i.interactedAt) === today).length

    const weekInteract  = all.filter(i => new Date(i.interactedAt) >= wStart)
    const monthInteract = all.filter(i => new Date(i.interactedAt) >= mStart)
    const weekProp      = weekInteract.filter(i  => i.type === 'stage_change' && i.description?.includes('→ Proposta')).length
    const monthProp     = monthInteract.filter(i => i.type === 'stage_change' && i.description?.includes('→ Proposta')).length
    const monthSales    = sales.filter(s => s.date >= new Date(monthStartMs).toISOString().slice(0,10)).length

    const visitasDone = tasks.filter(t => t.status === 'done' && t.category === 'visita')
    const weekVisits  = visitasDone.filter(t => { const d = t.completedAt ?? t.dueDate; return d && new Date(d) >= wStart }).length
    const monthVisits = visitasDone.filter(t => { const d = t.completedAt ?? t.dueDate; return d && new Date(d) >= mStart }).length

    return { daily, weekVisits, weekProp, monthVisits, monthProp, monthSales }
  }, [getAllInteractions, allLoaded, sales, tasks, weekStartMs, monthStartMs])

  return { disparosHoje, disparosSemana, disparosMes, ...metrics }
}

function calcScore(kpis: Array<{ value: number; target: number }>): number {
  if (!kpis.length) return 0
  const avg = kpis.reduce((acc, k) => acc + Math.min(1, k.target > 0 ? k.value / k.target : 0), 0) / kpis.length
  return Math.round(avg * 100)
}

// ─── Ring de progresso para metas personalizadas ──────────────────────────────

function GoalRing({ value, target, hex }: { value: number; target: number; hex: string }) {
  const pct  = Math.min(100, target > 0 ? (value / target) * 100 : 0)
  const done = value >= target
  const r    = 34; const sz = 88; const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  return (
    <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`}>
      <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={7} />
      <circle cx={sz/2} cy={sz/2} r={r} fill="none"
        stroke={done ? '#22c55e' : hex} strokeWidth={7} strokeLinecap="round"
        strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={circ / 4}
        style={{ transition: 'stroke-dasharray 700ms cubic-bezier(0.16,1,0.3,1)' }}
      />
      <text x={sz/2} y={sz/2 - 4} textAnchor="middle" fill={done ? '#4ade80' : 'white'} fontSize={13} fontWeight="800" fontFamily="system-ui">
        {Math.round(pct)}%
      </text>
      <text x={sz/2} y={sz/2 + 10} textAnchor="middle" fill="#475569" fontSize={9} fontFamily="system-ui">
        {value}/{target}
      </text>
    </svg>
  )
}

const CAT_CFG: Record<GoalCategory, { icon: typeof Target; text: string; bg: string; border: string; hex: string; label: string }> = {
  visita:       { icon: Footprints,      text: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/25', hex: '#6366f1', label: 'Visita'        },
  agenciamento: { icon: Handshake,       text: 'text-cyan-400',   bg: 'bg-cyan-500/10',   border: 'border-cyan-500/25',   hex: '#06b6d4', label: 'Agenciamento'  },
  proposta:     { icon: FileText,        text: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/25',  hex: '#f59e0b', label: 'Proposta'      },
  venda:        { icon: BadgeDollarSign, text: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/25',  hex: '#22c55e', label: 'Venda'         },
}

function GoalCard({ goal, progress, onEdit, onDelete, onPause }: {
  goal: Goal; progress: number; onEdit: () => void; onDelete: () => void; onPause: () => void
}) {
  const cfg     = CAT_CFG[goal.category]
  const Icon    = cfg.icon
  const done    = progress >= goal.target
  const firedRef = useRef(false)

  useEffect(() => {
    if (done && !firedRef.current) {
      firedRef.current = true
      confetti({ particleCount: 70, spread: 55, origin: { y: 0.6 }, colors: ['#6366f1','#22c55e','#f59e0b','#06b6d4'] })
    }
  }, [done])

  return (
    <div className={`group relative rounded-2xl border p-5 flex flex-col gap-4 transition-all hover:shadow-lg hover:-translate-y-0.5 ${done ? 'border-green-500/30 bg-green-500/5' : cfg.border} `}
      style={done ? {} : { background: 'var(--surface)' }}
    >
      {done && <div className="absolute top-3 right-3"><CheckCircle2 size={15} className="text-green-400" /></div>}

      <div className="flex items-center gap-2.5">
        <div className={`w-8 h-8 ${cfg.bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
          <Icon size={15} className={cfg.text} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-t1 truncate leading-none">{goal.name}</p>
          <p className="text-[10px] text-t4 mt-1">{goal.period === 'weekly' ? 'Semanal' : 'Mensal'} · meta {goal.target}</p>
        </div>
      </div>

      <div className="flex justify-center">
        <GoalRing value={progress} target={goal.target} hex={cfg.hex} />
      </div>

      {done && <p className="text-[11px] text-green-400 font-semibold text-center -mt-2">Meta atingida! 🎉</p>}

      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onPause} className="flex-1 text-xs text-t4 hover:text-t2 py-1.5 rounded-xl hover:bg-s3/60 transition-colors cursor-pointer">Pausar</button>
        <button onClick={onEdit} className="p-1.5 rounded-xl hover:bg-s3/70 text-t4 hover:text-t2 transition-colors cursor-pointer"><Pencil size={13} /></button>
        <button onClick={onDelete} className="p-1.5 rounded-xl hover:bg-red-500/10 text-t4 hover:text-red-400 transition-colors cursor-pointer"><Trash2 size={13} /></button>
      </div>
    </div>
  )
}

// ─── Card de Visitas (unificado) ──────────────────────────────────────────────

function VisitasCard({ tasks, visitGoals, onEdit, onDelete, onPause }: {
  tasks: Task[]; visitGoals: Goal[]
  onEdit: (g: Goal) => void; onDelete: (g: Goal) => void; onPause: (id: string) => void
}) {
  const { agendadasMes, realizadasSemana, realizadasMes } = getVisitMetrics(tasks)
  const metaSem = visitGoals.find(g => g.period === 'weekly')?.target  ?? 2
  const metaMes = visitGoals.find(g => g.period === 'monthly')?.target ?? 8
  const semOk = realizadasSemana >= metaSem
  const mesOk = realizadasMes    >= metaMes

  function Bar({ value, target, ok }: { value: number; target: number; ok: boolean }) {
    const pct = Math.min(100, target > 0 ? Math.round(value / target * 100) : 0)
    return (
      <div>
        <div className="flex justify-between mb-1">
          <span className={`text-xs font-medium ${ok ? 'text-green-400' : 'text-t3'}`}>
            {ok ? 'Meta atingida!' : `${value} / ${target}`}
          </span>
          <span className="text-[10px] text-t4">{pct}%</span>
        </div>
        <div className="h-1.5 bg-s3/50 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${ok ? 'bg-green-500' : 'bg-indigo-500'}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    )
  }

  return (
    <div className="group rounded-2xl border border-indigo-500/25 p-5 flex flex-col gap-4 transition-all hover:shadow-lg hover:-translate-y-0.5" style={{ background: 'var(--surface)' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-indigo-500/10 rounded-xl flex items-center justify-center"><Footprints size={15} className="text-indigo-400" /></div>
          <div>
            <p className="text-sm font-semibold text-t1 leading-none">Visitas</p>
            <p className="text-[10px] text-t4 mt-1">{metaSem}/sem · {metaMes}/mês</p>
          </div>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {visitGoals.slice(0,1).map(g => (
            <button key={g.id} onClick={() => onPause(g.id)} className="text-[10px] text-t4 hover:text-t2 px-2 py-1 rounded-lg hover:bg-s3/50 transition-colors cursor-pointer">Pausar</button>
          ))}
          {visitGoals.slice(0,1).map(g => (
            <button key={`e${g.id}`} onClick={() => onEdit(g)} className="p-1.5 rounded-xl hover:bg-s3/70 text-t4 hover:text-t2 transition-colors cursor-pointer"><Pencil size={13} /></button>
          ))}
        </div>
      </div>

      {/* 3 métricas em destaque */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { val: agendadasMes,     label: 'Agendadas\nno mês',     ok: false, color: 'text-indigo-400' },
          { val: realizadasSemana, label: 'Realizadas\nna semana',  ok: semOk, color: semOk ? 'text-green-400' : 'text-t1' },
          { val: realizadasMes,    label: 'Realizadas\nno mês',     ok: mesOk, color: mesOk ? 'text-green-400' : 'text-t1' },
        ].map(({ val, label, ok, color }) => (
          <div key={label} className={`rounded-xl p-3 border ${ok ? 'border-green-500/20 bg-green-500/5' : 'border-line bg-s2/50'}`}>
            <p className={`text-2xl font-black tabular-nums leading-none ${color}`}>{val}</p>
            <p className="text-[10px] text-t4 mt-1.5 leading-tight whitespace-pre-line">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <p className="text-[10px] text-t4 mb-1.5 flex items-center gap-1"><Calendar size={9}/> Semana — meta {metaSem}</p>
          <Bar value={realizadasSemana} target={metaSem} ok={semOk} />
        </div>
        <div>
          <p className="text-[10px] text-t4 mb-1.5 flex items-center gap-1"><CalendarDays size={9}/> Mês — meta {metaMes}</p>
          <Bar value={realizadasMes} target={metaMes} ok={mesOk} />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 -mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {visitGoals.map(g => (
          <button key={g.id} onClick={() => onDelete(g)} className="text-[10px] text-t4 hover:text-red-400 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-red-500/10 transition-colors cursor-pointer">
            <Trash2 size={9}/> {g.period === 'weekly' ? 'Excluir meta semanal' : 'Excluir meta mensal'}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Bloco hero com score e KPIs de período ────────────────────────────────

function PerformanceHero({ tasks, period }: { tasks: Task[]; period: PeriodTab }) {
  const data = usePeriodData(tasks)

  const kpis = useMemo(() => {
    if (period === 'hoje') return [
      { label: 'Disparos',             value: data.disparosHoje,   target: TARGETS.hoje.disparos,    icon: <Megaphone size={14} />,    note: 'lista fria'     },
      { label: 'Interações com leads', value: data.daily,          target: TARGETS.hoje.interacoes,  icon: <MessageCircle size={14} />, note: 'mensagens/calls' },
    ]
    if (period === 'semana') return [
      { label: 'Disparos enviados',  value: data.disparosSemana, target: TARGETS.semana.disparos,  icon: <Zap size={14} />,         note: 'lista fria'  },
      { label: 'Visitas realizadas', value: data.weekVisits,     target: TARGETS.semana.visitas,   icon: <Footprints size={14} />,  note: 'presenciais' },
      { label: 'Propostas enviadas', value: data.weekProp,       target: TARGETS.semana.propostas, icon: <FileText size={14} />,    note: 'por semana'  },
    ]
    return [
      { label: 'Disparos enviados',  value: data.disparosMes,    target: TARGETS.mes.disparos,  icon: <Zap size={14} />,            note: 'lista fria'   },
      { label: 'Visitas realizadas', value: data.monthVisits,    target: TARGETS.mes.visitas,   icon: <Footprints size={14} />,     note: 'presenciais'  },
      { label: 'Propostas enviadas', value: data.monthProp,      target: TARGETS.mes.propostas, icon: <FileText size={14} />,       note: 'por mês'      },
      { label: 'Vendas fechadas',    value: data.monthSales,     target: TARGETS.mes.vendas,    icon: <BadgeDollarSign size={14} />, note: 'no mês'      },
    ]
  }, [period, data])

  const score = calcScore(kpis)

  const PERIOD_INFO = {
    hoje:   { label: 'de hoje',        sub: new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }) },
    semana: { label: 'desta semana',   sub: (() => { const s = getWeekStart(); const e = new Date(s); e.setDate(s.getDate()+6); return `${s.getDate()}/${s.getMonth()+1} – ${e.getDate()}/${e.getMonth()+1}` })() },
    mes:    { label: 'deste mês',      sub: new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) },
  }

  return (
    <div className="rounded-2xl border border-line overflow-hidden mb-6" style={{ background: 'var(--surface)' }}>
      {/* Score hero */}
      <div className="relative flex items-center gap-6 p-6 pb-5"
        style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(6,182,212,0.03) 100%)' }}
      >
        {/* Gradiente sutil de fundo */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 60% 80% at 15% 50%, rgba(99,102,241,0.08) 0%, transparent 70%)' }} />

        <ScoreRing score={score} />

        <div className="flex-1 min-w-0 relative">
          <p className="text-[10px] font-semibold text-t4 uppercase tracking-widest flex items-center gap-1.5 mb-1">
            <Award size={10} className="text-indigo-400" />
            Performance {PERIOD_INFO[period].label}
          </p>
          <p className="text-xl font-black text-t1 leading-tight">
            {score >= 80 ? 'Você está arrasando!' : score >= 50 ? 'No ritmo certo' : score >= 25 ? 'Precisa acelerar' : 'Vamos começar?'}
          </p>
          <p className="text-xs text-t4 mt-1">{PERIOD_INFO[period].sub}</p>

          {/* Miniatura dos KPIs */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
            {kpis.map(k => {
              const s = getStatus(k.value, k.target)
              const color = s === 'done' ? 'text-green-400' : s === 'good' ? 'text-indigo-400' : s === 'warn' ? 'text-amber-400' : 'text-rose-400'
              return (
                <span key={k.label} className="flex items-center gap-1 text-[11px]">
                  <span className={`font-bold tabular-nums ${color}`}>{k.value}</span>
                  <span className="text-t4">/{k.target}</span>
                  <span className="text-t4 opacity-60">{k.label}</span>
                </span>
              )
            })}
          </div>
        </div>
      </div>

      {/* KPIs expandidos */}
      <div className={`grid gap-3 p-4 pt-0 ${kpis.length === 2 ? 'grid-cols-2' : kpis.length === 3 ? 'grid-cols-3' : 'grid-cols-2 lg:grid-cols-4'}`}>
        {kpis.map(k => <KpiCard key={k.label} {...k} />)}
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function GoalsPage() {
  const { goals, load, loadForBroker, remove, update } = useGoalsStore()
  const { tasks: allTasks, load: loadTasks }  = useTasksStore()
  const { sales: allSales, load: loadSales }  = useSalesStore()
  const { checkAndSave, snapshots }           = useWeekSnapshotStore()
  const { isAdmin, fetchAllProfiles }         = useAuthStore()

  const [tab,          setTab]          = useState<PeriodTab>('semana')
  const [formOpen,     setFormOpen]     = useState(false)
  const [editing,      setEditing]      = useState<Goal | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<Goal | undefined>()
  const [brokers,      setBrokers]      = useState<Profile[]>([])
  const [viewBrokerId, setViewBrokerId] = useState<string | null>(null)

  useEffect(() => { load(); loadTasks(); loadSales() }, [load, loadTasks, loadSales])
  useEffect(() => {
    if (isAdmin) fetchAllProfiles().then(p => setBrokers(p.filter(x => x.role === 'broker'))).catch(() => {})
  }, [isAdmin, fetchAllProfiles])

  async function handleSelectBroker(id: string | null) {
    setViewBrokerId(id)
    if (id) await loadForBroker(id)
    else    await load()
  }

  const tasks = isAdmin && viewBrokerId ? allTasks.filter(t => t.brokerId === viewBrokerId) : allTasks
  const sales = isAdmin && viewBrokerId ? allSales.filter(s => s.brokerId === viewBrokerId) : allSales

  useEffect(() => {
    if (goals.length > 0) checkAndSave(tasks, sales, goals)
  }, [goals, tasks, sales, checkAndSave])

  const active   = goals.filter(g => g.active)
  const inactive = goals.filter(g => !g.active)
  const visitGoals = active.filter(g => g.category === 'visita')
  const otherGoals = active.filter(g => g.category !== 'visita')

  const PERIOD_TABS: Array<{ id: PeriodTab; label: string; sub: string }> = [
    { id: 'hoje',   label: 'Hoje',         sub: new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }) },
    { id: 'semana', label: 'Esta semana',  sub: (() => { const s = getWeekStart(); const e = new Date(s); e.setDate(s.getDate()+6); return `${s.getDate()}/${s.getMonth()+1}–${e.getDate()}/${e.getMonth()+1}` })() },
    { id: 'mes',    label: 'Este mês',     sub: new Date().toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }) },
  ]

  return (
    <PageLayout
      title="Metas"
      subtitle={`${active.length} meta${active.length !== 1 ? 's' : ''} ativa${active.length !== 1 ? 's' : ''}`}
      ctaLabel="Nova Meta"
      onCta={() => { setEditing(undefined); setFormOpen(true) }}
    >

      {/* Admin: seletor de corretor */}
      {isAdmin && brokers.length > 0 && (
        <div className="flex items-center gap-3 mb-5 px-4 py-3 rounded-2xl border border-line bg-s2/30">
          <Users size={13} className="text-t4 flex-shrink-0" />
          <p className="text-xs text-t3 flex-shrink-0">Vendo metas de:</p>
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => handleSelectBroker(null)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${!viewBrokerId ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300' : 'bg-s3/50 border-line text-t3 hover:text-t1'}`}
            >Minhas metas</button>
            {brokers.map(b => (
              <button key={b.id} onClick={() => handleSelectBroker(b.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all cursor-pointer ${viewBrokerId === b.id ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300' : 'bg-s3/50 border-line text-t3 hover:text-t1'}`}
              >{b.name}</button>
            ))}
          </div>
        </div>
      )}

      {/* ── Seletor de período ─────────────────────────────────────────── */}
      <div className="flex gap-1 mb-5 p-1 rounded-2xl border border-line bg-s2/40" style={{ backdropFilter: 'blur(8px)' }}>
        {PERIOD_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex flex-col items-center gap-0.5 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${
              tab === t.id
                ? 'bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 shadow-sm'
                : 'text-t3 hover:text-t2 hover:bg-s3/50 border border-transparent'
            }`}
          >
            <span className={`text-sm font-semibold ${tab === t.id ? 'text-indigo-200' : ''}`}>{t.label}</span>
            <span className="text-[10px] text-t4">{t.sub}</span>
          </button>
        ))}
      </div>

      {/* ── Hero de performance + KPIs ─────────────────────────────────── */}
      <PerformanceHero tasks={tasks} period={tab} />

      {/* Histórico */}
      {snapshots.length > 0 && (
        <div className="flex justify-end mb-6">
          <Link to="/metas/historico" className="flex items-center gap-1.5 text-xs text-t4 hover:text-t2 transition-colors px-3 py-1.5 rounded-xl hover:bg-s3/50">
            <History size={12} />
            Histórico semanal ({snapshots.length} semanas)
            <ChevronRight size={11} />
          </Link>
        </div>
      )}

      {/* ── Metas personalizadas ──────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-bold text-t4 uppercase tracking-widest flex items-center gap-2">
          <TrendingUp size={12} /> Metas personalizadas
        </h2>
        <button
          onClick={() => { setEditing(undefined); setFormOpen(true) }}
          className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
        >
          <Plus size={12} /> Nova
        </button>
      </div>

      {active.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {visitGoals.length > 0 && (
            <VisitasCard
              tasks={tasks} visitGoals={visitGoals}
              onEdit={g => { setEditing(g); setFormOpen(true) }}
              onDelete={g => setDeleteTarget(g)}
              onPause={id => update(id, { active: false })}
            />
          )}
          {otherGoals.map(goal => (
            <GoalCard
              key={goal.id} goal={goal}
              progress={calcProgress(goal, tasks, sales)}
              onEdit={() => { setEditing(goal); setFormOpen(true) }}
              onDelete={() => setDeleteTarget(goal)}
              onPause={() => update(goal.id, { active: false })}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center py-14 gap-4 rounded-2xl border border-dashed border-line mb-8">
          <div className="w-14 h-14 bg-indigo-500/8 rounded-2xl flex items-center justify-center border border-indigo-500/15">
            <Target size={24} className="text-indigo-400/60" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-t2">Nenhuma meta personalizada</p>
            <p className="text-xs text-t4 mt-1">Crie metas para acompanhar visitas, propostas e vendas</p>
          </div>
          <button
            onClick={() => { setEditing(undefined); setFormOpen(true) }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-sm font-medium hover:bg-indigo-500/25 transition-all cursor-pointer"
          >
            <Plus size={14} /> Criar primeira meta
          </button>
        </div>
      )}

      {/* ── Metas pausadas ────────────────────────────────────────────── */}
      {inactive.length > 0 && (
        <div>
          <h2 className="text-xs font-bold text-t4 uppercase tracking-widest mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-t4/40 inline-block" /> Pausadas
          </h2>
          <div className="flex flex-col gap-1.5">
            {inactive.map(goal => {
              const cfg  = CAT_CFG[goal.category]
              const Icon = cfg.icon
              return (
                <div key={goal.id} className="group flex items-center gap-4 px-5 py-3.5 rounded-2xl border border-line bg-s2/20 hover:bg-s3/40 transition-colors">
                  <div className={`w-8 h-8 ${cfg.bg} rounded-xl flex items-center justify-center flex-shrink-0 opacity-40`}>
                    <Icon size={14} className={cfg.text} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-t3 truncate">{goal.name}</p>
                    <p className="text-xs text-t4">{goal.target}× {goal.period === 'weekly' ? 'por semana' : 'por mês'}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => update(goal.id, { active: true })} className="text-xs text-indigo-400 hover:text-indigo-300 px-3 py-1.5 rounded-xl hover:bg-indigo-500/10 transition-colors cursor-pointer">Reativar</button>
                    <button onClick={() => { setEditing(goal); setFormOpen(true) }} className="p-1.5 rounded-xl hover:bg-s3/70 text-t4 hover:text-t2 transition-colors cursor-pointer"><Pencil size={13} /></button>
                    <button onClick={() => setDeleteTarget(goal)} className="p-1.5 rounded-xl hover:bg-red-500/10 text-t4 hover:text-red-400 transition-colors cursor-pointer"><Trash2 size={13} /></button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <GoalForm isOpen={formOpen} onClose={() => setFormOpen(false)} goal={editing} forBrokerId={viewBrokerId ?? undefined} />

      <Modal isOpen={Boolean(deleteTarget)} onClose={() => setDeleteTarget(undefined)} title="Excluir meta" size="sm">
        <p className="text-sm text-t3 mb-6">
          Tem certeza que deseja excluir <span className="text-t1 font-medium">"{deleteTarget?.name}"</span>?
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={() => setDeleteTarget(undefined)}>Cancelar</Button>
          <Button variant="danger" onClick={async () => { if (deleteTarget) { await remove(deleteTarget.id); setDeleteTarget(undefined) } }}>Excluir</Button>
        </div>
      </Modal>
    </PageLayout>
  )
}
