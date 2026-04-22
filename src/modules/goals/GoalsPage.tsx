import { useEffect, useState } from 'react'
import {
  Target, Pencil, Trash2, TrendingUp, CheckCircle2,
  Calendar, CalendarDays, Footprints, Handshake, FileText, BadgeDollarSign
} from 'lucide-react'
import { PageLayout } from '../../components/layout/PageLayout'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { EmptyState } from '../../components/ui/EmptyState'
import { GoalForm } from './GoalForm'
import { useGoalsStore, calcProgress } from '../../store/useGoalsStore'
import { useTasksStore } from '../../store/useTasksStore'
import { useSalesStore } from '../../store/useSalesStore'
import { Goal, GoalCategory } from '../../types'

const CATEGORY_ICON: Record<GoalCategory, typeof Target> = {
  visita:       Footprints,
  agenciamento: Handshake,
  proposta:     FileText,
  venda:        BadgeDollarSign,
}

const CATEGORY_COLOR: Record<GoalCategory, { bg: string; text: string; bar: string; border: string }> = {
  visita:       { bg: 'bg-indigo-500/15',  text: 'text-indigo-400',  bar: 'bg-indigo-500',  border: 'border-indigo-500/30'  },
  agenciamento: { bg: 'bg-cyan-500/15',    text: 'text-cyan-400',    bar: 'bg-cyan-500',    border: 'border-cyan-500/30'    },
  proposta:     { bg: 'bg-amber-500/15',   text: 'text-amber-400',   bar: 'bg-amber-500',   border: 'border-amber-500/30'   },
  venda:        { bg: 'bg-green-500/15',   text: 'text-green-400',   bar: 'bg-green-500',   border: 'border-green-500/30'   },
}

const CATEGORY_LABEL: Record<GoalCategory, string> = {
  visita:       'Visita',
  agenciamento: 'Agenciamento',
  proposta:     'Proposta',
  venda:        'Venda',
}

function ProgressBar({ value, target, barClass }: { value: number; target: number; barClass: string }) {
  const pct = Math.min(100, Math.round((value / target) * 100))
  const done = value >= target
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className={`text-xs font-medium ${done ? 'text-green-400' : 'text-slate-400'}`}>
          {done ? 'Concluída!' : `${value} / ${target}`}
        </span>
        <span className="text-xs text-slate-600">{pct}%</span>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${done ? 'bg-green-500' : barClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function GoalsPage() {
  const { goals, load, remove, update } = useGoalsStore()
  const { tasks, load: loadTasks } = useTasksStore()
  const { sales, load: loadSales } = useSalesStore()
  const [formOpen,     setFormOpen]     = useState(false)
  const [editing,      setEditing]      = useState<Goal | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<Goal | undefined>()

  useEffect(() => { load(); loadTasks(); loadSales() }, [load, loadTasks, loadSales])

  const active   = goals.filter(g => g.active)
  const inactive = goals.filter(g => !g.active)

  function handleDelete() {
    if (!deleteTarget) return
    remove(deleteTarget.id)
    setDeleteTarget(undefined)
  }

  return (
    <PageLayout
      title="Metas"
      subtitle={`${active.length} meta${active.length !== 1 ? 's' : ''} ativa${active.length !== 1 ? 's' : ''}`}
      ctaLabel="Nova Meta"
      onCta={() => { setEditing(undefined); setFormOpen(true) }}
    >
      {goals.length === 0 ? (
        <EmptyState
          icon={<Target size={24} />}
          title="Nenhuma meta cadastrada"
          description="Crie metas para acompanhar seu progresso semanal e mensal."
          ctaLabel="Nova Meta"
          onCta={() => { setEditing(undefined); setFormOpen(true) }}
        />
      ) : (
        <>
          {/* Active goals */}
          {active.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <TrendingUp size={13} /> Metas ativas
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-4">
                {active.map(goal => {
                  const progress = calcProgress(goal, tasks, sales)
                  const colors   = CATEGORY_COLOR[goal.category]
                  const Icon     = CATEGORY_ICON[goal.category]
                  const done     = progress >= goal.target

                  return (
                    <Card
                      key={goal.id}
                      className={`relative group border ${colors.border} transition-all duration-200`}
                    >
                      {done && (
                        <div className="absolute top-3 right-3">
                          <CheckCircle2 size={16} className="text-green-400" />
                        </div>
                      )}

                      {/* Header */}
                      <div className="flex items-start gap-3 mb-4">
                        <div className={`w-9 h-9 ${colors.bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                          <Icon size={16} className={colors.text} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-100 truncate">{goal.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`text-xs font-medium ${colors.text}`}>
                              {CATEGORY_LABEL[goal.category]}
                            </span>
                            <span className="text-slate-700">·</span>
                            <span className="text-xs text-slate-500 flex items-center gap-1">
                              {goal.period === 'weekly'
                                ? <><Calendar size={10} /> Semanal</>
                                : <><CalendarDays size={10} /> Mensal</>
                              }
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Big number */}
                      <div className="flex items-baseline gap-1.5 mb-4">
                        <span className={`text-3xl font-bold tabular-nums ${done ? 'text-green-400' : 'text-slate-100'}`}>
                          {progress}
                        </span>
                        <span className="text-sm text-slate-600">/ {goal.target}</span>
                      </div>

                      <ProgressBar value={progress} target={goal.target} barClass={colors.bar} />

                      {/* Actions */}
                      <div className="flex gap-1 mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => update(goal.id, { active: false })}
                          className="flex-1 text-xs text-slate-500 hover:text-slate-300 py-1.5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                        >
                          Pausar
                        </button>
                        <button
                          onClick={() => { setEditing(goal); setFormOpen(true) }}
                          className="p-1.5 rounded-lg hover:bg-white/8 text-slate-600 hover:text-slate-300 transition-colors cursor-pointer"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(goal)}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-colors cursor-pointer"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </Card>
                  )
                })}
              </div>
            </div>
          )}

          {/* Inactive goals */}
          {inactive.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
                Pausadas
              </h2>
              <div className="flex flex-col gap-2">
                {inactive.map(goal => {
                  const colors = CATEGORY_COLOR[goal.category]
                  const Icon   = CATEGORY_ICON[goal.category]
                  return (
                    <div key={goal.id}
                      className="flex items-center gap-4 px-5 py-3.5 bg-white/3 rounded-2xl border border-white/5 group hover:bg-white/5 transition-colors"
                    >
                      <div className={`w-8 h-8 ${colors.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                        <Icon size={14} className={`${colors.text} opacity-50`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-500 truncate">{goal.name}</p>
                        <p className="text-xs text-slate-700">{goal.target}x {goal.period === 'weekly' ? 'por semana' : 'por mês'}</p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => update(goal.id, { active: true })}
                          className="text-xs text-indigo-400 hover:text-indigo-300 px-3 py-1.5 rounded-lg hover:bg-indigo-500/10 transition-colors cursor-pointer"
                        >
                          Reativar
                        </button>
                        <button
                          onClick={() => { setEditing(goal); setFormOpen(true) }}
                          className="p-1.5 rounded-lg hover:bg-white/8 text-slate-600 hover:text-slate-300 transition-colors cursor-pointer"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(goal)}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-colors cursor-pointer"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      <GoalForm isOpen={formOpen} onClose={() => setFormOpen(false)} goal={editing} />

      <Modal isOpen={Boolean(deleteTarget)} onClose={() => setDeleteTarget(undefined)} title="Excluir meta" size="sm">
        <p className="text-sm text-slate-400 mb-6">
          Tem certeza que deseja excluir <span className="text-slate-200 font-medium">"{deleteTarget?.name}"</span>?
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setDeleteTarget(undefined)}>Cancelar</Button>
          <Button variant="danger"    className="flex-1" onClick={handleDelete}>Excluir</Button>
        </div>
      </Modal>
    </PageLayout>
  )
}
