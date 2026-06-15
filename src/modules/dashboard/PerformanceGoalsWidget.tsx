import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Target, Zap, Activity, Footprints, FileText, BadgeDollarSign,
  RefreshCw, AlertTriangle, ArrowRight, Crown,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/useAuthStore'
import { Avatar } from '../../components/ui/Avatar'
import { formatCurrency } from '../../lib/formatters'
import { DAILY_TARGETS, WEEKLY_TARGETS, MONTHLY_TARGETS } from '../../lib/metasConfig'

// ─── Período de visão ─────────────────────────────────────────────────────────

type ViewPeriod = 'daily' | 'weekly' | 'monthly'

// ─── Tipos do payload da RPC dashboard_performance ───────────────────────────

interface PerfNumbers {
  acionamentos: number
  interacoes: number
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
  day:   PerfNumbers
  week:  PerfNumbers
  month: PerfNumbers
  goals: Record<string, number>   // ex: { acionamento_weekly: 250, venda_monthly: 1 }
}

interface PerfData {
  day:   { start: string; end: string }
  week:  { start: string; end: string }
  month: { start: string; end: string }
  brokers: PerfBroker[]
}

// ─── Categorias exibidas ──────────────────────────────────────────────────────

const METRICS: Array<{
  key: 'acionamento' | 'interacao' | 'visita' | 'proposta' | 'venda'
  label: string
  icon: typeof Target
  text: string
  chip: string
  realized: (n: PerfNumbers) => number
  sub?: (n: PerfNumbers) => string | null
}> = [
  { key: 'acionamento', label: 'Disparos',     icon: Zap,        text: 'text-cyan-400',   chip: 'bg-cyan-500/12',
    realized: n => n.acionamentos },
  { key: 'interacao',   label: 'Interações',   icon: Activity,   text: 'text-sky-400',    chip: 'bg-sky-500/12',
    realized: n => n.interacoes },
  { key: 'visita',      label: 'Atendimentos', icon: Footprints, text: 'text-indigo-400', chip: 'bg-indigo-500/12',
    realized: n => n.visitas,
    sub: n => n.visitasAgendadas > n.visitas ? `${n.visitasAgendadas} agendados` : null },
  { key: 'proposta',    label: 'Propostas',    icon: FileText,   text: 'text-amber-400',  chip: 'bg-amber-500/12',
    realized: n => n.propostas },
  { key: 'venda',       label: 'Vendas',       icon: BadgeDollarSign, text: 'text-green-400', chip: 'bg-green-500/12',
    realized: n => n.vendas,
    sub: n => n.vgv > 0 ? formatCurrency(n.vgv) : null },
]

// ─── Resolução de meta (banco customizado → metasConfig) ──────────────────────

const CFG_TARGETS: Record<ViewPeriod, Record<string, number>> = {
  daily:   { acionamento: DAILY_TARGETS.disparos,   interacao: DAILY_TARGETS.interacoes },
  weekly:  { acionamento: WEEKLY_TARGETS.disparos,  interacao: WEEKLY_TARGETS.interacoes,  visita: WEEKLY_TARGETS.atendimentos,  proposta: WEEKLY_TARGETS.propostas },
  monthly: { acionamento: MONTHLY_TARGETS.disparos, interacao: MONTHLY_TARGETS.interacoes, visita: MONTHLY_TARGETS.atendimentos, proposta: MONTHLY_TARGETS.propostas, venda: MONTHLY_TARGETS.vendas },
}

function targetFor(key: string, period: ViewPeriod, goals: Record<string, number>): number | undefined {
  // Meta customizada no banco (apenas weekly/monthly) tem prioridade
  const dbVal = goals[`${key}_${period}`]
  if (typeof dbVal === 'number' && dbVal > 0) return dbVal
  return CFG_TARGETS[period]?.[key]
}

function pickNumbers(b: PerfBroker, period: ViewPeriod): PerfNumbers {
  return period === 'daily' ? b.day : period === 'weekly' ? b.week : b.month
}

// ─── Ritmo do período ─────────────────────────────────────────────────────────

interface Pace { elapsed: number; total: number; remaining: number; fraction: number; isDaily: boolean }

function calcPace(start: string, end: string): Pace {
  const DAY = 86_400_000
  const s = new Date(start + 'T00:00:00').getTime()
  const e = new Date(end   + 'T00:00:00').getTime()
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const total   = Math.round((e - s) / DAY) + 1
  const elapsed = Math.min(Math.max(Math.round((today.getTime() - s) / DAY) + 1, 0), total)
  return { elapsed, total, remaining: Math.max(total - elapsed + 1, 1), fraction: elapsed / total, isDaily: false }
}

// Ritmo do dia: fração da jornada de trabalho (9h–18h) já decorrida
function calcDayPace(): Pace {
  const now = new Date()
  const h = now.getHours() + now.getMinutes() / 60
  const START = 9, END = 18
  const fraction = Math.min(Math.max((h - START) / (END - START), 0), 1)
  return { elapsed: 0, total: 0, remaining: 1, fraction, isDaily: true }
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
  done:    { chip: 'text-brand bg-brand-tint border-brand/30',           label: 'Meta batida', bar: 'bg-brand',     pct: 'text-brand'     },
  onTrack: { chip: 'text-green-400 bg-green-500/10 border-green-500/25', label: 'No ritmo',    bar: 'bg-green-500', pct: 'text-green-400' },
  warning: { chip: 'text-amber-400 bg-amber-500/10 border-amber-500/25', label: 'Atenção',     bar: 'bg-amber-500', pct: 'text-amber-400' },
  behind:  { chip: 'text-red-400 bg-red-500/10 border-red-500/25',       label: 'Atrasado',    bar: 'bg-red-500',   pct: 'text-red-400'   },
}

// ─── Score do corretor (média de atingimento das metas do período) ────────────

function computeScore(numbers: PerfNumbers, resolveTarget: (key: string) => number | undefined): number | null {
  const pcts = METRICS
    .map(m => ({ realized: m.realized(numbers), target: resolveTarget(m.key) }))
    .filter((x): x is { realized: number; target: number } => typeof x.target === 'number' && x.target > 0)
    .map(x => Math.min((x.realized / x.target) * 100, 100))
  if (pcts.length === 0) return null
  return pcts.reduce((a, p) => a + p, 0) / pcts.length
}

// ─── Anel de score ────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const sz = 66, stroke = 6, r = (sz - stroke) / 2 - 1
  const circ = 2 * Math.PI * r
  const dash = (Math.min(score, 100) / 100) * circ
  const color = score >= 100 ? 'var(--brand)' : score >= 75 ? '#22c55e' : score >= 45 ? '#f59e0b' : '#ef4444'
  return (
    <svg
      width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`} className="flex-shrink-0"
      role="img" aria-label={`Desempenho ${Math.round(score)} de 100`}
    >
      <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
      <circle
        cx={sz/2} cy={sz/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeLinecap="round" strokeDasharray={`${dash} ${circ}`}
        transform={`rotate(-90 ${sz/2} ${sz/2})`}
        style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.16,1,0.3,1)' }}
      />
      <text x={sz/2} y={sz/2 + 5} textAnchor="middle" fill="currentColor" className="text-t1"
        fontSize={18} fontWeight={800} fontFamily="inherit">
        {Math.round(score)}
      </text>
    </svg>
  )
}

// ─── Célula de métrica (meta × realizado + ritmo) ─────────────────────────────

function MetricCell({
  label, icon: Icon, text, chip, realized, target, sub, pace, onSetGoal,
}: {
  label: string; icon: typeof Target; text: string; chip: string
  realized: number; target: number | undefined; sub: string | null
  pace: Pace; onSetGoal: () => void
}) {
  const hasGoal = target !== undefined && target > 0
  const status  = hasGoal ? paceStatus(realized, target!, pace.fraction) : null
  const cfg     = status ? STATUS_CFG[status] : null
  const pct     = hasGoal ? Math.round((realized / target!) * 100) : 0
  const expectedPct = hasGoal ? Math.min(Math.round(pace.fraction * 100), 100) : 0

  const missing  = hasGoal ? Math.max(target! - realized, 0) : 0
  const perDay   = hasGoal && missing > 0 ? Math.ceil(missing / pace.remaining) : 0
  const hint     = hasGoal && status !== 'done'
    ? (pace.isDaily ? `faltam ${missing.toLocaleString('pt-BR')}` : `faltam ${missing.toLocaleString('pt-BR')} · ~${perDay.toLocaleString('pt-BR')}/dia`)
    : null

  return (
    <div className="bg-s2/50 border border-line rounded-xl p-3 flex flex-col gap-2 min-w-0 transition-colors hover:border-line-strong">
      {/* Cabeçalho — ícone + categoria + status */}
      <div className="flex items-center gap-2">
        <span className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${chip}`}>
          <Icon size={11} className={text} />
        </span>
        <p className="font-label text-[11px] font-bold uppercase tracking-[0.08em] text-t4 truncate">{label}</p>
        {cfg && (
          <span className={`ml-auto flex-shrink-0 text-[11px] font-bold px-1.5 py-px rounded-full border ${cfg.chip}`}>
            {cfg.label}
          </span>
        )}
      </div>

      {/* Realizado / meta + percentual */}
      <div className="flex items-baseline gap-1.5">
        <p className="text-2xl font-black text-t1 tabular-nums leading-none">{realized.toLocaleString('pt-BR')}</p>
        {hasGoal
          ? <p className="text-xs text-t4 tabular-nums">/ {target!.toLocaleString('pt-BR')}</p>
          : pace.isDaily
            ? <p className="text-[11px] text-t4">hoje</p>
            : (
              <button
                onClick={onSetGoal}
                className="text-[11px] text-t4 hover:text-brand transition-colors cursor-pointer ml-1"
              >
                definir meta →
              </button>
            )
        }
        {cfg && <p className={`text-sm font-black tabular-nums ml-auto ${cfg.pct}`}>{pct}%</p>}
      </div>

      {/* Barra de progresso com marcador de ritmo */}
      {hasGoal && cfg && (
        <div
          className="relative h-2 bg-s3/70 rounded-full overflow-hidden"
          role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
          aria-label={`${label}: ${realized} de ${target} (${pct}%)`}
        >
          <div
            className={`h-full rounded-full transition-all duration-700 ${cfg.bar}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
          {expectedPct > 0 && expectedPct < 100 && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-t1/60 rounded-full"
              style={{ left: `${expectedPct}%` }}
              title={`Ritmo esperado: ${expectedPct}%`}
            />
          )}
        </div>
      )}

      {/* Dica / subtítulo */}
      {(hint || sub) && (
        <p className="text-[11px] text-t4 truncate tabular-nums">
          {hint}{hint && sub ? ' · ' : ''}{sub}
        </p>
      )}
    </div>
  )
}

// ─── Linha de um corretor ─────────────────────────────────────────────────────

const SCORE_WORD: Array<{ min: number; label: string; tone: string }> = [
  { min: 100, label: 'Tudo batido', tone: 'text-brand'     },
  { min: 75,  label: 'Forte',       tone: 'text-green-400' },
  { min: 45,  label: 'No jogo',     tone: 'text-amber-400' },
  { min: 0,   label: 'Reagir',      tone: 'text-red-400'   },
]

function BrokerRow({
  name, avatarUrl, numbers, resolveTarget, pace, highlight, isTop, onSetGoal,
}: {
  name: string; avatarUrl?: string | null
  numbers: PerfNumbers; resolveTarget: (key: string) => number | undefined
  pace: Pace; highlight?: boolean; isTop?: boolean
  onSetGoal: () => void
}) {
  const score = useMemo(() => computeScore(numbers, resolveTarget), [numbers, resolveTarget])
  const word  = score === null ? null : SCORE_WORD.find(w => score >= w.min)!

  return (
    <div className={`px-5 py-4 transition-colors ${highlight ? 'bg-brand-tint/40' : 'hover:bg-s2/30'}`}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        {/* Identidade + score */}
        <div className="flex items-center gap-3 sm:w-48 flex-shrink-0">
          <div className="relative flex-shrink-0">
            {score !== null
              ? <ScoreRing score={score} />
              : <div className="w-[66px] h-[66px] rounded-full bg-s2/60 border border-line flex items-center justify-center">
                  <Target size={20} className="text-t4" />
                </div>
            }
            {isTop && (
              <span
                className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-brand flex items-center justify-center shadow-brand"
                title="Melhor desempenho"
              >
                <Crown size={11} className="text-[var(--brand-btn-text)]" />
              </span>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Avatar name={name} photoUrl={avatarUrl ?? undefined} size="xs" />
              <p className="font-heading text-sm font-bold text-t1 tracking-[-0.01em] truncate">{name}</p>
            </div>
            {word && (
              <p className="font-label text-[11px] font-bold uppercase tracking-[0.08em] mt-1.5">
                <span className="text-t4">Desempenho</span> <span className={word.tone}>· {word.label}</span>
              </p>
            )}
          </div>
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 flex-1 min-w-0">
          {METRICS.map(metric => (
            <MetricCell
              key={metric.key}
              label={metric.label}
              icon={metric.icon}
              text={metric.text}
              chip={metric.chip}
              realized={metric.realized(numbers)}
              target={resolveTarget(metric.key)}
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
  const [period,  setPeriod]  = useState<ViewPeriod>('daily')

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
      const hasActivity = [b.day, b.week, b.month].some(n =>
        n.acionamentos > 0 || n.interacoes > 0 || n.visitas > 0 || n.visitasAgendadas > 0 || n.propostas > 0 || n.vendas > 0
      )
      return hasGoals || hasActivity
    })
  }, [data, viewAsBrokerId, isAdmin, profile?.id])

  const range = useMemo(() => {
    if (!data) return null
    return period === 'daily' ? data.day : period === 'weekly' ? data.week : data.month
  }, [data, period])

  const pace = useMemo(() => {
    if (!range) return null
    return period === 'daily' ? calcDayPace() : calcPace(range.start, range.end)
  }, [range, period])

  // Resolver de meta por corretor + consolidado da equipe
  const resolveForGoals = (goals: Record<string, number>) => (key: string) => targetFor(key, period, goals)
  const teamResolve = (key: string) => {
    const ts = visibleBrokers.map(b => targetFor(key, period, b.goals)).filter((t): t is number => typeof t === 'number' && t > 0)
    return ts.length ? ts.reduce((a, t) => a + t, 0) : undefined
  }

  // Ordena por score (maior primeiro) — leaderboard
  const rankedBrokers = useMemo(() => {
    return [...visibleBrokers]
      .map(b => ({ broker: b, score: computeScore(pickNumbers(b, period), resolveForGoals(b.goals)) }))
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleBrokers, period])

  const topId = useMemo(() => {
    if (rankedBrokers.length < 2) return null
    const top = rankedBrokers[0]
    return top.score !== null && top.score > 0 ? top.broker.id : null
  }, [rankedBrokers])

  const periodLabel = useMemo(() => {
    if (!data || !range) return ''
    if (period === 'daily') {
      const [, mo, da] = range.start.split('-')
      return `Hoje · ${da}/${mo}`
    }
    if (period === 'weekly') {
      const fmt = (d: string) => d.split('-').slice(1).reverse().join('/')
      return `${fmt(range.start)} – ${fmt(range.end)}`
    }
    const [y, m] = range.start.split('-')
    const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
    return `${months[Number(m) - 1]} ${y}`
  }, [data, range, period])

  // Totais da equipe — soma realizados
  const teamNumbers = useMemo(() => {
    if (visibleBrokers.length < 2) return null
    return visibleBrokers.reduce<PerfNumbers>((acc, b) => {
      const n = pickNumbers(b, period)
      return {
        acionamentos: acc.acionamentos + n.acionamentos,
        interacoes: acc.interacoes + n.interacoes,
        visitas: acc.visitas + n.visitas,
        visitasAgendadas: acc.visitasAgendadas + n.visitasAgendadas,
        propostas: acc.propostas + n.propostas,
        vendas: acc.vendas + n.vendas,
        vgv: acc.vgv + n.vgv,
      }
    }, { acionamentos: 0, interacoes: 0, visitas: 0, visitasAgendadas: 0, propostas: 0, vendas: 0, vgv: 0 })
  }, [visibleBrokers, period])

  return (
    <div className="rounded-xl border border-line bg-surface overflow-hidden mb-6 animate-slide-up" style={{ boxShadow: 'var(--shadow-card)' }}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-line">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 bg-brand-tint rounded-lg flex items-center justify-center flex-shrink-0">
            <Target size={15} className="text-brand" />
          </div>
          <div className="min-w-0">
            <p className="font-label text-[11px] font-bold tracking-[0.12em] text-t4 uppercase">Meta × Realizado</p>
            <h3 className="text-sm font-bold text-t1 leading-none mt-0.5 flex items-center gap-2 flex-wrap">
              {periodLabel || 'Desempenho'}
              {pace && (
                <span className="text-[11px] font-bold text-t3 bg-s2/60 border border-line px-1.5 py-0.5 rounded-md tabular-nums">
                  {pace.isDaily ? `${Math.round(pace.fraction * 100)}% do dia` : `dia ${pace.elapsed}/${pace.total}`}
                </span>
              )}
            </h3>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex gap-0.5 p-0.5 rounded-xl border border-line bg-s2/40">
            {([['daily', 'Hoje'], ['weekly', 'Semana'], ['monthly', 'Mês']] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setPeriod(value)}
                aria-pressed={period === value}
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
            aria-label="Atualizar desempenho"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Barra de tempo decorrido no período */}
      {pace && !error && (
        <div
          className="h-1 bg-s3/50"
          role="progressbar" aria-valuenow={Math.round(pace.fraction * 100)} aria-valuemin={0} aria-valuemax={100}
          aria-label="Tempo decorrido no período"
        >
          <div className="h-full bg-brand/45 transition-all duration-700" style={{ width: `${pace.fraction * 100}%` }} />
        </div>
      )}

      {/* Erro de banco — exibido, nunca mascarado */}
      {error && (
        <div className="flex items-center gap-3 px-5 py-4 bg-error-bg">
          <AlertTriangle size={16} className="text-error flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-error">Não foi possível carregar o desempenho</p>
            <p className="text-xs text-error/70 truncate" role="alert">{error}</p>
          </div>
          <button
            onClick={fetchData}
            className="text-xs text-error border border-error-line hover:bg-error-bg px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex-shrink-0"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Loading inicial */}
      {loading && !data && !error && (
        <div className="flex items-center justify-center py-12">
          <div className="w-7 h-7 rounded-full border-2 border-brand/30 border-t-brand animate-spin" />
        </div>
      )}

      {/* Corretores */}
      {data && pace && !error && (
        <div className="flex flex-col divide-y divide-line">
          {rankedBrokers.map(({ broker }) => (
            <BrokerRow
              key={broker.id}
              name={broker.name}
              avatarUrl={broker.avatarUrl}
              numbers={pickNumbers(broker, period)}
              resolveTarget={resolveForGoals(broker.goals)}
              pace={pace}
              isTop={broker.id === topId}
              onSetGoal={() => navigate('/metas')}
            />
          ))}

          {/* Linha consolidada da equipe */}
          {teamNumbers && (
            <BrokerRow
              name="Equipe"
              numbers={teamNumbers}
              resolveTarget={teamResolve}
              pace={pace}
              highlight
              onSetGoal={() => navigate('/metas')}
            />
          )}

          {rankedBrokers.length === 0 && (
            <div className="flex flex-col items-center py-10 gap-2">
              <Target size={28} className="text-t4" />
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
