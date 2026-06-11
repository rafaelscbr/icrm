import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Target, Zap, Footprints, FileText, BadgeDollarSign,
  RefreshCw, AlertTriangle, ArrowRight, CheckCircle2,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/useAuthStore'
import { Avatar } from '../../components/ui/Avatar'
import { formatCurrency } from '../../lib/formatters'
import { GoalPeriod } from '../../types'

// ─── Tipos do payload da RPC dashboard_performance ───────────────────────────

interface PerfNumbers {
  acionamentos: number
  visitas: number
  visitasAgendadas: number
  propostas: number
  vendas: number
  vgv: number
}

interface PerfBroker {
  id: string
  name: string
  avatarUrl: string | null
  week: PerfNumbers
  month: PerfNumbers
  goals: Record<string, number>   // ex: { acionamento_weekly: 250, venda_monthly: 2 }
}

interface PerfData {
  week:  { start: string; end: string }
  month: { start: string; end: string }
  brokers: PerfBroker[]
}

// ─── Categorias exibidas ──────────────────────────────────────────────────────

const METRICS: Array<{
  key: 'acionamento' | 'visita' | 'proposta' | 'venda'
  label: string
  icon: typeof Target
  text: string
  realized: (n: PerfNumbers) => number
  sub?: (n: PerfNumbers) => string | null
}> = [
  { key: 'acionamento', label: 'Acionamentos', icon: Zap,        text: 'text-cyan-400',
    realized: n => n.acionamentos },
  { key: 'visita',      label: 'Visitas',      icon: Footprints, text: 'text-indigo-400',
    realized: n => n.visitas,
    sub: n => n.visitasAgendadas > n.visitas ? `${n.visitasAgendadas} agendadas` : null },
  { key: 'proposta',    label: 'Propostas',    icon: FileText,   text: 'text-amber-400',
    realized: n => n.propostas },
  { key: 'venda',       label: 'Vendas',       icon: BadgeDollarSign, text: 'text-green-400',
    realized: n => n.vendas,
    sub: n => n.vgv > 0 ? formatCurrency(n.vgv) : null },
]

function attainment(realized: number, target: number): number {
  if (target <= 0) return 0
  return Math.round((realized / target) * 100)
}

function barClasses(pct: number): { bar: string; text: string } {
  if (pct >= 100) return { bar: 'bg-brand',      text: 'text-brand'     }
  if (pct >= 60)  return { bar: 'bg-green-500',  text: 'text-green-400' }
  if (pct >= 30)  return { bar: 'bg-amber-500',  text: 'text-amber-400' }
  return               { bar: 'bg-red-500',      text: 'text-red-400'   }
}

// ─── Célula de métrica (meta x realizado) ─────────────────────────────────────

function MetricCell({
  label, icon: Icon, text, realized, target, sub, onSetGoal,
}: {
  label: string; icon: typeof Target; text: string
  realized: number; target: number | undefined; sub: string | null
  onSetGoal: () => void
}) {
  const hasGoal = target !== undefined && target > 0
  const pct     = hasGoal ? attainment(realized, target) : 0
  const colors  = barClasses(pct)
  const done    = hasGoal && pct >= 100

  return (
    <div className="bg-s2/40 rounded-xl p-3 flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-1.5">
        <Icon size={11} className={text} />
        <p className="font-label text-[9px] font-medium uppercase tracking-[0.08em] text-t4 truncate">{label}</p>
        {done && <CheckCircle2 size={11} className="text-brand ml-auto flex-shrink-0" />}
      </div>

      <div className="flex items-baseline gap-1">
        <p className="text-2xl font-black text-t1 tabular-nums leading-none">{realized.toLocaleString('pt-BR')}</p>
        {hasGoal
          ? <p className="text-[11px] text-t4 tabular-nums">/ {target.toLocaleString('pt-BR')}</p>
          : (
            <button
              onClick={onSetGoal}
              className="text-[10px] text-t4 hover:text-brand transition-colors cursor-pointer ml-1"
            >
              definir meta →
            </button>
          )
        }
        {hasGoal && <p className={`text-[11px] font-bold tabular-nums ml-auto ${colors.text}`}>{pct}%</p>}
      </div>

      {hasGoal && (
        <div className="h-1 bg-s3/60 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${colors.bar}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      )}

      {sub && <p className="text-[10px] text-t4 truncate">{sub}</p>}
    </div>
  )
}

// ─── Widget principal ─────────────────────────────────────────────────────────

export function PerformanceGoalsWidget() {
  const navigate = useNavigate()
  const { isAdmin, viewAsBrokerId, profile } = useAuthStore()

  const [data,    setData]    = useState<PerfData | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [period,  setPeriod]  = useState<GoalPeriod>('weekly')

  async function fetchData() {
    setLoading(true)
    setError(null)
    const { data: result, error: rpcError } = await supabase.rpc('dashboard_performance')
    if (rpcError) {
      // Banco é a única fonte de verdade — erro aparece, nunca é mascarado
      setError(rpcError.message)
      setLoading(false)
      return
    }
    setData(result as PerfData)
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const visibleBrokers = useMemo(() => {
    if (!data) return []
    let brokers = data.brokers
    if (viewAsBrokerId) brokers = brokers.filter(b => b.id === viewAsBrokerId)
    else if (!isAdmin && profile?.id) brokers = brokers.filter(b => b.id === profile.id)
    // Oculta perfis sem qualquer atividade e sem metas (ex: contas de teste)
    return brokers.filter(b => {
      const hasGoals    = Object.values(b.goals).some(t => t > 0)
      const hasActivity = [b.week, b.month].some(n =>
        n.acionamentos > 0 || n.visitas > 0 || n.visitasAgendadas > 0 || n.propostas > 0 || n.vendas > 0
      )
      return hasGoals || hasActivity
    })
  }, [data, viewAsBrokerId, isAdmin, profile?.id])

  const periodLabel = useMemo(() => {
    if (!data) return ''
    if (period === 'weekly') {
      const fmt = (d: string) => d.split('-').slice(1).reverse().join('/')
      return `${fmt(data.week.start)} – ${fmt(data.week.end)}`
    }
    const [y, m] = data.month.start.split('-')
    const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
    return `${months[Number(m) - 1]} ${y}`
  }, [data, period])

  // Totais da equipe — soma realizados; meta só soma onde está definida
  const team = useMemo(() => {
    if (visibleBrokers.length < 2) return null
    return METRICS.map(metric => {
      const goalKey  = `${metric.key}_${period}` as const
      const realized = visibleBrokers.reduce((acc, b) => acc + metric.realized(period === 'weekly' ? b.week : b.month), 0)
      const targets  = visibleBrokers.map(b => b.goals[goalKey]).filter((t): t is number => typeof t === 'number' && t > 0)
      return { metric, realized, target: targets.length > 0 ? targets.reduce((a, t) => a + t, 0) : undefined }
    })
  }, [visibleBrokers, period])

  return (
    <div className="rounded-xl border border-line bg-page overflow-hidden mb-6 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-line">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand/15 rounded-lg flex items-center justify-center">
            <Target size={15} className="text-brand" />
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-widest text-t4 uppercase">Meta x Realizado</p>
            <h2 className="text-sm font-bold text-t1 leading-none mt-0.5">{periodLabel || 'Desempenho'}</h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 p-0.5 rounded-xl border border-line bg-s2/40">
            {([['weekly', 'Semana'], ['monthly', 'Mês']] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setPeriod(value)}
                className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  period === value
                    ? 'bg-brand/15 text-brand border border-brand/25'
                    : 'text-t3 hover:text-t2 border border-transparent'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2 rounded-lg text-t4 hover:text-t2 hover:bg-s2/60 transition-colors cursor-pointer disabled:opacity-50"
            aria-label="Atualizar"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Erro de banco — exibido, nunca mascarado */}
      {error && (
        <div className="flex items-center gap-3 px-5 py-4 bg-red-500/5">
          <AlertTriangle size={16} className="text-red-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-300">Não foi possível carregar o desempenho</p>
            <p className="text-xs text-red-400/70 truncate">{error}</p>
          </div>
          <button
            onClick={fetchData}
            className="text-xs text-red-300 border border-red-500/30 hover:bg-red-500/10 px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex-shrink-0"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Loading inicial */}
      {loading && !data && !error && (
        <div className="flex items-center justify-center py-10">
          <div className="w-7 h-7 rounded-full border-2 border-brand/30 border-t-brand animate-spin" />
        </div>
      )}

      {/* Corretores */}
      {data && !error && (
        <div className="flex flex-col divide-y divide-line">
          {visibleBrokers.map(broker => {
            const numbers = period === 'weekly' ? broker.week : broker.month
            return (
              <div key={broker.id} className="px-5 py-4">
                <div className="flex items-center gap-2.5 mb-3">
                  <Avatar name={broker.name} photoUrl={broker.avatarUrl ?? undefined} size="sm" />
                  <p className="font-heading text-[13px] font-bold text-t1 tracking-[-0.01em]">{broker.name}</p>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  {METRICS.map(metric => (
                    <MetricCell
                      key={metric.key}
                      label={metric.label}
                      icon={metric.icon}
                      text={metric.text}
                      realized={metric.realized(numbers)}
                      target={broker.goals[`${metric.key}_${period}`]}
                      sub={metric.sub?.(numbers) ?? null}
                      onSetGoal={() => navigate('/metas')}
                    />
                  ))}
                </div>
              </div>
            )
          })}

          {/* Linha consolidada da equipe */}
          {team && (
            <div className="px-5 py-4 bg-s2/20">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-7 h-7 rounded-full bg-brand/15 border border-brand/25 flex items-center justify-center">
                  <Target size={12} className="text-brand" />
                </div>
                <p className="font-heading text-[13px] font-bold text-t1 tracking-[-0.01em]">Equipe</p>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {team.map(({ metric, realized, target }) => (
                  <MetricCell
                    key={metric.key}
                    label={metric.label}
                    icon={metric.icon}
                    text={metric.text}
                    realized={realized}
                    target={target}
                    sub={null}
                    onSetGoal={() => navigate('/metas')}
                  />
                ))}
              </div>
            </div>
          )}

          {visibleBrokers.length === 0 && (
            <div className="flex flex-col items-center py-8 gap-2">
              <Target size={26} className="text-t4" />
              <p className="text-sm text-t3">Nenhum desempenho para exibir ainda</p>
              <button
                onClick={() => navigate('/metas')}
                className="text-xs text-brand hover:text-brand-text transition-colors cursor-pointer flex items-center gap-1"
              >
                Definir metas <ArrowRight size={11} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
