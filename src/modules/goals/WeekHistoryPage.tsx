import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  History, ArrowLeft, Trophy, TrendingUp, TrendingDown, Minus,
  Footprints, Handshake, FileText, BadgeDollarSign, Target,
} from 'lucide-react'
import { PageLayout } from '../../components/layout/PageLayout'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { useWeekSnapshotStore } from '../../store/useWeekSnapshotStore'
import { useGoalsStore } from '../../store/useGoalsStore'
import { useTasksStore } from '../../store/useTasksStore'
import { useSalesStore } from '../../store/useSalesStore'
import { WeekSnapshot, GoalCategory } from '../../types'

const MONTHS_PT_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const CATEGORY_ICON: Record<GoalCategory, typeof Target> = {
  visita:       Footprints,
  agenciamento: Handshake,
  proposta:     FileText,
  venda:        BadgeDollarSign,
}

const CATEGORY_COLOR: Record<GoalCategory, { text: string; bar: string }> = {
  visita:       { text: 'text-indigo-400', bar: 'bg-indigo-500' },
  agenciamento: { text: 'text-cyan-400',   bar: 'bg-cyan-500'   },
  proposta:     { text: 'text-amber-400',  bar: 'bg-amber-500'  },
  venda:        { text: 'text-green-400',  bar: 'bg-green-500'  },
}

function formatWeekLabel(weekStart: string, weekEnd: string): { range: string; year: string } {
  const [sy, sm, sd] = weekStart.split('-').map(Number)
  const [, em, ed]   = weekEnd.split('-').map(Number)
  const startLabel = `${sd} ${MONTHS_PT_SHORT[sm - 1]}`
  const endLabel   = `${ed} ${MONTHS_PT_SHORT[em - 1]}`
  return { range: `${startLabel} – ${endLabel}`, year: String(sy) }
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80 ? 'bg-green-500/15 text-green-400 border-green-500/30' :
    score >= 50 ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' :
                  'bg-red-500/15 text-red-400 border-red-500/30'
  const Icon = score >= 80 ? TrendingUp : score >= 50 ? Minus : TrendingDown
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-bold ${color}`}>
      <Icon size={13} />
      {score}%
    </div>
  )
}

function WeekCard({ snapshot }: { snapshot: WeekSnapshot }) {
  const { range, year } = formatWeekLabel(snapshot.weekStart, snapshot.weekEnd)

  return (
    <Card className="border border-white/8">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-sm font-semibold text-slate-100">{range}</p>
          <p className="text-xs text-slate-600 mt-0.5">{year}</p>
        </div>
        <ScoreBadge score={snapshot.score} />
      </div>

      {/* Goal rows */}
      <div className="flex flex-col gap-3">
        {snapshot.entries.map(entry => {
          const Icon   = CATEGORY_ICON[entry.category]
          const colors = CATEGORY_COLOR[entry.category]
          const pct    = entry.target > 0 ? Math.min(100, Math.round((entry.achieved / entry.target) * 100)) : 0
          const done   = entry.achieved >= entry.target

          return (
            <div key={entry.goalId}>
              <div className="flex items-center gap-2 mb-1">
                <Icon size={11} className={colors.text} />
                <span className="text-xs text-slate-400 flex-1 truncate">{entry.goalName}</span>
                <span className={`text-xs font-medium tabular-nums ${done ? 'text-green-400' : 'text-slate-400'}`}>
                  {entry.achieved}/{entry.target}
                </span>
                <span className="text-xs text-slate-600 tabular-nums w-8 text-right">{pct}%</span>
              </div>
              <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${done ? 'bg-green-500' : colors.bar}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

export function WeekHistoryPage() {
  const { snapshots, checkAndSave } = useWeekSnapshotStore()
  const { goals, load: loadGoals }   = useGoalsStore()
  const { tasks, load: loadTasks }   = useTasksStore()
  const { sales, load: loadSales }   = useSalesStore()

  useEffect(() => {
    Promise.all([loadGoals(), loadTasks(), loadSales()])
  }, [loadGoals, loadTasks, loadSales])

  useEffect(() => {
    if (goals.length > 0) checkAndSave(tasks, sales, goals)
  }, [goals, tasks, sales, checkAndSave])

  const avgScore = snapshots.length > 0
    ? Math.round(snapshots.reduce((a, s) => a + s.score, 0) / snapshots.length)
    : 0
  const bestScore  = snapshots.length > 0 ? Math.max(...snapshots.map(s => s.score)) : 0
  const perfect    = snapshots.filter(s => s.score === 100).length

  return (
    <PageLayout
      title="Histórico Semanal"
      subtitle={`${snapshots.length} semana${snapshots.length !== 1 ? 's' : ''} registrada${snapshots.length !== 1 ? 's' : ''}`}
    >
      {/* Back link */}
      <Link
        to="/metas"
        className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 mb-6 transition-colors"
      >
        <ArrowLeft size={12} /> Voltar para Metas
      </Link>

      {snapshots.length === 0 ? (
        <EmptyState
          icon={<History size={24} />}
          title="Nenhuma semana registrada ainda"
          description="O histórico é gerado automaticamente ao virar a semana. Complete uma semana com atividades e volte aqui."
        />
      ) : (
        <>
          {/* Summary strip */}
          <div className="grid grid-cols-3 gap-3 mb-8">
            <Card className="text-center border border-white/8">
              <p className="text-2xl font-bold text-slate-100 tabular-nums">{avgScore}%</p>
              <p className="text-xs text-slate-500 mt-1">Média geral</p>
            </Card>
            <Card className="text-center border border-white/8">
              <p className="text-2xl font-bold text-green-400 tabular-nums">{bestScore}%</p>
              <p className="text-xs text-slate-500 mt-1">Melhor semana</p>
            </Card>
            <Card className="text-center border border-white/8">
              <div className="flex items-center justify-center gap-1">
                <Trophy size={16} className="text-amber-400" />
                <p className="text-2xl font-bold text-amber-400 tabular-nums">{perfect}</p>
              </div>
              <p className="text-xs text-slate-500 mt-1">Semanas 100%</p>
            </Card>
          </div>

          {/* Week cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {snapshots.map(snapshot => (
              <WeekCard key={snapshot.id} snapshot={snapshot} />
            ))}
          </div>
        </>
      )}
    </PageLayout>
  )
}
