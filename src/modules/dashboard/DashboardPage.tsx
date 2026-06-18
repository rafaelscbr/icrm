import { useEffect, useMemo, useState, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, Building2, TrendingUp, DollarSign, Cake,
  ArrowRight, Gift, MessageCircle, Sparkles, Circle, CheckCircle2,
  AlertTriangle, Clock, CalendarCheck, Siren, ClipboardCheck,
  ListTodo, Snowflake, RefreshCw, Megaphone,
  ChevronDown, ChevronUp, BarChart2, Target, Flame,
  Home, Settings, ClipboardList, Monitor,
} from 'lucide-react'
import { Task, Contact, Property, Lead, FunnelStage, calcSaleCommissions } from '../../types'
import { STAGE_THEME, FUNNEL_STAGES } from '../../lib/stageTheme'
import { PerformanceGoalsWidget } from './PerformanceGoalsWidget'
import { TaskForm } from '../tasks/TaskForm'
import { LeadModal } from '../leads/LeadModal'
import { PageLayout } from '../../components/layout/PageLayout'
import { Card } from '../../components/ui/Card'
import { StatCard } from '../../components/shared/StatCard'
import { Avatar } from '../../components/ui/Avatar'
import { PeriodSelector } from '../../components/shared/PeriodSelector'
import { useContactsStore } from '../../store/useContactsStore'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { useSalesStore } from '../../store/useSalesStore'
import { useTasksStore } from '../../store/useTasksStore'
import { usePeriodStore, matchesPeriod } from '../../store/usePeriodStore'
import { useLeadsStore } from '../../store/useLeadsStore'
import { useLeadInteractionsStore } from '../../store/useLeadInteractionsStore'
import { useCampaignsStore } from '../../store/useCampaignsStore'
import { useCampaignLeadsStore } from '../../store/useCampaignLeadsStore'
import { useAuthStore } from '../../store/useAuthStore'
import { useAdminView } from '../../hooks/useAdminView'
import { usePresenceStore, pageLabel } from '../../store/usePresenceStore'
import { formatCurrency, formatCurrencyFull, formatDate, getBirthdayDay, whatsappUrl } from '../../lib/formatters'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

// ─── Tipos da RPC dashboard_overview ─────────────────────────────────────────

interface OverviewData {
  vgl: {
    target: number; realizadoMes: number; vendasMes: number
    expectativa: number; expectativaVisita: number; expectativaProposta: number
    leadsVisita: number; leadsProposta: number
  }
  leadFunnel: Array<{ stage: string; count: number }>
  leadsAtivos: number
  leadsSemInteracao: number
  campaignFunnel: {
    totalCampaigns: number
    totalLeads: number
    totalSales: number
    stages: Array<{ stage: string; count: number }>
  }
  alertas: { tarefasEmAtraso: number; leadsCongelados: number; slaEstourado: number }
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const REAL_TYPES = new Set(['ligacao', 'whatsapp', 'email', 'visita', 'reuniao', 'nota', 'tarefa'])
const COOLING_DAYS = 2

const STAGE_LABELS = STAGE_THEME

const CAMPAIGN_STAGES: Array<{
  stage: FunnelStage
  label: string
  shortLabel: string
  bg: string
  text: string
  border: string
}> = [
  { stage: 'new',          label: 'Para Ativar',          shortLabel: 'Ativar',      bg: 'bg-amber-500/12',   text: 'text-amber-400',   border: 'border-amber-500/25' },
  { stage: 'sent',         label: 'Em Abordagem',         shortLabel: 'Abordagem',   bg: 'bg-blue-500/12',    text: 'text-blue-400',    border: 'border-blue-500/25'  },
  { stage: 'attended',     label: 'Demonstrou Interesse', shortLabel: 'Interesse',   bg: 'bg-cyan-500/12',    text: 'text-cyan-400',    border: 'border-cyan-500/25'  },
  { stage: 'scheduled',    label: 'Visita Agendada',      shortLabel: 'Visita',      bg: 'bg-violet-500/12',  text: 'text-violet-400',  border: 'border-violet-500/25'},
  { stage: 'presentation', label: 'Apresentação',         shortLabel: 'Apresentação', bg: 'bg-purple-500/12', text: 'text-purple-400',  border: 'border-purple-500/25'},
  { stage: 'proposal',     label: 'Em Proposta',          shortLabel: 'Proposta',    bg: 'bg-orange-500/12',  text: 'text-orange-400',  border: 'border-orange-500/25'},
]

// ─── Primitivas de UI compartilhadas ──────────────────────────────────────────

/** Rótulo de faixa — separa visualmente os blocos da página (escaneabilidade). */
function SectionLabel({ icon: Icon, children, hint }: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  children: ReactNode
  hint?: string
}) {
  return (
    <div className="flex items-center gap-2 mb-3 mt-1 px-1">
      <span className="w-1 h-4 rounded-full bg-brand" aria-hidden />
      <Icon size={13} className="text-t3" aria-hidden />
      <h2 className="font-label text-[11px] font-bold uppercase tracking-[0.14em] text-t3">{children}</h2>
      {hint && <span className="text-[11px] text-t4 ml-auto">{hint}</span>}
    </div>
  )
}

/** Cabeçalho padrão de card — chip de ícone + eyebrow + título. */
function CardHeader({ icon: Icon, tone, eyebrow, title, right }: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  tone: { chip: string; icon: string }
  eyebrow: string
  title: ReactNode
  right?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-line">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${tone.chip}`}>
          <Icon size={15} className={tone.icon} />
        </div>
        <div className="min-w-0">
          <p className="font-label text-[11px] font-bold tracking-[0.12em] text-t4 uppercase truncate">{eyebrow}</p>
          <h3 className="text-sm font-bold text-t1 leading-none mt-0.5 truncate">{title}</h3>
        </div>
      </div>
      {right}
    </div>
  )
}

function ShimmerBlock({ className = '' }: { className?: string }) {
  return <div className={`shimmer rounded-lg ${className}`} aria-hidden />
}

// ─── Gauge radial (semicírculo) ───────────────────────────────────────────────

const PACE_TONE = {
  done:    { text: 'text-brand',     chip: 'text-brand bg-brand-tint border-brand/30',           label: 'Meta batida' },
  onTrack: { text: 'text-green-400', chip: 'text-green-400 bg-green-500/10 border-green-500/25',  label: 'No ritmo'    },
  warning: { text: 'text-amber-400', chip: 'text-amber-400 bg-amber-500/10 border-amber-500/25',  label: 'Atenção'     },
  behind:  { text: 'text-red-400',   chip: 'text-red-400 bg-red-500/10 border-red-500/25',        label: 'Atrasado'    },
} as const
type PaceKey = keyof typeof PACE_TONE

const GAUGE_STOPS = {
  brand:    [['0%', 'var(--brand-dark)'], ['60%', 'var(--brand)'], ['100%', 'var(--brand-text)']],
  pipeline: [['0%', '#0e7490'], ['60%', '#06b6d4'], ['100%', '#67e8f9']],
} as const

function RadialGauge({ pct, expectedPct = -1, centerTop, centerMain, tone = 'brand' }: {
  pct: number
  expectedPct?: number
  centerTop: string
  centerMain: string
  tone?: keyof typeof GAUGE_STOPS
}) {
  const gid = `vglGauge-${tone}`
  const size = 188, stroke = 15
  const cx = size / 2, cy = size / 2
  const r  = (size - stroke) / 2 - 2
  const len = Math.PI * r
  const fill = Math.min(Math.max(pct, 0), 100)
  const dash = (fill / 100) * len

  // marcador do ritmo esperado (posição ao longo do arco superior)
  const a = Math.PI - (Math.min(Math.max(expectedPct, 0), 100) / 100) * Math.PI
  const inner = r - stroke / 2 - 2
  const outer = r + stroke / 2 + 2
  const mx1 = cx + inner * Math.cos(a), my1 = cy - inner * Math.sin(a)
  const mx2 = cx + outer * Math.cos(a), my2 = cy - outer * Math.sin(a)

  return (
    <svg
      viewBox={`0 0 ${size} ${cy + 16}`}
      className="w-full max-w-[260px] mx-auto"
      role="img"
      aria-label={`${Math.round(pct)} por cento da meta de VGL atingidos`}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
          {GAUGE_STOPS[tone].map(([off, col]) => <stop key={off} offset={off} stopColor={col} />)}
        </linearGradient>
      </defs>

      {/* trilho */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke="var(--surface-3)" strokeWidth={stroke} strokeLinecap="round"
      />
      {/* preenchimento */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke={`url(#${gid})`} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${dash} ${len}`}
        style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.16,1,0.3,1)' }}
      />
      {/* marcador "ritmo esperado" */}
      {expectedPct > 1 && expectedPct < 99 && (
        <line
          x1={mx1} y1={my1} x2={mx2} y2={my2}
          stroke="var(--t2)" strokeWidth={2} strokeLinecap="round" opacity={0.55}
        />
      )}

      {/* texto central */}
      <text x={cx} y={cy - 34} textAnchor="middle" className="fill-t4 font-label"
        fontSize={11} fontWeight={700} letterSpacing="1.5">{centerTop}</text>
      <text x={cx} y={cy - 4} textAnchor="middle" className="fill-t1"
        fontSize={34} fontWeight={800} fontFamily="inherit">{centerMain}</text>
    </svg>
  )
}

// ─── Shell compartilhado dos gauges de VGL ───────────────────────────────────

function GaugeHeroShell({
  accentBar, glow, icon: Icon, iconTone, eyebrow, title, loading, error, hasData, onRetry, children,
}: {
  accentBar: string; glow: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  iconTone: { chip: string; icon: string }
  eyebrow: string; title: string
  loading: boolean; error: string | null; hasData: boolean
  onRetry: () => void; children: ReactNode
}) {
  return (
    <div className="h-full rounded-xl border border-line bg-surface overflow-hidden flex flex-col relative" style={{ boxShadow: 'var(--shadow-card)' }}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 opacity-60" style={{ background: `radial-gradient(120% 80% at 50% -20%, ${glow}, transparent 70%)` }} aria-hidden />
      <div className={`absolute top-0 left-0 right-0 h-[3px] ${accentBar}`} aria-hidden />

      <CardHeader
        icon={Icon}
        tone={iconTone}
        eyebrow={eyebrow}
        title={title}
        right={
          <button onClick={onRetry} disabled={loading} className="p-2 rounded-lg text-t4 hover:text-t2 hover:bg-s2/60 transition-colors cursor-pointer disabled:opacity-50" aria-label="Atualizar dados de VGL">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        }
      />

      {error && !hasData && (
        <div className="flex items-center gap-2 px-5 py-4 bg-error-bg flex-1">
          <AlertTriangle size={15} className="text-error flex-shrink-0" />
          <p className="text-xs text-error flex-1 min-w-0 truncate" role="alert">{error}</p>
          <button onClick={onRetry} className="text-xs text-error border border-error-line hover:bg-error-bg px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex-shrink-0">Tentar</button>
        </div>
      )}

      {loading && !hasData && !error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 py-8 px-5">
          <ShimmerBlock className="w-44 h-24 rounded-full" />
          <ShimmerBlock className="w-40 h-5" />
          <ShimmerBlock className="w-28 h-4" />
        </div>
      )}

      {hasData && children}
    </div>
  )
}

// ─── VGL Realizado × Meta ─────────────────────────────────────────────────────

function VGLHero({ data, loading, error, onRetry, onNavigate }: {
  data: OverviewData | null; loading: boolean; error: string | null; onRetry: () => void; onNavigate: () => void
}) {
  const now = new Date()
  const monthLabel = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const monthTitle = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const expectedPct = Math.round((now.getDate() / daysInMonth) * 100)
  const pct = data && data.vgl.target > 0 ? Math.round(data.vgl.realizadoMes / data.vgl.target * 100) : 0
  const falta = data ? Math.max(data.vgl.target - data.vgl.realizadoMes, 0) : 0
  const pace: PaceKey = !data ? 'behind' : pct >= 100 ? 'done' : pct >= expectedPct ? 'onTrack' : pct >= expectedPct * 0.7 ? 'warning' : 'behind'
  const tone = PACE_TONE[pace]

  return (
    <GaugeHeroShell
      accentBar="bg-brand" glow="var(--brand-tint)"
      icon={DollarSign} iconTone={{ chip: 'bg-brand-tint', icon: 'text-brand' }}
      eyebrow="Realizado · VGL da imobiliária" title={monthTitle}
      loading={loading} error={error} hasData={!!data} onRetry={onRetry}
    >
      {data && (
        <div className="flex-1 flex flex-col px-5 pt-4 pb-5 gap-3 relative">
          <RadialGauge pct={pct} expectedPct={expectedPct} tone="brand" centerTop="DA META" centerMain={`${Math.min(pct, 999)}%`} />
          <div className="text-center -mt-2">
            <p className="text-2xl font-black text-t1 tabular-nums leading-none">{formatCurrency(data.vgl.realizadoMes)}</p>
            <p className="text-xs text-t3 mt-1">de <span className="text-t2 font-semibold">{formatCurrencyFull(data.vgl.target)}</span></p>
          </div>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${tone.chip}`}>{tone.label}</span>
            <span className="text-[11px] text-t4 tabular-nums">ritmo do mês: {expectedPct}%</span>
          </div>
          <div className="mt-auto grid grid-cols-2 gap-2 pt-2 border-t border-line">
            <button onClick={onNavigate} className="flex flex-col items-start gap-0.5 rounded-lg p-2 -m-0.5 hover:bg-s2/50 transition-colors cursor-pointer text-left">
              <span className="text-[11px] text-t4 uppercase tracking-wide">Faltam</span>
              <span className={`text-sm font-bold tabular-nums ${pct >= 100 ? 'text-brand' : 'text-t1'}`}>{pct >= 100 ? 'Meta batida' : formatCurrency(falta)}</span>
            </button>
            <button onClick={onNavigate} className="flex flex-col items-start gap-0.5 rounded-lg p-2 -m-0.5 hover:bg-s2/50 transition-colors cursor-pointer text-left">
              <span className="text-[11px] text-t4 uppercase tracking-wide">Vendas no mês</span>
              <span className="text-sm font-bold text-t1 tabular-nums">{data.vgl.vendasMes} venda{data.vgl.vendasMes !== 1 ? 's' : ''}</span>
            </button>
          </div>
        </div>
      )}
    </GaugeHeroShell>
  )
}

// ─── VGL Previsão (pipeline visita + proposta) × Meta ─────────────────────────

function VGLPrevisaoHero({ data, loading, error, onRetry, onNavigate }: {
  data: OverviewData | null; loading: boolean; error: string | null; onRetry: () => void; onNavigate: () => void
}) {
  const exp      = data?.vgl.expectativa ?? 0
  const target   = data?.vgl.target ?? 0
  const pct      = data && target > 0 ? Math.round(exp / target * 100) : 0
  const projecao = data ? data.vgl.realizadoMes + exp : 0
  const projPct  = data && target > 0 ? Math.round(projecao / target * 100) : 0

  return (
    <GaugeHeroShell
      accentBar="bg-cyan-500" glow="rgba(6,182,212,0.16)"
      icon={TrendingUp} iconTone={{ chip: 'bg-cyan-500/15', icon: 'text-cyan-400' }}
      eyebrow="Previsão · VGL em pipeline" title="Visita + Proposta"
      loading={loading} error={error} hasData={!!data} onRetry={onRetry}
    >
      {data && (
        <div className="flex-1 flex flex-col px-5 pt-4 pb-5 gap-3 relative">
          <RadialGauge pct={pct} tone="pipeline" centerTop="DA META" centerMain={`${Math.min(pct, 999)}%`} />
          <div className="text-center -mt-2">
            <p className="text-2xl font-black text-t1 tabular-nums leading-none">{formatCurrency(exp)}</p>
            <p className="text-xs text-t3 mt-1">em pipeline · meta <span className="text-t2 font-semibold">{formatCurrency(target)}</span></p>
          </div>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full border text-cyan-300 bg-cyan-500/10 border-cyan-500/25">
              Projeção {formatCurrency(projecao)}
            </span>
            <span className="text-[11px] text-t4 tabular-nums">{projPct}% da meta com o realizado</span>
          </div>
          <div className="mt-auto grid grid-cols-2 gap-2 pt-2 border-t border-line">
            <button onClick={onNavigate} className="flex flex-col items-start gap-0.5 rounded-lg p-2 -m-0.5 hover:bg-s2/50 transition-colors cursor-pointer text-left">
              <span className="text-[11px] text-t4 uppercase tracking-wide">Em visita</span>
              <span className="text-sm font-bold text-t1 tabular-nums">{formatCurrency(data.vgl.expectativaVisita)}</span>
              <span className="text-[11px] text-t4">{data.vgl.leadsVisita} lead{data.vgl.leadsVisita !== 1 ? 's' : ''}</span>
            </button>
            <button onClick={onNavigate} className="flex flex-col items-start gap-0.5 rounded-lg p-2 -m-0.5 hover:bg-s2/50 transition-colors cursor-pointer text-left">
              <span className="text-[11px] text-t4 uppercase tracking-wide">Em proposta</span>
              <span className="text-sm font-bold text-t1 tabular-nums">{formatCurrency(data.vgl.expectativaProposta)}</span>
              <span className="text-[11px] text-t4">{data.vgl.leadsProposta} lead{data.vgl.leadsProposta !== 1 ? 's' : ''}</span>
            </button>
          </div>
        </div>
      )}
    </GaugeHeroShell>
  )
}

// ─── KPI tile (clicável, acessível) ───────────────────────────────────────────

const KPI_TONES = {
  teal:   { bar: 'bg-teal-400',   chip: 'bg-teal-500/12',   icon: 'text-teal-400'   },
  green:  { bar: 'bg-success',    chip: 'bg-success-bg',    icon: 'text-success'    },
  amber:  { bar: 'bg-warning',    chip: 'bg-warning-bg',    icon: 'text-warning'    },
  purple: { bar: 'bg-purple-500', chip: 'bg-purple-500/12', icon: 'text-purple-400' },
} as const

function OverviewKPICard({
  title, value, sub, icon: Icon, tone, onClick, alert, loading,
}: {
  title: string
  value: string | number
  sub?: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  tone: keyof typeof KPI_TONES
  onClick?: () => void
  alert?: boolean
  loading?: boolean
}) {
  const t = KPI_TONES[tone]
  const isAlert = alert && Number(value) > 0

  if (loading) {
    return (
      <div className="rounded-xl border border-line bg-surface p-4 flex flex-col gap-3" style={{ boxShadow: 'var(--shadow-card)' }}>
        <ShimmerBlock className="w-24 h-3" />
        <ShimmerBlock className="w-14 h-7" />
        <ShimmerBlock className="w-20 h-3" />
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${title}: ${value}${sub ? `. ${sub}` : ''}`}
      className={`group relative text-left rounded-xl border bg-surface overflow-hidden p-4 flex flex-col gap-2
        transition-all duration-200 cursor-pointer
        hover:-translate-y-0.5 hover:border-line-strong hover:shadow-modal
        ${isAlert ? 'border-warning-line' : 'border-line'}`}
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      <div className={`absolute top-0 left-0 right-0 h-[3px] ${isAlert ? 'bg-warning' : t.bar}`} aria-hidden />
      <div className="flex items-center justify-between gap-2">
        <p className="font-label text-[11px] font-bold uppercase tracking-[0.1em] text-t4 truncate">{title}</p>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isAlert ? 'bg-warning-bg' : t.chip}`}>
          <Icon size={13} className={isAlert ? 'text-warning' : t.icon} />
        </div>
      </div>
      <p className={`text-[28px] font-black tabular-nums leading-none ${isAlert ? 'text-warning' : 'text-t1'}`}>
        {value}
      </p>
      <div className="flex items-center justify-between gap-1 min-h-[16px]">
        {sub && <p className="text-[11px] text-t4 truncate">{sub}</p>}
        <ArrowRight size={12} className="text-t5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all ml-auto flex-shrink-0" aria-hidden />
      </div>
    </button>
  )
}

// ─── Funil de leads (barras horizontais) ──────────────────────────────────────

// ─── Funil de vendas desenhado (SVG, forma fixa) ──────────────────────────────

const LEAD_FUNNEL_HEX: Record<string, string> = {
  lead: '#64748b', followup: '#2dd4bf', atendimento: '#8b5cf6',
  visita: '#f59e0b', proposta: '#fb923c', venda: '#22c55e',
}
const CAMP_FUNNEL_HEX: Record<string, string> = {
  new: '#f59e0b', sent: '#3b82f6', attended: '#06b6d4',
  scheduled: '#8b5cf6', presentation: '#a855f7', proposal: '#fb923c', sale: '#22c55e',
}

function hexToRgb(hex: string) {
  return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) }
}
function shade(hex: string, f: number) {
  const { r, g, b } = hexToRgb(hex)
  return `rgb(${Math.round(r * f)}, ${Math.round(g * f)}, ${Math.round(b * f)})`
}
// Texto legível sobre a faixa — claro/escuro pela luminância da cor
function readableText(hex: string) {
  const { r, g, b } = hexToRgb(hex)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#16203a' : '#ffffff'
}

/**
 * Funil de vendas com forma FIXA: o topo é sempre o mais largo e afunila etapa a
 * etapa até a base. Só os números e a % de conversão mudam — o desenho é constante.
 */
function FunnelChart({ idPrefix, stages }: {
  idPrefix: string
  stages: Array<{ label: string; count: number; color: string }>
}) {
  const n = stages.length
  const VW = 460, cx = VW / 2
  const topHalf = 210, botHalf = 80          // 420 no topo → 160 na base (forma fixa)
  const bandH = 54, gap = 5
  const H = n * bandH + (n - 1) * gap
  const halfAt = (k: number) => topHalf - (topHalf - botHalf) * (k / n)
  const ariaLabel = 'Funil: ' + stages.map(s => `${s.label} ${s.count}`).join(', ')

  return (
    <svg viewBox={`0 0 ${VW} ${H}`} className="w-full" role="img" aria-label={ariaLabel}>
      <defs>
        {stages.map((s, i) => (
          <linearGradient key={i} id={`fn-${idPrefix}-${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={s.color} />
            <stop offset="100%" stopColor={shade(s.color, 0.72)} />
          </linearGradient>
        ))}
      </defs>
      {stages.map((s, i) => {
        const yTop = i * (bandH + gap)
        const wT   = halfAt(i)
        const wB   = halfAt(i + 1)
        const txt  = readableText(s.color)
        const conv = i > 0 && stages[i - 1].count > 0 ? Math.round(s.count / stages[i - 1].count * 100) : null
        return (
          <g key={i}>
            <polygon
              points={`${cx - wT},${yTop} ${cx + wT},${yTop} ${cx + wB},${yTop + bandH} ${cx - wB},${yTop + bandH}`}
              fill={`url(#fn-${idPrefix}-${i})`}
            />
            <text x={cx} y={yTop + bandH / 2 - 3} textAnchor="middle" fill={txt} fillOpacity={0.85}
              fontSize={10.5} fontWeight={700} letterSpacing="0.6" fontFamily="inherit">{s.label.toUpperCase()}</text>
            <text x={cx} y={yTop + bandH / 2 + 15} textAnchor="middle" fill={txt}
              fontSize={18} fontWeight={800} fontFamily="inherit">{s.count.toLocaleString('pt-BR')}</text>
            {conv !== null && (
              <text x={VW - 6} y={yTop + bandH / 2 + 4} textAnchor="end" className="fill-t4"
                fontSize={11} fontWeight={700} fontFamily="inherit">↓ {conv}%</text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ─── Funil de leads (funil principal) ─────────────────────────────────────────

function LeadFunnelWidget({ data, loading, error, onNavigate }: {
  data: OverviewData | null
  loading: boolean
  error: string | null
  onNavigate: () => void
}) {
  const total = data?.leadFunnel.reduce((a, s) => a + s.count, 0) ?? 0

  return (
    <div className="rounded-xl border border-line bg-surface overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
      <CardHeader
        icon={BarChart2}
        tone={{ chip: 'bg-teal-500/15', icon: 'text-teal-400' }}
        eyebrow="Funil de Leads"
        title={loading && !data ? 'Carregando…' : `${total.toLocaleString('pt-BR')} leads ativos`}
        right={
          <button onClick={onNavigate} className="text-xs text-brand hover:text-brand-text flex items-center gap-1 transition-colors cursor-pointer flex-shrink-0">
            Ver funil <ArrowRight size={12} />
          </button>
        }
      />

      {error && !data && <p className="px-5 py-4 text-xs text-error" role="alert">{error}</p>}

      {loading && !data && !error && (
        <div className="flex flex-col gap-3 px-5 py-4">
          {Array.from({ length: 6 }).map((_, i) => <ShimmerBlock key={i} className="w-full h-5" />)}
        </div>
      )}

      {data && (
        <div className="px-5 pt-3 pb-4">
          <FunnelChart
            idPrefix="lead"
            stages={FUNNEL_STAGES.map(stage => ({
              label: STAGE_THEME[stage].label,
              count: data.leadFunnel.find(s => s.stage === stage)?.count ?? 0,
              color: LEAD_FUNNEL_HEX[stage],
            }))}
          />
        </div>
      )}
    </div>
  )
}

// ─── Funil de campanhas (resumo, 6 células) ───────────────────────────────────

function CompactCampaignFunnel({ data, loading, onNavigate }: {
  data: OverviewData | null
  loading: boolean
  onNavigate: () => void
}) {
  if (!loading && data && data.campaignFunnel.totalCampaigns === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface flex flex-col items-center justify-center py-10 gap-2" style={{ boxShadow: 'var(--shadow-card)' }}>
        <Megaphone size={24} className="text-t4" />
        <p className="text-sm text-t3">Nenhuma campanha ativa</p>
        <button onClick={onNavigate} className="text-xs text-brand hover:text-brand-text transition-colors cursor-pointer mt-0.5">
          Ver campanhas →
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-line bg-surface overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
      <CardHeader
        icon={Megaphone}
        tone={{ chip: 'bg-purple-500/15', icon: 'text-purple-400' }}
        eyebrow="Pipeline de Campanhas"
        title={!data
          ? 'Carregando…'
          : `${data.campaignFunnel.totalCampaigns} ativa${data.campaignFunnel.totalCampaigns !== 1 ? 's' : ''} · ${data.campaignFunnel.totalLeads.toLocaleString('pt-BR')} leads`}
        right={data && data.campaignFunnel.totalSales > 0 ? (
          <div className="flex items-center gap-1.5 bg-success-bg border border-success-line px-3 py-1.5 rounded-xl flex-shrink-0">
            <span className="text-success text-xs font-bold tabular-nums">{data.campaignFunnel.totalSales}</span>
            <span className="text-success/70 text-[11px]">venda{data.campaignFunnel.totalSales !== 1 ? 's' : ''}</span>
          </div>
        ) : (
          <button onClick={onNavigate} className="text-xs text-brand hover:text-brand-text flex items-center gap-1 transition-colors cursor-pointer flex-shrink-0">
            Abrir <ArrowRight size={12} />
          </button>
        )}
      />

      {loading && !data && (
        <div className="grid grid-cols-3 gap-2 px-5 py-4">
          {Array.from({ length: 6 }).map((_, i) => <ShimmerBlock key={i} className="h-20" />)}
        </div>
      )}

      {data && (
        <div className="px-5 pt-3 pb-4">
          <FunnelChart
            idPrefix="camp"
            stages={CAMPAIGN_STAGES.map(({ stage, shortLabel }) => ({
              label: shortLabel,
              count: data.campaignFunnel.stages.find(s => s.stage === stage)?.count ?? 0,
              color: CAMP_FUNNEL_HEX[stage],
            }))}
          />
        </div>
      )}
    </div>
  )
}

// ─── Painel de ação imediata ──────────────────────────────────────────────────

function AlertsPanel({ alertas, loading, error, onNavigateTasks, onNavigateLeads, onNavigateCampaigns }: {
  alertas: OverviewData['alertas'] | undefined
  loading: boolean
  error: string | null
  onNavigateTasks: () => void
  onNavigateLeads: () => void
  onNavigateCampaigns: () => void
}) {
  const total = alertas
    ? alertas.tarefasEmAtraso + alertas.leadsCongelados + alertas.slaEstourado
    : 0

  const rows = alertas ? [
    { key: 'atraso',   label: 'Tarefas em atraso',  hint: 'Atenção imediata necessária', count: alertas.tarefasEmAtraso, icon: Siren,     tone: 'text-red-400',    chip: 'bg-red-500/15',    onClick: onNavigateTasks },
    { key: 'congelado',label: 'Leads congelados',   hint: 'Sem movimento há +2 dias',    count: alertas.leadsCongelados, icon: Snowflake, tone: 'text-amber-400',  chip: 'bg-amber-500/15',  onClick: onNavigateCampaigns },
    { key: 'sla',      label: 'SLA estourado',      hint: 'Leads sem 1º contato no prazo',count: alertas.slaEstourado,    icon: Clock,     tone: 'text-orange-400', chip: 'bg-orange-500/15', onClick: onNavigateLeads },
  ] : []

  return (
    <div className="rounded-xl border border-line bg-surface overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
      <CardHeader
        icon={AlertTriangle}
        tone={{ chip: 'bg-red-500/15', icon: 'text-red-400' }}
        eyebrow="Ação Imediata"
        title={!alertas
          ? (loading ? 'Carregando…' : 'Alertas')
          : total === 0 ? 'Tudo em dia' : `${total} item${total !== 1 ? 's' : ''} pendente${total !== 1 ? 's' : ''}`}
      />

      {error && !alertas && <p className="px-5 py-4 text-xs text-error" role="alert">{error}</p>}

      {loading && !alertas && !error && (
        <div className="flex flex-col gap-2 px-5 py-4">
          {Array.from({ length: 3 }).map((_, i) => <ShimmerBlock key={i} className="w-full h-14" />)}
        </div>
      )}

      {alertas && total === 0 && (
        <div className="flex flex-col items-center py-10 gap-2">
          <CheckCircle2 size={26} className="text-success/60" />
          <p className="text-sm text-t3">Nenhum alerta pendente</p>
        </div>
      )}

      {alertas && total > 0 && (
        <div className="flex flex-col divide-y divide-line">
          {rows.map(r => (
            <button
              key={r.key}
              onClick={r.onClick}
              aria-label={`${r.label}: ${r.count}. ${r.hint}`}
              className="flex items-center gap-4 px-5 py-4 hover:bg-s2/40 transition-colors text-left cursor-pointer w-full"
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${r.chip}`}>
                <r.icon size={15} className={r.tone} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-t1">{r.label}</p>
                <p className="text-xs text-t4">{r.hint}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-xl font-black tabular-nums ${r.count > 0 ? r.tone : 'text-t4'}`}>{r.count}</span>
                <ArrowRight size={13} className="text-t4" aria-hidden />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Helpers de data ──────────────────────────────────────────────────────────

function daysAgo(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86_400_000
}
function daysOverdue(dueDate: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.floor((today.getTime() - new Date(dueDate + 'T00:00:00').getTime()) / 86_400_000)
}
function dueDateLabel(dueDate?: string): { text: string; color: string } {
  if (!dueDate) return { text: 'Sem prazo', color: 'text-t4' }
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diffDays = Math.round((new Date(dueDate + 'T00:00:00').getTime() - today.getTime()) / 86_400_000)
  if (diffDays === 0) return { text: 'Hoje!', color: 'text-amber-400' }
  if (diffDays === 1) return { text: 'Amanhã', color: 'text-yellow-400' }
  if (diffDays <= 7)  return { text: `Em ${diffDays} dias`, color: 'text-t2' }
  return { text: dueDate.split('-').reverse().join('/'), color: 'text-t3' }
}

// ─── Pipeline de Campanhas (detalhado — seção secundária) ─────────────────────

function CampaignFunnelWidget({ onNavigate }: { onNavigate: (id: string) => void }) {
  const { campaigns }             = useCampaignsStore()
  const { leads: allCampLeads }   = useCampaignLeadsStore()
  const { effectiveBrokerId, isGlobalView } = useAdminView()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Visão "ver como corretor" → conta apenas os leads atribuídos a ele
  const campLeads = isGlobalView ? allCampLeads : allCampLeads.filter(l => l.brokerId === effectiveBrokerId)

  const activeCampaigns = campaigns.filter(c => c.status === 'active')
  if (activeCampaigns.length === 0) return null

  const activeLeads    = campLeads.filter(l => activeCampaigns.some(c => c.id === l.campaignId))
  const totalPerStage  = CAMPAIGN_STAGES.map(({ stage }) => ({
    stage,
    count: activeLeads.filter(l => l.funnelStage === stage && !l.situation).length,
  }))
  const totalSales = activeLeads.filter(l => l.funnelStage === 'sale').length
  const grandTotal = activeLeads.length

  return (
    <div className="rounded-xl border border-line bg-page overflow-hidden mb-6 animate-slide-up">
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-line">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-purple-500/15 rounded-lg flex items-center justify-center">
            <Megaphone size={15} className="text-purple-400" />
          </div>
          <div>
            <p className="text-[11px] font-bold tracking-widest text-t4 uppercase">Detalhe por Campanha</p>
            <h2 className="text-sm font-bold text-t1 leading-none mt-0.5">
              {activeCampaigns.length} campanha{activeCampaigns.length !== 1 ? 's' : ''} ativa{activeCampaigns.length !== 1 ? 's' : ''} · {grandTotal.toLocaleString('pt-BR')} leads
            </h2>
          </div>
        </div>
        {totalSales > 0 && (
          <div className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 px-3 py-1.5 rounded-xl">
            <span className="text-green-400 text-xs font-bold tabular-nums">{totalSales}</span>
            <span className="text-green-500/70 text-[11px]">venda{totalSales !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      <div className="px-5 pt-4 pb-3 border-b border-line">
        <p className="text-[11px] font-bold text-t4 uppercase tracking-widest mb-3">Resumo geral</p>
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
          {CAMPAIGN_STAGES.map(({ stage, shortLabel, bg, text, border }) => {
            const count = totalPerStage.find(s => s.stage === stage)?.count ?? 0
            const pct   = grandTotal > 0 ? Math.round(count / grandTotal * 100) : 0
            return (
              <div key={stage} className={`flex flex-col items-center gap-1 rounded-xl p-3 border ${bg} ${border}`}>
                <p className={`text-[11px] font-bold uppercase tracking-wide ${text}`}>{shortLabel}</p>
                <p className="text-2xl font-black text-t1 tabular-nums leading-none">{count.toLocaleString('pt-BR')}</p>
                <p className="text-[11px] text-t4 tabular-nums">{pct}%</p>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex flex-col divide-y divide-line">
        {activeCampaigns.map(campaign => {
          const cLeads    = campLeads.filter(l => l.campaignId === campaign.id)
          const total     = cLeads.length
          const expanded  = expandedId === campaign.id
          const stageCounts = CAMPAIGN_STAGES.map(({ stage }) => ({
            stage,
            count: cLeads.filter(l => l.funnelStage === stage && !l.situation).length,
          }))
          const sales = cLeads.filter(l => l.funnelStage === 'sale').length

          return (
            <div key={campaign.id} className="hover:bg-s2/40 transition-colors">
              <button
                onClick={() => setExpandedId(expanded ? null : campaign.id)}
                className="w-full flex items-center gap-3 px-5 py-3 text-left cursor-pointer"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-t1 truncate">{campaign.name}</p>
                  <p className="text-xs text-t4 mt-0.5">{total.toLocaleString('pt-BR')} leads · {sales > 0 ? `${sales} venda${sales !== 1 ? 's' : ''}` : 'Sem vendas ainda'}</p>
                </div>
                <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
                  {CAMPAIGN_STAGES.slice(0, 4).map(({ stage, text, bg }) => {
                    const cnt = stageCounts.find(s => s.stage === stage)?.count ?? 0
                    if (cnt === 0) return null
                    return (
                      <span key={stage} className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${bg} ${text}`}>
                        {cnt}
                      </span>
                    )
                  })}
                </div>
                <button
                  onClick={e => { e.stopPropagation(); onNavigate(campaign.id) }}
                  className="flex-shrink-0 text-[11px] text-brand/60 hover:text-brand border border-brand/20 hover:border-brand/50 px-2 py-1 rounded-lg transition-colors mr-1"
                >
                  Abrir
                </button>
                {expanded
                  ? <ChevronUp size={14} className="text-t4 flex-shrink-0" />
                  : <ChevronDown size={14} className="text-t4 flex-shrink-0" />
                }
              </button>
              {expanded && (
                <div className="px-5 pb-4">
                  <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 mt-1">
                    {CAMPAIGN_STAGES.map(({ stage, shortLabel, bg, text, border }) => {
                      const cnt = stageCounts.find(s => s.stage === stage)?.count ?? 0
                      const pct = total > 0 ? Math.round(cnt / total * 100) : 0
                      return (
                        <div key={stage} className={`flex flex-col items-center gap-1 rounded-xl p-2.5 border ${bg} ${border}`}>
                          <p className={`text-[11px] font-bold uppercase tracking-wide ${text}`}>{shortLabel}</p>
                          <p className="text-xl font-black text-t1 tabular-nums leading-none">{cnt}</p>
                          <p className="text-[11px] text-t4">{pct}%</p>
                        </div>
                      )
                    })}
                  </div>
                  <div className="mt-3 flex items-center gap-1 overflow-x-auto">
                    {CAMPAIGN_STAGES.map(({ stage, shortLabel, text }, idx) => {
                      const cur  = stageCounts.find(s => s.stage === stage)?.count ?? 0
                      const prev = idx > 0
                        ? (stageCounts.find(s => s.stage === CAMPAIGN_STAGES[idx - 1].stage)?.count ?? 0)
                        : total
                      const conv = prev > 0 ? Math.round(cur / prev * 100) : 0
                      return (
                        <div key={stage} className="flex items-center gap-1 flex-shrink-0">
                          {idx > 0 && <span className="text-[11px] text-t4 tabular-nums">→ {conv}%</span>}
                          <div className="flex flex-col items-center">
                            <span className={`text-[11px] font-bold uppercase tracking-wide ${text}`}>{shortLabel}</span>
                            <span className="text-xs font-bold text-t1">{cur}</span>
                          </div>
                        </div>
                      )
                    })}
                    {sales > 0 && (
                      <>
                        <span className="text-[11px] text-t4">→</span>
                        <div className="flex flex-col items-center">
                          <span className="text-[11px] font-bold uppercase tracking-wide text-green-400">Vendas</span>
                          <span className="text-xs font-bold text-green-400">{sales}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Alertas de leads (sem interação) ─────────────────────────────────────────

function LeadAlertsWidget({
  onOpenLead, onNavigate, brokerNames = {},
}: { onOpenLead: (lead: Lead) => void; onNavigate: () => void; brokerNames?: Record<string, string> }) {
  const { leads, advanceFollowup } = useLeadsStore()
  const { byLead, add: addInteraction } = useLeadInteractionsStore()
  const { effectiveBrokerId, isGlobalView } = useAdminView()

  async function handleWhatsApp(e: React.MouseEvent, lead: Lead) {
    e.stopPropagation()
    window.open(whatsappUrl(lead.phone), '_blank')
    try {
      await advanceFollowup(lead.id)
      await addInteraction({
        leadId: lead.id,
        type: 'whatsapp',
        description: 'Interagiu via WhatsApp',
        interactedAt: new Date().toISOString(),
      })
      toast.success('Contato registrado')
    } catch { /* erro já toastado pela camada db */ }
  }

  const alertLeads = useMemo(() => {
    const active = leads.filter(l =>
      !l.discardReason && l.funnelStage !== 'venda' &&
      (isGlobalView || l.brokerId === effectiveBrokerId)
    )
    return active
      .map(l => {
        const ints     = byLead[l.id] ?? []
        const lastReal = ints.find(i => REAL_TYPES.has(i.type))
        const days     = daysAgo(lastReal?.interactedAt ?? l.createdAt)
        return { lead: l, days }
      })
      .filter(({ days }) => days > COOLING_DAYS)
      .sort((a, b) => b.days - a.days)
  }, [leads, byLead, isGlobalView, effectiveBrokerId])

  if (alertLeads.length === 0) return null

  return (
    <div className="rounded-xl border border-info-line bg-info-bg overflow-hidden mb-6 animate-slide-up">
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-info-line/50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-info/15 rounded-xl flex items-center justify-center">
            <Snowflake size={15} className="text-info" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-t1 leading-none">Leads sem contato</h2>
            <p className="text-xs text-t3 mt-0.5">Precisam de atenção agora</p>
          </div>
          <span className="ml-1 bg-info/20 text-info text-xs font-bold px-2.5 py-1 rounded-xl border border-info-line tabular-nums">
            {alertLeads.length}
          </span>
        </div>
        <button onClick={onNavigate} className="text-xs text-info hover:text-t2 flex items-center gap-1 transition-colors cursor-pointer">
          Ver funil <ArrowRight size={12} />
        </button>
      </div>
      <div className="flex flex-col divide-y divide-line">
        {alertLeads.slice(0, 7).map(({ lead, days }) => {
          const stageConf = STAGE_LABELS[lead.funnelStage]
          const daysInt   = Math.floor(days)
          const daysBadge = daysInt > 7
            ? 'text-red-400 bg-red-500/10 border-red-500/20'
            : daysInt > 4
              ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
              : 'text-info bg-info-bg border-info-line'
          return (
            <div
              key={lead.id}
              onClick={() => onOpenLead(lead)}
              className="flex items-center gap-3 px-5 py-3 hover:bg-info/5 transition-colors cursor-pointer"
            >
              <div className="w-8 h-8 rounded-lg bg-s3/50 border border-line flex items-center justify-center text-sm font-bold text-t2 flex-shrink-0">
                {lead.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-t1 truncate">{lead.name}</p>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[11px] ${stageConf?.color ?? 'text-t3'}`}>{stageConf?.label ?? lead.funnelStage}</span>
                  {lead.brokerId && brokerNames[lead.brokerId] && (
                    <span className="text-[11px] text-violet-400/70 bg-violet-500/8 px-1.5 py-px rounded-full border border-violet-500/15">
                      {brokerNames[lead.brokerId]}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded border tabular-nums ${daysBadge}`}>{daysInt}d</span>
                <button
                  onClick={e => handleWhatsApp(e, lead)}
                  title="Registrar contato e abrir WhatsApp"
                  aria-label={`Registrar contato e abrir WhatsApp de ${lead.name}`}
                  className="p-1.5 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-400 transition-colors"
                >
                  <MessageCircle size={12} />
                </button>
              </div>
            </div>
          )
        })}
        {alertLeads.length > 7 && (
          <div className="px-5 py-2.5 text-center">
            <button onClick={onNavigate} className="text-xs text-t4 hover:text-info transition-colors cursor-pointer">
              +{alertLeads.length - 7} leads mais precisam de contato →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tarefas em atraso ────────────────────────────────────────────────────────

function OverdueCard({
  tasks, contacts, properties, onNavigate,
}: { tasks: Task[]; contacts: Contact[]; properties: Property[]; onNavigate: () => void }) {
  if (tasks.length === 0) return null
  return (
    <div className="relative rounded-xl border border-red-500/40 bg-red-500/5 ring-1 ring-red-500/20 overflow-hidden mb-6 animate-slide-up">
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-red-500/20">
        <div className="flex items-center gap-2.5">
          <div className="relative w-8 h-8 bg-red-500/20 rounded-xl flex items-center justify-center">
            <Siren size={15} className="text-red-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-red-300 leading-none">Tarefas em atraso</h2>
            <p className="text-xs text-red-500/70 mt-0.5">Atenção imediata necessária</p>
          </div>
          <span className="ml-1 bg-red-500/25 text-red-300 text-xs font-bold px-2.5 py-1 rounded-xl border border-red-500/30 tabular-nums animate-pulse">{tasks.length}</span>
        </div>
        <button onClick={onNavigate} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors cursor-pointer">
          Resolver <ArrowRight size={12} />
        </button>
      </div>
      <div className="flex flex-col divide-y divide-red-500/10">
        {tasks.map(t => {
          const days     = daysOverdue(t.dueDate!)
          const contact  = contacts.find(c => c.id === t.contactId)
          const property = properties.find(p => p.id === t.propertyId)
          return (
            <button type="button" key={t.id} onClick={onNavigate} className="w-full text-left flex items-center gap-3 px-5 py-3 hover:bg-red-500/8 transition-colors cursor-pointer">
              <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-red-500/15 flex items-center justify-center">
                <AlertTriangle size={13} className="text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-t1 truncate">{t.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {contact  && <span className="text-xs text-t3 flex items-center gap-0.5"><Users size={9} /> {contact.name}</span>}
                  {property && <span className="text-xs text-t3 flex items-center gap-0.5"><Building2 size={9} /> {property.name}</span>}
                  {t.brokerId && (
                    <span className="text-[11px] text-violet-400/70 bg-violet-500/10 px-1.5 py-0.5 rounded-full border border-violet-500/20">
                      {(contacts as unknown as {id: string; name: string}[]).find(c => c.id === t.brokerId)?.name ?? 'Corretor'}
                    </span>
                  )}
                </div>
              </div>
              <span className="flex-shrink-0 flex items-center gap-1 text-xs font-bold text-red-400 bg-red-500/15 px-2 py-0.5 rounded-lg border border-red-500/20">
                <Clock size={10} /> {days === 1 ? '1 dia' : `${days} dias`} atraso
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Próximas tarefas ─────────────────────────────────────────────────────────

function UpcomingCard({
  tasks, contacts, properties, onNavigate,
}: { tasks: Task[]; contacts: Contact[]; properties: Property[]; onNavigate: () => void }) {
  const shown = tasks.slice(0, 6)
  return (
    <div className="relative rounded-xl border border-line bg-surface overflow-hidden mb-6 animate-slide-up">
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-line">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand/15 rounded-lg flex items-center justify-center">
            <CalendarCheck size={15} className="text-brand" />
          </div>
          <div>
            <p className="text-[11px] font-bold tracking-widest text-t4 uppercase">Próximas Tarefas</p>
            <h2 className="text-sm font-bold text-t1 leading-none mt-0.5">
              {tasks.length > 0 ? `${tasks.length} agendada${tasks.length !== 1 ? 's' : ''}` : 'Agenda livre'}
            </h2>
          </div>
        </div>
        <button onClick={onNavigate} className="text-xs text-brand hover:text-brand-text flex items-center gap-1 transition-colors cursor-pointer">
          Ver todas <ArrowRight size={12} />
        </button>
      </div>
      {tasks.length === 0 ? (
        <div className="flex flex-col items-center py-8 gap-2">
          <CheckCircle2 size={30} className="text-green-500/40" />
          <p className="text-sm text-t3">Nenhuma tarefa futura por enquanto</p>
          <button onClick={onNavigate} className="text-xs text-brand hover:text-brand-text transition-colors cursor-pointer mt-1">+ Criar tarefa →</button>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-line">
          {shown.map(t => {
            const due      = dueDateLabel(t.dueDate)
            const contact  = contacts.find(c => c.id === t.contactId)
            const property = properties.find(p => p.id === t.propertyId)
            return (
              <button type="button" key={t.id} onClick={onNavigate} className="w-full text-left flex items-center gap-3 px-5 py-3 hover:bg-s2/60 transition-colors cursor-pointer">
                <Circle size={16} className="text-t4 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-t1 truncate">{t.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {contact  && <span className="text-xs text-t4 flex items-center gap-0.5"><Users size={9} /> {contact.name}</span>}
                    {property && <span className="text-xs text-t4 flex items-center gap-0.5"><Building2 size={9} /> {property.name}</span>}
                  </div>
                </div>
                {t.dueDate && (
                  <span className={`flex-shrink-0 flex items-center gap-1 text-xs font-medium tabular-nums ${due.color}`}>
                    <Clock size={10} /> {due.text}
                  </span>
                )}
              </button>
            )
          })}
          {tasks.length > 6 && (
            <div className="px-5 py-2.5 text-center">
              <button onClick={onNavigate} className="text-xs text-t4 hover:text-brand transition-colors cursor-pointer">
                +{tasks.length - 6} mais tarefas →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Leads congelados em campanhas ───────────────────────────────────────────

const FROZEN_STAGES    = ['attended', 'scheduled', 'presentation', 'proposal'] as const
const FROZEN_LABELS: Record<string, string> = { attended: 'Interesse', scheduled: 'Agendado', presentation: 'Apresentação', proposal: 'Proposta' }

function FrozenLeadsWidget({ onNavigate }: { onNavigate: (id: string) => void }) {
  const { campaigns } = useCampaignsStore()
  const { leads }     = useCampaignLeadsStore()
  const { effectiveBrokerId, isGlobalView } = useAdminView()

  const frozen = useMemo(() => {
    return leads
      .filter(l => (FROZEN_STAGES as readonly string[]).includes(l.funnelStage) && !l.situation
        && (isGlobalView || l.brokerId === effectiveBrokerId))
      .map(l => {
        const ref  = l.stageUpdatedAt ?? l.updatedAt ?? l.createdAt
        const days = Math.floor((Date.now() - new Date(ref).getTime()) / 86_400_000)
        return { ...l, days }
      })
      .filter(l => l.days >= 2)
      .sort((a, b) => b.days - a.days)
  }, [leads, isGlobalView, effectiveBrokerId])

  if (frozen.length === 0) return null

  const byCampaign = frozen.reduce<Record<string, typeof frozen>>((acc, l) => {
    if (!acc[l.campaignId]) acc[l.campaignId] = []
    acc[l.campaignId].push(l)
    return acc
  }, {})

  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 overflow-hidden mb-6 animate-slide-up">
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-amber-500/15">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-amber-500/15 rounded-xl flex items-center justify-center">
            <Snowflake size={15} className="text-amber-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-t1 leading-none">Leads congelados</h2>
            <p className="text-xs text-t3 mt-0.5">Sem movimento há +2 dias nas campanhas</p>
          </div>
          <span className="ml-1 bg-amber-500/20 text-amber-300 text-xs font-bold px-2.5 py-1 rounded-xl border border-amber-500/25 tabular-nums">{frozen.length}</span>
        </div>
      </div>
      <div className="flex flex-col divide-y divide-amber-500/10">
        {Object.entries(byCampaign).slice(0, 3).map(([cid, cLeads]) => {
          const campaign = campaigns.find(c => c.id === cid)
          return (
            <button type="button" key={cid} className="w-full text-left px-5 py-3 hover:bg-amber-500/5 transition-colors cursor-pointer" onClick={() => onNavigate(cid)}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-t2">{campaign?.name ?? 'Campanha'}</p>
                <span className="text-[11px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">{cLeads.length} lead{cLeads.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex flex-col gap-1">
                {cLeads.slice(0, 3).map(l => (
                  <div key={l.id} className="flex items-center gap-2">
                    <span className="text-[11px] text-t3 w-24 truncate">{l.name}</span>
                    <span className="text-[11px] text-amber-400/70 bg-amber-500/8 px-1.5 py-0.5 rounded border border-amber-500/15">{FROZEN_LABELS[l.funnelStage] ?? l.funnelStage}</span>
                    <span className="text-[11px] text-t4 ml-auto">{l.days}d sem mov.</span>
                  </div>
                ))}
                {cLeads.length > 3 && <p className="text-[11px] text-t4">+{cLeads.length - 3} mais</p>}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Potencial de recompra ────────────────────────────────────────────────────

function RepurchaseWidget({ onNavigate }: { onNavigate: () => void }) {
  const { contacts } = useContactsStore()
  const { sales }    = useSalesStore()
  const { effectiveBrokerId, isGlobalView } = useAdminView()
  const candidates = useMemo(() => {
    return contacts
      .filter(c => c.tags.includes('buyer'))
      .map(c => {
        const clientSales = sales.filter(s => s.clientId === c.id).sort((a, b) => b.date.localeCompare(a.date))
        const lastSale    = clientSales[0]
        const daysSince   = lastSale ? Math.floor((Date.now() - new Date(lastSale.date).getTime()) / 86_400_000) : null
        return { contact: c, lastSale, daysSince, totalSales: clientSales.length }
      })
      .filter(c => c.daysSince !== null && c.daysSince >= 180)
      // Visão "ver como corretor" → só clientes cuja última venda foi dele
      .filter(c => isGlobalView || c.lastSale?.brokerId === effectiveBrokerId)
      .sort((a, b) => (b.daysSince ?? 0) - (a.daysSince ?? 0))
  }, [contacts, sales, isGlobalView, effectiveBrokerId])
  if (candidates.length === 0) return null

  return (
    <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 overflow-hidden mb-6 animate-slide-up">
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-emerald-500/15">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-emerald-500/15 rounded-xl flex items-center justify-center">
            <RefreshCw size={15} className="text-emerald-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-t1 leading-none">Potencial de recompra</h2>
            <p className="text-xs text-t3 mt-0.5">Clientes que compraram há +6 meses</p>
          </div>
          <span className="ml-1 bg-emerald-500/15 text-emerald-400 text-xs font-bold px-2.5 py-1 rounded-xl border border-emerald-500/20 tabular-nums">{candidates.length}</span>
        </div>
        <button onClick={onNavigate} className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors cursor-pointer">
          Ver contatos <ArrowRight size={12} />
        </button>
      </div>
      <div className="flex flex-col divide-y divide-emerald-500/8">
        {candidates.slice(0, 5).map(({ contact: c, lastSale, daysSince, totalSales }) => (
          <div key={c.id} className="flex items-center gap-3 px-5 py-3 hover:bg-emerald-500/5 transition-colors">
            <Avatar name={c.name} photoUrl={c.photoUrl} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-t1 truncate">{c.name}</p>
              <p className="text-[11px] text-t3">{totalSales} compra{totalSales !== 1 ? 's' : ''} · última: {lastSale ? formatDate(lastSale.date) : '—'}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[11px] text-emerald-400/70 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/15">{daysSince}d sem compra</span>
              <a href={whatsappUrl(c.phone)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="p-1.5 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-400 transition-colors">
                <MessageCircle size={12} />
              </a>
            </div>
          </div>
        ))}
        {candidates.length > 5 && (
          <div className="px-5 py-2 text-center">
            <button onClick={onNavigate} className="text-xs text-t4 hover:text-emerald-400 transition-colors cursor-pointer">+{candidates.length - 5} outros candidatos →</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Corretores online (admin only) ──────────────────────────────────────────

const PAGE_ICONS: Record<string, typeof Target> = {
  '/':            BarChart2,
  '/leads':       Target,
  '/contatos':    Users,
  '/imoveis':     Home,
  '/vendas':      DollarSign,
  '/campanhas':   Megaphone,
  '/tarefas':     CheckCircle2,
  '/performance': TrendingUp,
  '/permuta':     RefreshCw,
  '/metas':       Target,
  '/admin':       Settings,
  '/admin/logs':  ClipboardList,
}

function OnlineBrokersPanel() {
  const { onlineBrokers } = usePresenceStore()
  const brokers = onlineBrokers.filter(b => b.role === 'broker')

  if (brokers.length === 0) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-line bg-s2/30">
        <span className="w-2 h-2 rounded-full bg-slate-500 flex-shrink-0" />
        <p className="text-sm text-t3">Nenhum corretor online por enquanto.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {brokers.map(b => {
        const hasLocation  = b.lat != null && b.lng != null
        const mapsUrl      = hasLocation ? `https://www.google.com/maps?q=${b.lat},${b.lng}` : undefined
        const locationText = [b.city, b.region, b.country].filter(Boolean).join(', ')
        return (
          <div key={b.userId} className="flex items-center gap-3 px-4 py-3 bg-s2/50 rounded-xl border border-line">
            <div className="relative flex-shrink-0">
              <div className="w-9 h-9 rounded-full bg-brand/20 flex items-center justify-center text-sm font-bold text-brand">
                {b.name.charAt(0).toUpperCase()}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-s1 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-t1 truncate">{b.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {(() => { const PageIcon = PAGE_ICONS[b.currentPage] ?? Monitor; return <PageIcon size={12} className="text-t4 flex-shrink-0" /> })()}
                <span className="text-xs text-t3">{pageLabel(b.currentPage)}</span>
                {locationText && (
                  <>
                    <span className="text-t4">·</span>
                    <span className="text-xs text-t4 truncate">{locationText}</span>
                    <span className="text-[11px] text-t4 uppercase tracking-wide">
                      {b.locationSource === 'gps' ? 'GPS' : 'IP'}
                    </span>
                  </>
                )}
              </div>
            </div>
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                className="flex-shrink-0 text-[11px] text-brand/70 hover:text-brand border border-brand/20 hover:border-brand/50 px-2 py-1 rounded-lg transition-colors"
              >
                Ver mapa
              </a>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Dashboard principal ──────────────────────────────────────────────────────

export function DashboardPage() {
  const navigate = useNavigate()
  const [taskFormOpen,    setTaskFormOpen]    = useState(false)
  const [selectedLead,    setSelectedLead]    = useState<Lead | null>(null)
  const [showSecondary,   setShowSecondary]   = useState(false)
  const [overviewData,    setOverviewData]    = useState<OverviewData | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [overviewError,   setOverviewError]   = useState<string | null>(null)

  const { isAdmin, profile, allProfiles } = useAuthStore()
  const { effectiveBrokerId, isGlobalView } = useAdminView()
  const firstName = profile?.name?.split(' ')[0] ?? 'Corretor'
  const brokerNames = useMemo(() =>
    Object.fromEntries(allProfiles.map(p => [p.id, p.name])),
    [allProfiles]
  )

  const { contacts, load: loadContacts, getBirthdaysThisMonth } = useContactsStore()
  const { properties, load: loadProperties }   = usePropertiesStore()
  const { sales, load: loadSales, getByPeriod } = useSalesStore()
  const { tasks, load: loadTasks, getUpcoming, getOverdue }        = useTasksStore()
  const { load: loadCampaigns }   = useCampaignsStore()
  const { load: loadCampLeads }   = useCampaignLeadsStore()
  const { load: loadMyLeads }     = useLeadsStore()
  const { loadAll: loadInteractions } = useLeadInteractionsStore()
  const { startDate, endDate, getLabel } = usePeriodStore()

  async function loadOverview() {
    setOverviewLoading(true)
    setOverviewError(null)
    // Respeita o modelo de visão: global (null), "Meu Desempenho" ou Corretor X.
    // Para corretor comum effectiveBrokerId = próprio id; a RLS reforça o limite.
    const { data, error } = await supabase.rpc('dashboard_overview', { p_broker_id: effectiveBrokerId })
    if (error) {
      setOverviewError(error.message)
      setOverviewLoading(false)
      return
    }
    setOverviewData(data as OverviewData)
    setOverviewLoading(false)
  }

  // Stores carregam uma vez; a RPC de overview refaz fetch ao trocar a visão.
  useEffect(() => {
    loadContacts(); loadProperties(); loadSales(); loadTasks()
    loadCampaigns(); loadCampLeads(); loadMyLeads(); loadInteractions()
  }, [])

  useEffect(() => {
    loadOverview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveBrokerId])

  // Escopo da visão para os widgets que leem stores no client (seção secundária).
  // Para corretor comum o store já vem filtrado pela RLS; isto cobre o admin
  // quando ele escolhe "Meu Desempenho" ou um corretor específico.
  const inView      = <T extends { brokerId?: string | null }>(arr: T[]) =>
    isGlobalView ? arr : arr.filter(x => x.brokerId === effectiveBrokerId)
  const inViewTasks = (arr: Task[]) =>
    isGlobalView ? arr : arr.filter(t => (t.assignedToId ?? t.brokerId) === effectiveBrokerId)

  const periodLabel   = getLabel()
  const salesInPeriod = inView(getByPeriod(startDate, endDate))
  const valueInPeriod = salesInPeriod.reduce((a, s) => a + s.value, 0)
  const accumulatedSales      = inView(sales.filter(s => s.date <= endDate))
  const totalAccumulated      = accumulatedSales.reduce((acc, s) => acc + s.value, 0)
  const totalAccumulatedCount = accumulatedSales.length
  const recentSales   = salesInPeriod.slice(0, 5)
  const upcomingTasks = inViewTasks(getUpcoming())
  const overdueTasks  = inViewTasks(getOverdue())
  const birthdays     = inView(getBirthdaysThisMonth())
  const periodComm    = salesInPeriod.reduce((a, s) => a + calcSaleCommissions(s).totalCommission, 0)
  const periodBroker  = salesInPeriod.reduce((a, s) => a + calcSaleCommissions(s).brokerCommission, 0)
  const tasksDoneInPeriod    = inViewTasks(tasks.filter(t => t.status === 'done' && t.completedAt && matchesPeriod(t.completedAt.split('T')[0], startDate, endDate))).length
  const tasksPendingInPeriod = inViewTasks(tasks.filter(t => t.status !== 'done' && t.dueDate && matchesPeriod(t.dueDate, startDate, endDate))).length

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Bom dia'
    if (h < 18) return 'Boa tarde'
    return 'Boa noite'
  }
  const todayFormatted = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <PageLayout
      title={`${greeting()}, ${firstName}`}
      subtitle={todayFormatted.charAt(0).toUpperCase() + todayFormatted.slice(1)}
      ctaLabel="Nova Tarefa"
      onCta={() => setTaskFormOpen(true)}
    >

      {/* ══ Visão geral — centro de comando ══════════════════════════════ */}
      <SectionLabel icon={Target} hint="Atualizado em tempo real">Visão geral</SectionLabel>

      {/* Indicadores principais — VGL Previsão × Realizado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
        <VGLPrevisaoHero
          data={overviewData}
          loading={overviewLoading}
          error={overviewError}
          onRetry={loadOverview}
          onNavigate={() => navigate('/leads')}
        />
        <VGLHero
          data={overviewData}
          loading={overviewLoading}
          error={overviewError}
          onRetry={loadOverview}
          onNavigate={() => navigate('/vendas')}
        />
      </div>

      {/* KPIs secundários */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-7">
        <OverviewKPICard
          title="Leads ativos"
          value={overviewData?.leadsAtivos ?? '—'}
          sub="em aberto no funil"
          icon={Users}
          tone="teal"
          onClick={() => navigate('/leads')}
          loading={overviewLoading && !overviewData}
        />
        <OverviewKPICard
          title="Vendas no mês"
          value={overviewData?.vgl.vendasMes ?? '—'}
          sub={overviewData ? formatCurrency(overviewData.vgl.realizadoMes) : undefined}
          icon={TrendingUp}
          tone="green"
          onClick={() => navigate('/vendas')}
          loading={overviewLoading && !overviewData}
        />
        <OverviewKPICard
          title="Sem interação"
          value={overviewData?.leadsSemInteracao ?? '—'}
          sub="leads há +48h sem contato"
          icon={Flame}
          tone="amber"
          alert
          onClick={() => navigate('/leads')}
          loading={overviewLoading && !overviewData}
        />
        <OverviewKPICard
          title="Campanhas ativas"
          value={overviewData?.campaignFunnel.totalCampaigns ?? '—'}
          sub={overviewData ? `${overviewData.campaignFunnel.totalLeads.toLocaleString('pt-BR')} leads em disparo` : undefined}
          icon={Megaphone}
          tone="purple"
          onClick={() => navigate('/campanhas')}
          loading={overviewLoading && !overviewData}
        />
      </div>

      {/* ══ Funil de vendas ═════════════════════════════════════════════ */}
      <SectionLabel icon={BarChart2}>Funil de vendas</SectionLabel>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-7">
        <LeadFunnelWidget
          data={overviewData}
          loading={overviewLoading}
          error={overviewError}
          onNavigate={() => navigate('/leads')}
        />
        <CompactCampaignFunnel
          data={overviewData}
          loading={overviewLoading}
          onNavigate={() => navigate('/campanhas')}
        />
      </div>

      {/* ══ Desempenho ══════════════════════════════════════════════════ */}
      <SectionLabel icon={TrendingUp}>Desempenho</SectionLabel>
      <PerformanceGoalsWidget />

      {/* ══ Precisa de ação ═════════════════════════════════════════════ */}
      <SectionLabel icon={AlertTriangle}>Precisa de ação</SectionLabel>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start mb-7">
        <AlertsPanel
          alertas={overviewData?.alertas}
          loading={overviewLoading}
          error={overviewError}
          onNavigateTasks={() => navigate('/tarefas')}
          onNavigateLeads={() => navigate('/leads')}
          onNavigateCampaigns={() => navigate('/campanhas')}
        />
        {/* LeadAlertsWidget já retorna null quando vazio — envolve em fragmento sem mb */}
        <div className="[&>div]:mb-0">
          <LeadAlertsWidget
            onOpenLead={setSelectedLead}
            onNavigate={() => navigate('/leads')}
            brokerNames={brokerNames}
          />
        </div>
      </div>

      {/* ══ Seção secundária (expansível) ═══════════════════════════════ */}
      <button
        onClick={() => setShowSecondary(s => !s)}
        aria-expanded={showSecondary}
        className="w-full flex items-center justify-center gap-2 py-3 mb-6 rounded-xl border border-line bg-surface text-xs font-semibold text-t3 hover:text-t2 hover:border-line-strong transition-colors cursor-pointer"
      >
        {showSecondary ? (
          <><ChevronUp size={14} /> Ocultar detalhes</>
        ) : (
          <><ChevronDown size={14} /> Mais detalhes: vendas, tarefas, aniversários, campanhas</>
        )}
      </button>

      {showSecondary && (
        <div className="animate-slide-up">
          {/* Seletor de período */}
          <div className="flex items-center justify-between mb-6 px-1">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-4 rounded-full bg-brand" />
              <p className="text-xs text-t3">Período: <span className="text-t1 font-semibold">{periodLabel}</span></p>
            </div>
            <PeriodSelector />
          </div>

          {/* Tarefas em atraso (lista completa) */}
          <OverdueCard
            tasks={overdueTasks}
            contacts={contacts}
            properties={properties}
            onNavigate={() => navigate('/tarefas')}
          />

          {/* Leads congelados em campanhas (lista completa) */}
          <FrozenLeadsWidget onNavigate={id => navigate(`/campanhas?id=${id}`)} />

          {/* Números do período */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div className="relative bg-surface border border-line rounded-xl overflow-hidden hover:-translate-y-0.5 transition-all hover:border-line-strong hover:shadow-2xl hover:shadow-black/40">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-violet-500" />
              <div className="p-5">
                <p className="text-xs font-semibold text-t3 uppercase tracking-widest mb-3">Tarefas — {periodLabel}</p>
                <div className="flex items-center gap-4 mb-3">
                  <div className="flex-1">
                    <p className="text-3xl font-black text-t1 tabular-nums leading-none">{tasksDoneInPeriod}</p>
                    <p className="text-[11px] text-t4 mt-1 flex items-center gap-1"><ClipboardCheck size={9} className="text-green-500" /> realizadas</p>
                  </div>
                  <div className="w-px h-8 bg-line flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-3xl font-black text-violet-300 tabular-nums leading-none">{tasksPendingInPeriod}</p>
                    <p className="text-[11px] text-t4 mt-1 flex items-center gap-1"><ListTodo size={9} className="text-violet-500" /> pendentes</p>
                  </div>
                </div>
                <div className="h-1 bg-s3/50 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-green-500 transition-all duration-700" style={{ width: `${tasksDoneInPeriod + tasksPendingInPeriod > 0 ? Math.round(tasksDoneInPeriod / (tasksDoneInPeriod + tasksPendingInPeriod) * 100) : 0}%` }} />
                </div>
              </div>
            </div>
            <StatCard label="Imóveis ativos" value={properties.length} sub={`${properties.filter(p => p.status === 'opportunity').length} oportunidades`} icon={<Building2 size={16} />} accent="blue" />
            <StatCard label="Volume acumulado" value={formatCurrency(totalAccumulated)} sub={`${totalAccumulatedCount} venda${totalAccumulatedCount !== 1 ? 's' : ''} até ${periodLabel}`} icon={<DollarSign size={16} />} accent="green" />
            <StatCard label={`Vendas — ${periodLabel}`} value={formatCurrency(valueInPeriod)} sub={`${salesInPeriod.length} venda${salesInPeriod.length !== 1 ? 's' : ''} no período`} icon={<TrendingUp size={16} />} accent="purple" />
          </div>

          {salesInPeriod.length > 0 && (
            <div className="grid grid-cols-2 gap-4 mb-6">
              <StatCard label={`Comissão gerada — ${periodLabel}`} value={formatCurrencyFull(periodComm)} sub="soma das comissões negociadas" icon={<DollarSign size={18} />} accent="purple" />
              <StatCard label={`Sua comissão — ${periodLabel}`} value={formatCurrencyFull(periodBroker)} sub="sua parte no período" icon={<TrendingUp size={18} />} accent="green" />
            </div>
          )}

          {/* Corretores online (admin) */}
          {isAdmin && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-t3">Corretores Online</h2>
              </div>
              <OnlineBrokersPanel />
            </div>
          )}

          {/* Aniversários + Últimas vendas */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <Card accent="yellow" className="animate-slide-up">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 bg-yellow-500/15 rounded-lg flex items-center justify-center"><Cake size={14} className="text-yellow-400" /></div>
                <h2 className="text-sm font-semibold text-t1">Aniversários do mês</h2>
                {birthdays.length > 0 && (
                  <span className="ml-auto bg-yellow-500/20 text-yellow-400 text-xs font-bold px-2 py-0.5 rounded-lg border border-yellow-500/30">{birthdays.length}</span>
                )}
              </div>
              {birthdays.length === 0 ? (
                <div className="flex flex-col items-center py-6 gap-2">
                  <Gift size={28} className="text-t4" />
                  <p className="text-xs text-t4 text-center">Nenhum aniversário este mês</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {birthdays.slice(0, 5).map(c => (
                    <div key={c.id} className="flex items-center gap-3 group">
                      <Avatar name={c.name} photoUrl={c.photoUrl} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-t1 truncate font-medium">{c.name}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-yellow-400 tabular-nums">{getBirthdayDay(c.birthdate!).replace(/^0/, '')}/{c.birthdate!.split('-')[1]}</span>
                        <a href={whatsappUrl(c.phone)} target="_blank" rel="noopener noreferrer" className="opacity-0 group-hover:opacity-100 p-1 rounded-lg bg-green-500/10 text-green-400 transition-all">
                          <MessageCircle size={12} />
                        </a>
                      </div>
                    </div>
                  ))}
                  {birthdays.length > 5 && <p className="text-xs text-t4 text-center pt-1">+{birthdays.length - 5} mais</p>}
                </div>
              )}
            </Card>

            <Card className="lg:col-span-2 animate-slide-up">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-green-500/15 rounded-lg flex items-center justify-center"><TrendingUp size={14} className="text-green-400" /></div>
                  <h2 className="text-sm font-semibold text-t1">Últimas vendas</h2>
                </div>
                <button onClick={() => navigate('/vendas')} className="text-xs text-brand hover:text-brand-text flex items-center gap-1 transition-colors cursor-pointer hover:gap-2">
                  Ver todas <ArrowRight size={12} />
                </button>
              </div>
              {recentSales.length === 0 ? (
                <div className="flex flex-col items-center py-8 gap-2">
                  <div className="w-12 h-12 bg-s3/50 rounded-xl flex items-center justify-center"><Sparkles size={20} className="text-t4" /></div>
                  <p className="text-sm text-t3">Nenhuma venda registrada ainda</p>
                  <button onClick={() => navigate('/vendas?new=1')} className="text-xs text-brand hover:text-brand-text transition-colors cursor-pointer mt-1">Registrar primeira venda →</button>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {recentSales.map(s => {
                    const client = contacts.find(c => c.id === s.clientId)
                    return (
                      <div key={s.id} className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-s2/60 transition-colors -mx-3">
                        <Avatar name={client?.name ?? s.propertyName} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-t1 truncate">{client?.name ?? '—'}</p>
                          <p className="text-xs text-t3 truncate">{s.propertyName}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-bold text-green-400 tabular-nums">{formatCurrencyFull(s.value)}</p>
                          <p className="text-xs text-t4">{formatDate(s.date)}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* Próximas tarefas */}
          <UpcomingCard tasks={upcomingTasks} contacts={contacts} properties={properties} onNavigate={() => navigate('/tarefas')} />

          {/* Potencial de recompra */}
          <RepurchaseWidget onNavigate={() => navigate('/contatos')} />

          {/* Detalhamento por campanha */}
          <CampaignFunnelWidget onNavigate={id => navigate(`/campanhas?id=${id}`)} />
        </div>
      )}

      {/* Modais */}
      <TaskForm isOpen={taskFormOpen} onClose={() => setTaskFormOpen(false)} />
      {selectedLead && <LeadModal lead={selectedLead} onClose={() => setSelectedLead(null)} />}
    </PageLayout>
  )
}
