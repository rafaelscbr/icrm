import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Target, Zap, Footprints, FileText, BadgeDollarSign,
  RefreshCw, AlertTriangle, ArrowRight,
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
  { key: 'visita',      label: 'Atendimentos', icon: Footprints, text: 'text-indigo-400',
    realized: n => n.visitas,
    sub: n => n.visitasAgendadas > n.visitas ? `${n.visitasAgendadas} agendados` : null },
  { key: 'proposta',    label: 'Propostas',    icon: FileText,   text: 'text-amber-400',
    realized: n => n.propostas },
  { key: 'venda',       label: 'Vendas',       icon: BadgeDollarSign, text: 'text-green-400',
    realized: n => n.vendas,
    sub: n => n.vgv > 0 ? formatCurrency(n.vgv) : null },
]

// ─── Ritmo do período ─────────────────────────────────────────────────────────
// Quanto do período já passou define quanto da meta "deveria" estar feito hoje.

interface Pace { elapsed: number; total: number; remaining: number; fraction: number }

function calcPace(start: string, end: string): Pace {
  const DAY = 86_400_000
  const s = new Date(start + 'T00:00:00').getTime()
  const e = new Date(end   + 'T00:00:00').getTime()
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const total   = Math.round((e - s) / DAY) + 1
  const elapsed = Math.min(Math.max(Math.round((today.getTime() - s) / DAY) + 1, 0), total)
  return { elapsed, total, remaining: Math.max(total - elapsed + 1, 1), fraction: elapsed / total }
}

type PaceStatus = 'done' | 'onTrack' | 'warning' | 'behind'

function paceStatus(realized: number, target: number, fraction: number): PaceStatus {
  if (realized >= target) return 'done'
  const expected = target * fraction
  if (realized >= expected)       return 'onTrack'
  if (realized >= expected * 0.7) return 'warning'
  return 'behind'
}

const STATUS_CFG: Record<PaceStatus, { chip: string; label: string; bar: string; pct: string }> = {
  done:    { chip: 'text-brand bg-brand/10 border-brand/30',          label: 'Meta batida', bar: 'bg-brand',     pct: 'text-brand'     },
  onTrack: { chip: 'text-green-400 bg-green-500/10 border-green-500/25', label: 'No ritmo', bar: 'bg-green-500', pct: 'text-green-400' },
  warning: { chip: 'text-amber-400 bg-amber-500/10 border-amber-500/25', label: 'Atenção',  bar: 'bg-amber-500', pct: 'text-amber-400' },
  behind:  { chip: 'text-red-400 bg-red-500/10 border-red-500/25',       label: 'Atrasado', bar: 'bg-red-500',   pct: 'text-red-400'   },
}

// ─── Anel de score (média de atingimento das metas do corretor) ───────────────

function ScoreRing({ score }: { score: number }) {
  const r = 24; const sz = 60; const circ = 2 * Math.PI * r
  const dash  = (Math.min(score, 100) / 100) * circ
  const color = score >= 100 ? 'var(--brand, #D4AF37)' : score >= 75 ? '#22c55e' : score >= 45 ? '#f59e0b' : '#ef4444'
  return (
    <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`} className="flex-shrink-0">
      <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={5} />
      <circle
        cx={sz/2} cy={sz/2} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeLinecap="round" strokeDasharray={`${dash} ${circ}`}
        transform={`rotate(-90 ${sz/2} ${sz/2})`}
        style={{ transition: 'stroke-dasharray 0.7s ease' }}
      />
      <text x={sz/2} y={sz/2 + 4} textAnchor="middle" fill="currentColor" className="text-t1" fontSize={14} fontWeight={800} fontFamily="inherit">
        {Math.round(score)}
      </text>
    </svg>
  )
}

// ─── Célula de métrica (meta x realizado + ritmo) ─────────────────────────────

function MetricCell({
  label, icon: Icon, text, realized, target, sub, pace, onSetGoal,
}: {
  label: string; icon: typeof Target; text: string
  realized: number; target: number | undefined; sub: string | null
  pace: Pace; onSetGoal: () => void
}) {
  const hasGoal = target !== undefined && target > 0
  const status  = hasGoal ? paceStatus(realized, target, pace.fraction) : null
  const cfg     = status ? STATUS_CFG[status] : null
  const pct     = hasGoal ? Math.round((realized / target) * 100) : 0
  const expectedPct = hasGoal ? Math.min(Math.round(pace.fraction * 100), 100) : 0

  const missing  = hasGoal ? Math.max(target - realized, 0) : 0
  const perDay   = hasGoal && missing > 0 ? Math.ceil(missing / pace.remaining) : 0
  const hint     = hasGoal && status !== 'done'
    ? `faltam ${missing.toLocaleString('pt-BR')} · ~${perDay.toLocaleString('pt-BR')}/dia`
    : null

  return (
    <div className="bg-s2/40 rounded-xl p-3 flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-1.5">
        <Icon size={11} className={text} />
        <p className="font-label text-[11px] font-medium uppercase tracking-[0.08em] text-t4 truncate">{label}</p>
        {cfg && (
          <span className={`ml-auto flex-shrink-0 text-[11px] font-bold px-1.5 py-px rounded-full border ${cfg.chip}`}>
            {cfg.label}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-1">
        <p className="text-2xl font-black text-t1 tabular-nums leading-none">{realized.toLocaleString('pt-BR')}</p>
        {hasGoal
          ? <p className="text-xs text-t4 tabular-nums">/ {target.toLocaleString('pt-BR')}</p>
          : (
            <button
              onClick={onSetGoal}
              className="text-[11px] text-t4 hover:text-brand transition-colors cursor-pointer ml-1"
            >
              definir meta →
            </button>
          )
        }
        {cfg && <p className={`text-xs font-bold tabular-nums ml-auto ${cfg.pct}`}>{pct}%</p>}
      </div>

      {hasGoal && cfg && (
        <div className="relative h-1.5 bg-s3/60 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${cfg.bar}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
          {/* Marcador do ritmo esperado para hoje */}
          {expectedPct > 0 && expectedPct < 100 && (
            <div className="absolute top-0 bottom-0 w-px bg-white/50" style={{ left: `${expectedPct}%` }} />
          )}
        </div>
      )}

      {(hint || sub) && (
        <p className="text-[11px] text-t4 truncate tabular-nums">
          {hint}{hint && sub ? ' · ' : ''}{sub}
        </p>
      )}
    </div>
  )
}

// ─── Linha de um corretor ─────────────────────────────────────────────────────

function BrokerRow({
  name, avatarUrl, numbers, goals, period, pace, highlight, onSetGoal,
}: {
  name: string; avatarUrl?: string | null
  numbers: PerfNumbers; goals: Record<string, number>
  period: GoalPeriod; pace: Pace; highlight?: boolean
  onSetGoal: () => void
}) {
  // Score = média do atingimento (capado em 100) das metas definidas no período
  const score = useMemo(() => {
    const pcts = METRICS
      .map(m => ({ realized: m.realized(numbers), target: goals[`${m.key}_${period}`] }))
      .filter((x): x is { realized: number; target: number } => typeof x.target === 'number' && x.target > 0)
      .map(x => Math.min((x.realized / x.target) * 100, 100))
    if (pcts.length === 0) return null
    return pcts.reduce((a, p) => a + p, 0) / pcts.length
  }, [numbers, goals, period])

  const scoreLabel = score === null ? null
    : score >= 100 ? 'Tudo batido'
    : score >= 75  ? 'Forte'
    : score >= 45  ? 'No jogo'
    : 'Reagir'

  return (
    <div className={`px-5 py-4 ${highlight ? 'bg-s2/20' : ''}`}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        {/* Identidade + score */}
        <div className="flex items-center gap-3 sm:w-44 flex-shrink-0">
          {score !== null
            ? <ScoreRing score={score} />
            : <div className="w-[60px] h-[60px] rounded-full bg-s2/60 border border-line flex items-center justify-center flex-shrink-0">
                <Target size={18} className="text-t4" />
              </div>
          }
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Avatar name={name} photoUrl={avatarUrl ?? undefined} size="xs" />
              <p className="font-heading text-[13px] font-bold text-t1 tracking-[-0.01em] truncate">{name}</p>
            </div>
            {scoreLabel && (
              <p className="font-label text-[11px] font-medium uppercase tracking-[0.08em] text-t4 mt-1">
                Desempenho · {scoreLabel}
              </p>
            )}
          </div>
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 flex-1 min-w-0">
          {METRICS.map(metric => (
            <MetricCell
              key={metric.key}
              label={metric.label}
              icon={metric.icon}
              text={metric.text}
              realized={metric.realized(numbers)}
              target={goals[`${metric.key}_${period}`]}
              sub={metric.sub?.(numbers) ?? null}
              pace={pace}
              onSetGoal={onSetGoal}
            />
          ))}
        </div>
      </div>
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

  const range = useMemo(() => {
    if (!data) return null
    return period === 'weekly' ? data.week : data.month
  }, [data, period])

  const pace = useMemo(() => range ? calcPace(range.start, range.end) : null, [range])

  const periodLabel = useMemo(() => {
    if (!data || !range) return ''
    if (period === 'weekly') {
      const fmt = (d: string) => d.split('-').slice(1).reverse().join('/')
      return `${fmt(range.start)} – ${fmt(range.end)}`
    }
    const [y, m] = range.start.split('-')
    const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
    return `${months[Number(m) - 1]} ${y}`
  }, [data, range, period])

  // Totais da equipe — soma realizados; meta só soma onde está definida
  const team = useMemo(() => {
    if (visibleBrokers.length < 2) return null
    const numbers: PerfNumbers = visibleBrokers.reduce((acc, b) => {
      const n = period === 'weekly' ? b.week : b.month
      return {
        acionamentos: acc.acionamentos + n.acionamentos,
        visitas: acc.visitas + n.visitas,
        visitasAgendadas: acc.visitasAgendadas + n.visitasAgendadas,
        propostas: acc.propostas + n.propostas,
        vendas: acc.vendas + n.vendas,
        vgv: acc.vgv + n.vgv,
      }
    }, { acionamentos: 0, visitas: 0, visitasAgendadas: 0, propostas: 0, vendas: 0, vgv: 0 })

    const goals: Record<string, number> = {}
    for (const metric of METRICS) {
      const key = `${metric.key}_${period}`
      const targets = visibleBrokers.map(b => b.goals[key]).filter((t): t is number => typeof t === 'number' && t > 0)
      if (targets.length > 0) goals[key] = targets.reduce((a, t) => a + t, 0)
    }
    return { numbers, goals }
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
            <p className="text-[11px] font-bold tracking-widest text-t4 uppercase">Meta x Realizado</p>
            <h2 className="text-sm font-bold text-t1 leading-none mt-0.5">
              {periodLabel || 'Desempenho'}
              {pace && (
                <span className="text-[11px] font-medium text-t4 ml-2">
                  dia {pace.elapsed} de {pace.total}
                </span>
              )}
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 p-0.5 rounded-xl border border-line bg-s2/40">
            {([['weekly', 'Semana'], ['monthly', 'Mês']] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setPeriod(value)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
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
      {data && pace && !error && (
        <div className="flex flex-col divide-y divide-line">
          {visibleBrokers.map(broker => (
            <BrokerRow
              key={broker.id}
              name={broker.name}
              avatarUrl={broker.avatarUrl}
              numbers={period === 'weekly' ? broker.week : broker.month}
              goals={broker.goals}
              period={period}
              pace={pace}
              onSetGoal={() => navigate('/metas')}
            />
          ))}

          {/* Linha consolidada da equipe */}
          {team && (
            <BrokerRow
              name="Equipe"
              numbers={team.numbers}
              goals={team.goals}
              period={period}
              pace={pace}
              highlight
              onSetGoal={() => navigate('/metas')}
            />
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
