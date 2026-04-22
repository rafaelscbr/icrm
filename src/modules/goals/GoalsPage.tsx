import { useEffect, useState } from 'react'
import {
  Target, Pencil, Trash2, TrendingUp, CheckCircle2,
  Calendar, CalendarDays, Footprints, Handshake, FileText, BadgeDollarSign,
  CalendarCheck, ClipboardList
} from 'lucide-react'
import { PageLayout } from '../../components/layout/PageLayout'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { EmptyState } from '../../components/ui/EmptyState'
import { GoalForm } from './GoalForm'
import { useGoalsStore, calcProgress, getVisitMetrics } from '../../store/useGoalsStore'
import { useTasksStore } from '../../store/useTasksStore'
import { useSalesStore } from '../../store/useSalesStore'
import { Goal, GoalCategory, Task } from '../../types'

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
  const pct  = Math.min(100, target > 0 ? Math.round((value / target) * 100) : 0)
  const done = value >= target
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className={`text-xs font-medium ${done ? 'text-green-400' : 'text-slate-400'}`}>
          {done ? 'Meta atingida!' : `${value} / ${target}`}
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

// ─── Card unificado de Visitas ────────────────────────────────────────────────

interface VisitasSectionProps {
  tasks:       Task[]
  visitGoals:  Goal[]
  onEdit:      (g: Goal) => void
  onDelete:    (g: Goal) => void
  onPause:     (id: string) => void
}

function VisitasSection({ tasks, visitGoals, onEdit, onDelete, onPause }: VisitasSectionProps) {
  const { agendadasMes, realizadasSemana, realizadasMes } = getVisitMetrics(tasks)

  const metaSemanal = visitGoals.find(g => g.period === 'weekly')?.target  ?? 2
  const metaMensal  = visitGoals.find(g => g.period === 'monthly')?.target ?? 8

  const semanaOk = realizadasSemana >= metaSemanal
  const mesOk    = realizadasMes    >= metaMensal

  return (
    <Card className="border border-indigo-500/30">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-500/15 rounded-xl flex items-center justify-center">
            <Footprints size={16} className="text-indigo-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-100">Visitas</p>
            <p className="text-xs text-indigo-400">Meta: {metaSemanal}/semana · {metaMensal}/mês</p>
          </div>
        </div>
        {/* ações dos goals de visita */}
        <div className="flex gap-1">
          {visitGoals.slice(0, 1).map(g => (
            <div key={g.id} className="flex gap-1">
              <button
                onClick={() => onPause(g.id)}
                className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
              >
                Pausar
              </button>
              <button
                onClick={() => onEdit(g)}
                className="p-1.5 rounded-lg hover:bg-white/8 text-slate-600 hover:text-slate-300 transition-colors cursor-pointer"
              >
                <Pencil size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 3 métricas */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {/* Agendadas no mês */}
        <div className="bg-white/3 rounded-2xl p-3 text-center border border-white/5">
          <div className="flex items-center justify-center mb-1.5">
            <ClipboardList size={13} className="text-indigo-400" />
          </div>
          <p className="text-2xl font-bold tabular-nums text-indigo-400">{agendadasMes}</p>
          <p className="text-[10px] text-slate-500 mt-1 leading-tight">Agendadas<br/>no mês</p>
        </div>

        {/* Realizadas na semana */}
        <div className={`bg-white/3 rounded-2xl p-3 text-center border ${semanaOk ? 'border-green-500/30' : 'border-white/5'}`}>
          <div className="flex items-center justify-center mb-1.5">
            <CalendarCheck size={13} className={semanaOk ? 'text-green-400' : 'text-slate-400'} />
          </div>
          <p className={`text-2xl font-bold tabular-nums ${semanaOk ? 'text-green-400' : 'text-slate-100'}`}>
            {realizadasSemana}
          </p>
          <p className="text-[10px] text-slate-500 mt-1 leading-tight">Realizadas<br/>na semana</p>
        </div>

        {/* Realizadas no mês */}
        <div className={`bg-white/3 rounded-2xl p-3 text-center border ${mesOk ? 'border-green-500/30' : 'border-white/5'}`}>
          <div className="flex items-center justify-center mb-1.5">
            <CalendarDays size={13} className={mesOk ? 'text-green-400' : 'text-slate-400'} />
          </div>
          <p className={`text-2xl font-bold tabular-nums ${mesOk ? 'text-green-400' : 'text-slate-100'}`}>
            {realizadasMes}
          </p>
          <p className="text-[10px] text-slate-500 mt-1 leading-tight">Realizadas<br/>no mês</p>
        </div>
      </div>

      {/* Barras de progresso */}
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-xs text-slate-500 mb-1.5 flex items-center gap-1.5">
            <Calendar size={10} /> Semana — meta {metaSemanal}
          </p>
          <ProgressBar value={realizadasSemana} target={metaSemanal} barClass="bg-indigo-500" />
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1.5 flex items-center gap-1.5">
            <CalendarDays size={10} /> Mês — meta {metaMensal}
          </p>
          <ProgressBar value={realizadasMes} target={metaMensal} barClass="bg-indigo-500" />
        </div>
      </div>

      {/* Ações de delete para goals adicionais */}
      <div className="flex flex-wrap gap-2 mt-4">
        {visitGoals.map(g => (
          <button
            key={g.id}
            onClick={() => onDelete(g)}
            className="text-[10px] text-slate-600 hover:text-red-400 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-red-500/10 transition-colors cursor-pointer"
          >
            <Trash2 size={10} />
            Excluir meta {g.period === 'weekly' ? 'semanal' : 'mensal'}
          </button>
        ))}
      </div>
    </Card>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function GoalsPage() {
  const { goals, load, remove, update } = useGoalsStore()
  const { tasks, load: loadTasks }      = useTasksStore()
  const { sales, load: loadSales }      = useSalesStore()
  const [formOpen,     setFormOpen]     = useState(false)
  const [editing,      setEditing]      = useState<Goal | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<Goal | undefined>()

  useEffect(() => { load(); loadTasks(); loadSales() }, [load, loadTasks, loadSales])

  const active   = goals.filter(g => g.active)
  const inactive = goals.filter(g => !g.active)

  // Separa goals de visita (exibidos no card unificado) dos demais
  const visitGoals    = active.filter(g => g.category === 'visita')
  const otherGoals    = active.filter(g => g.category !== 'visita')
  const inactiveVisit = inactive.filter(g => g.category === 'visita')
  const inactiveOther = inactive.filter(g => g.category !== 'visita')

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
          {/* Metas ativas */}
          {active.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <TrendingUp size={13} /> Metas ativas
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {/* Card unificado de visitas */}
                {visitGoals.length > 0 && (
                  <VisitasSection
                    tasks={tasks}
                    visitGoals={visitGoals}
                    onEdit={(g) => { setEditing(g); setFormOpen(true) }}
                    onDelete={(g) => setDeleteTarget(g)}
                    onPause={(id) => update(id, { active: false })}
                  />
                )}

                {/* Outros goals (agenciamento, proposta, venda) */}
                {otherGoals.map(goal => {
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
                      <div className="flex items-start gap-3 mb-4">
                        <div className={`w-9 h-9 ${colors.bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                          <Icon size={16} className={colors.text} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-100 truncate">{goal.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`text-xs font-medium ${colors.text}`}>{CATEGORY_LABEL[goal.category]}</span>
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

                      <div className="flex items-baseline gap-1.5 mb-4">
                        <span className={`text-3xl font-bold tabular-nums ${done ? 'text-green-400' : 'text-slate-100'}`}>
                          {progress}
                        </span>
                        <span className="text-sm text-slate-600">/ {goal.target}</span>
                      </div>

                      <ProgressBar value={progress} target={goal.target} barClass={colors.bar} />

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

          {/* Metas pausadas */}
          {inactive.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Pausadas</h2>
              <div className="flex flex-col gap-2">
                {[...inactiveVisit, ...inactiveOther].map(goal => {
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
