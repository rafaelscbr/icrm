import { useEffect, useMemo, useState, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, TrendingUp, DollarSign, ArrowRight, Sparkles, CheckCircle2,
  AlertTriangle, CalendarCheck, Siren, RefreshCw,
  ChevronDown, ChevronUp, FileText, Flame, Info, BarChart3, Wallet, ArrowDown,
} from 'lucide-react'
import { Task, Lead, calcSaleCommissions } from '../../types'
import { STAGE_THEME, FUNNEL_STAGES } from '../../lib/stageTheme'
import { TaskForm } from '../tasks/TaskForm'
import { LeadModal } from '../leads/LeadModal'
import { PageLayout } from '../../components/layout/PageLayout'
import { useSalesStore } from '../../store/useSalesStore'
import { useTasksStore } from '../../store/useTasksStore'
import { useLeadsStore } from '../../store/useLeadsStore'
import { useLeadInteractionsStore } from '../../store/useLeadInteractionsStore'
import { useAdminView } from '../../hooks/useAdminView'
import { useAuthStore } from '../../store/useAuthStore'
import { formatCurrency, formatCurrencyFull, whatsappUrl } from '../../lib/formatters'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

/* ═══════════════════════════════════════════════════════════════════════════
   SOUZA COMMAND CENTER
   Inteligência comercial para transformar meta em vendas.

   Hierarquia da tela, de cima para baixo:
     1. Hero        — Meta de VGV × Previsão de VGV (o coração da tela)
     2. Indicadores — receita em protagonismo, operação discreta, alerta urgente
     3. Prioridades — o que exige ação agora, com nome e link para resolver
     4. Funil       — receita por etapa, com gargalo explícito
     5. Evolução    — VGV realizado por semana contra a meta acumulada

   Regra do produto: a PREVISÃO é visita + proposta, nunca o funil inteiro.
   Etapas de topo não são previsão de receita — são volume. Misturar as duas
   coisas produz um número bonito e inútil.

   Procedência dos números: contagens e VGL vêm da RPC `dashboard_overview`
   (fonte de verdade, escopada por p_broker_id). VGV, tempo médio e leads
   parados por etapa vêm do store de leads — mesma origem dos totais das
   colunas do Kanban, então os números batem entre as duas telas. O único
   valor derivado é a meta acumulada do gráfico (ritmo linear), rotulada
   como tal.
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── Tipos das RPCs ───────────────────────────────────────────────────────────

interface OverviewData {
  vgl: {
    target: number; realizadoMes: number; vendasMes: number
    expectativa: number; expectativaVisita: number; expectativaProposta: number
    leadsVisita: number; leadsProposta: number
  }
  leadFunnel: Array<{ stage: string; count: number }>
  leadsAtivos: number
  leadsSemInteracao: number
  alertas: { tarefasEmAtraso: number; slaEstourado: number }
}

/**
 * Coorte do funil (RPC `lead_funnel_analytics`).
 *
 * `reached` = quantos leads já ALCANÇARAM cada etapa, por profundidade máxima.
 * É monotônico e é a única base válida para calcular conversão.
 *
 * A contagem de ocupação (`leadFunnel` do overview) NÃO serve para isso: ela diz
 * quantos leads estão parados em cada etapa AGORA. Com 2 em "Lead" e 77 em
 * "Followup", dividir um pelo outro dava "3850% de conversão" — número sem
 * significado, porque não são a mesma coorte.
 */
interface FunnelAnalytics {
  totalLeads: number
  funnel: Array<{ stage: string; reached: number; avgDays: number | null }>
}

interface ExtrasData {
  aniversariantes: Array<{
    id: string; nome: string; telefone: string
    birthdate: string; photoUrl: string | null
  }>
  recompra: Array<{
    id: string; nome: string; telefone: string; photoUrl: string | null
    totalVendas: number; ultimaVenda: string; diasDesde: number
  }>
  recompraTotal: number
  leadsSemContato: Array<{ leadId: string; dias: number }>
}

/** Comissão estimada sobre pipeline — mesma convenção do Kanban (2%). */
const PIPELINE_COMMISSION_RATE = 0.02

/** Teto de leads frios na lista de prioridades — o excedente é anunciado na tela. */
const COLD_LIMIT = 10

// ─── Primitivas ───────────────────────────────────────────────────────────────

function SectionLabel({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline gap-3 mb-3.5 px-0.5">
      <h2 className="font-heading text-[15px] font-extrabold text-t1 tracking-[-0.02em]">{children}</h2>
      {hint && <span className="text-[11px] text-t4 truncate">{hint}</span>}
    </div>
  )
}

function ShimmerBlock({ className = '' }: { className?: string }) {
  return <div className={`shimmer rounded-lg ${className}`} aria-hidden />
}

/** Tooltip acessível: o gatilho é focável e o texto aparece no foco também. */
function InfoHint({ text }: { text: string }) {
  return (
    <span className="relative inline-flex group/hint align-middle">
      <button
        type="button"
        aria-label={text}
        className="w-4 h-4 flex items-center justify-center rounded-full text-t4 hover:text-t2 cursor-help"
      >
        <Info size={12} aria-hidden />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-60 z-30
          opacity-0 group-hover/hint:opacity-100 group-focus-within/hint:opacity-100 transition-opacity
          text-[11px] leading-relaxed text-t2 bg-s3 border border-line rounded-lg px-2.5 py-2 shadow-dropdown"
      >
        {text}
      </span>
    </span>
  )
}

// ─── 1. HERO — Meta × Previsão ────────────────────────────────────────────────

/**
 * Curva de valorização — assinatura visual do hero. Decorativa, não é dado.
 *
 * Fica confinada à faixa inferior e bem apagada: numa primeira versão ela
 * atravessava a caixa de insight do painel direito e parecia um traço solto
 * cortando o texto. Ambiente é o objetivo; competir com o conteúdo, não.
 */
function HorizonCurve() {
  return (
    <svg
      className="pointer-events-none absolute inset-x-0 bottom-0 h-20 w-full opacity-70"
      viewBox="0 0 800 80" preserveAspectRatio="none" aria-hidden
    >
      <defs>
        <linearGradient id="hzFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="var(--brand)" stopOpacity="0.10" />
          <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="hzLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="var(--brand)" stopOpacity="0" />
          <stop offset="60%"  stopColor="var(--brand)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.40" />
        </linearGradient>
      </defs>
      <path d="M0,70 C160,66 250,58 380,46 C500,34 620,24 800,12 L800,80 L0,80 Z" fill="url(#hzFill)" />
      <path d="M0,70 C160,66 250,58 380,46 C500,34 620,24 800,12" fill="none" stroke="url(#hzLine)" strokeWidth="1.25" />
    </svg>
  )
}

type Health = { label: string; cls: string; dot: string }

function healthOf(coverage: number): Health {
  if (coverage >= 1)   return { label: 'Meta coberta',          cls: 'text-success bg-success-bg border-success-line', dot: 'bg-success' }
  if (coverage >= 0.6) return { label: 'Em construção',         cls: 'text-brand-text bg-brand-tint border-brand/30',  dot: 'bg-brand'   }
  return                      { label: 'Pipeline insuficiente', cls: 'text-error bg-error-bg border-error-line',       dot: 'bg-error'   }
}

function CommandHero({ data, loading, error, onRetry, onNavigateVendas, onNavigateLeads }: {
  data: OverviewData | null
  loading: boolean
  error: string | null
  onRetry: () => void
  onNavigateVendas: () => void
  onNavigateLeads: () => void
}) {
  const now = new Date()
  const monthLabel  = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const monthTitle  = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const dayOfMonth  = now.getDate()
  const paceFrac    = dayOfMonth / daysInMonth

  const target    = data?.vgl.target ?? 0
  const realizado = data?.vgl.realizadoMes ?? 0
  const vendasMes = data?.vgl.vendasMes ?? 0
  const visita    = data?.vgl.expectativaVisita ?? 0
  const proposta  = data?.vgl.expectativaProposta ?? 0
  const previsao  = data?.vgl.expectativa ?? 0

  const pct      = target > 0 ? realizado / target : 0
  const falta    = Math.max(target - realizado, 0)
  const coverage = target > 0 ? previsao / target : 0
  const gapPrev  = Math.max(falta - previsao, 0)
  const health   = healthOf(coverage)
  const noRitmo  = pct >= paceFrac

  // Ticket médio só existe se houve venda no mês — sem venda, não estimamos.
  const ticketMedio    = vendasMes > 0 ? realizado / vendasMes : null
  const vendasParaMeta = ticketMedio && falta > 0 ? Math.ceil(falta / ticketMedio) : null

  const insight = coverage >= 1
    ? `A previsão cobre ${Math.round(coverage * 100)}% da meta. O pipeline maduro já é suficiente — o foco agora é fechar o que está em negociação.`
    : `A previsão cobre ${Math.round(coverage * 100)}% da meta. Para fechar o gap, a operação precisa converter ${formatCurrency(gapPrev)} em novas visitas ou propostas.`

  if (error && !data) {
    return (
      <div className="rounded-[20px] border border-error-line bg-error-bg px-6 py-6 flex items-center gap-3">
        <AlertTriangle size={20} className="text-error flex-shrink-0" aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-t1">Não foi possível carregar a meta</p>
          <p className="text-xs text-error mt-0.5" role="alert">{error}</p>
        </div>
        <button onClick={onRetry} className="text-xs font-semibold text-error border border-error-line hover:bg-error-bg px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex-shrink-0">
          Tentar de novo
        </button>
      </div>
    )
  }

  if (loading && !data) {
    return (
      <div className="rounded-[20px] border border-line bg-surface p-8 grid lg:grid-cols-2 gap-10">
        <div className="flex flex-col gap-4">
          <ShimmerBlock className="w-40 h-3" /><ShimmerBlock className="w-64 h-12" />
          <ShimmerBlock className="w-full h-3" /><ShimmerBlock className="w-52 h-4" />
        </div>
        <div className="flex flex-col gap-4">
          <ShimmerBlock className="w-40 h-3" /><ShimmerBlock className="w-56 h-12" />
          <ShimmerBlock className="w-full h-16" />
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div
      className="relative overflow-hidden rounded-[20px] border border-line surface-premium gold-glow-tl gold-edge"
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      <HorizonCurve />

      <div className="relative grid lg:grid-cols-2">

        {/* ── Meta de VGV ──────────────────────────────────────────────── */}
        <section className="p-6 lg:p-8" aria-label="Meta de VGV do mês">
          <div className="flex items-center gap-2 mb-5">
            <span className="w-1 h-3.5 rounded-full bg-brand" aria-hidden />
            <h3 className="font-label text-[11px] font-bold uppercase tracking-[0.16em] text-t3">
              Meta de VGV — {monthTitle}
            </h3>
            <button
              onClick={onRetry}
              disabled={loading}
              className="ml-auto p-1.5 rounded-lg text-t4 hover:text-t2 hover:bg-s3 transition-colors cursor-pointer disabled:opacity-50"
              aria-label="Atualizar dados"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          <p
            className="font-heading text-[clamp(2.5rem,5vw,3.4rem)] font-black text-t1 tabular-nums leading-[0.95] tracking-[-0.035em]"
            style={{ textShadow: '0 1px 24px rgba(228,178,60,0.10)' }}
          >
            {formatCurrencyFull(target)}
          </p>

          <div className="flex items-baseline gap-2.5 mt-3 flex-wrap">
            <span className="text-lg font-bold text-brand tabular-nums">{formatCurrency(realizado)}</span>
            <span className="text-sm text-t3">realizado</span>
            <span
              className={`font-label text-[11px] font-bold uppercase tracking-[0.08em] px-2 py-0.5 rounded-full border tabular-nums
                ${noRitmo ? 'text-success bg-success-bg border-success-line' : 'text-warning bg-warning-bg border-warning-line'}`}
            >
              {Math.round(pct * 100)}% da meta
            </span>
          </div>

          {/* Progresso com marcador de ritmo esperado */}
          <div className="mt-5">
            <div
              className="relative h-2.5 rounded-full overflow-hidden bg-s3"
              role="progressbar"
              aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100}
              aria-label={`VGV realizado: ${Math.round(pct * 100)} por cento da meta`}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-1000"
                style={{
                  width: `${Math.min(pct, 1) * 100}%`,
                  background: 'linear-gradient(90deg, var(--brand-dark), var(--brand) 70%, var(--brand-text))',
                  boxShadow: '0 0 16px rgba(228,178,60,0.35)',
                }}
                aria-hidden
              />
              {paceFrac < 1 && (
                <div className="absolute inset-y-0 w-0.5 bg-t1/70" style={{ left: `${paceFrac * 100}%` }} aria-hidden />
              )}
            </div>
            <div className="flex items-center justify-between gap-3 mt-2 flex-wrap">
              <span className="text-[11px] text-t4 tabular-nums">
                Dia {dayOfMonth} de {daysInMonth} · ritmo esperado {Math.round(paceFrac * 100)}%
              </span>
              <span className={`text-[11px] font-semibold ${noRitmo ? 'text-success' : 'text-warning'}`}>
                {noRitmo ? 'No ritmo do mês' : 'Abaixo do ritmo'}
              </span>
            </div>
          </div>

          {/* Desdobramento */}
          <div className="mt-6 flex flex-wrap items-stretch gap-x-8 gap-y-4">
            <button onClick={onNavigateVendas} className="text-left cursor-pointer group">
              <span className="font-label text-[11px] font-bold uppercase tracking-[0.1em] text-t4 block">Falta</span>
              <span className="text-xl font-bold text-t1 tabular-nums block mt-0.5 group-hover:text-brand transition-colors">
                {falta > 0 ? formatCurrency(falta) : 'Meta batida'}
              </span>
            </button>
            <div className="w-px self-stretch bg-line" aria-hidden />
            <button onClick={onNavigateVendas} className="text-left cursor-pointer group">
              <span className="font-label text-[11px] font-bold uppercase tracking-[0.1em] text-t4 block">Vendas no mês</span>
              <span className="text-xl font-bold text-t1 tabular-nums block mt-0.5 group-hover:text-brand transition-colors">
                {vendasMes}
              </span>
            </button>
            {vendasParaMeta !== null && (
              <>
                <div className="w-px self-stretch bg-line" aria-hidden />
                <div className="text-left">
                  <span className="font-label text-[11px] font-bold uppercase tracking-[0.1em] text-t4 flex items-center gap-1">
                    Faltam ~
                    <InfoHint text={`Estimativa pelo ticket médio das vendas deste mês (${formatCurrency(ticketMedio!)}). Só aparece quando já houve venda no período.`} />
                  </span>
                  <span className="text-xl font-bold text-t1 tabular-nums block mt-0.5">
                    {vendasParaMeta} venda{vendasParaMeta !== 1 ? 's' : ''}
                  </span>
                </div>
              </>
            )}
          </div>
        </section>

        {/* ── Previsão de VGV ──────────────────────────────────────────── */}
        <section
          className="relative p-6 lg:p-8 border-t lg:border-t-0 lg:border-l border-line"
          aria-label="Previsão de VGV"
        >
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            <span className={`w-1 h-3.5 rounded-full ${health.dot}`} aria-hidden />
            <h3 className="font-label text-[11px] font-bold uppercase tracking-[0.16em] text-t3">Previsão de VGV</h3>
            <InfoHint text="Previsão = VGV somado apenas das etapas Visita e Proposta. Etapas de topo (Lead, Follow-up, Atendimento) não entram: são volume, não oportunidade madura." />
            <span className={`ml-auto flex items-center gap-1.5 font-label text-[11px] font-bold uppercase tracking-[0.08em] px-2.5 py-1 rounded-full border ${health.cls}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${health.dot}`} aria-hidden />
              {health.label}
            </span>
          </div>

          <p className="font-heading text-[clamp(2.1rem,4.2vw,2.9rem)] font-black text-t1 tabular-nums leading-[0.95] tracking-[-0.035em]">
            {formatCurrency(previsao)}
          </p>
          <p className="text-sm text-t3 mt-2.5">
            cobre <span className="font-bold text-t1 tabular-nums">{Math.round(coverage * 100)}%</span> da meta do mês
          </p>

          {/* Composição: visita × proposta */}
          <div className="mt-5 flex flex-col gap-3">
            {[
              { label: 'Visita',   value: visita,   leads: data.vgl.leadsVisita,   varName: 'var(--stage-visita)'   },
              { label: 'Proposta', value: proposta, leads: data.vgl.leadsProposta, varName: 'var(--stage-proposta)' },
            ].map(row => (
              <button key={row.label} onClick={onNavigateLeads} className="group flex items-center gap-3 text-left cursor-pointer">
                <span className="w-20 flex-shrink-0 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: row.varName }} aria-hidden />
                  <span className="text-xs font-semibold text-t2">{row.label}</span>
                </span>
                <span className="flex-1 h-1.5 rounded-full bg-s3 overflow-hidden min-w-0">
                  <span
                    className="block h-full rounded-full transition-all duration-700"
                    style={{ width: `${previsao > 0 ? (row.value / previsao) * 100 : 0}%`, background: row.varName }}
                  />
                </span>
                <span className="text-sm font-bold text-t1 tabular-nums w-20 text-right flex-shrink-0 group-hover:text-brand transition-colors">
                  {formatCurrency(row.value)}
                </span>
                <span className="text-[11px] text-t4 tabular-nums w-14 text-right flex-shrink-0 hidden sm:block">
                  {row.leads} lead{row.leads !== 1 ? 's' : ''}
                </span>
              </button>
            ))}
          </div>

          {/* Insight analítico */}
          <div className="mt-6 flex items-start gap-2.5 rounded-[12px] border border-line bg-s2/60 px-3.5 py-3">
            <Sparkles size={14} className="text-brand flex-shrink-0 mt-0.5" aria-hidden />
            <p className="text-[13px] text-t2 leading-relaxed">{insight}</p>
          </div>
        </section>
      </div>
    </div>
  )
}

// ─── 2. Indicadores ───────────────────────────────────────────────────────────

type KpiTone = 'revenue' | 'brand' | 'success' | 'neutral' | 'alert'

/*
 * `gold` marca os cards da linha de receita — dinheiro e meta. Operação e
 * alerta ficam sem filete de propósito: se todos tiverem, nenhum destaca.
 */
const KPI_TONE: Record<KpiTone, { value: string; chip: string; icon: string; card: string; gold: boolean }> = {
  revenue: { value: 'text-t1',      chip: 'bg-brand-tint', icon: 'text-brand',   card: 'border-line',       gold: true  },
  brand:   { value: 'text-t1',      chip: 'bg-brand-tint', icon: 'text-brand',   card: 'border-line',       gold: true  },
  success: { value: 'text-success', chip: 'bg-success-bg', icon: 'text-success', card: 'border-line',       gold: true  },
  neutral: { value: 'text-t1',      chip: 'bg-s3',         icon: 'text-t3',      card: 'border-line',       gold: false },
  alert:   { value: 'text-error',   chip: 'bg-error-bg',   icon: 'text-error',   card: 'border-error-line', gold: false },
}

/**
 * Card de indicador com dois portes. `lead` é usado para receita e conversão —
 * número grande, respiro maior. `compact` fica para operação e alerta.
 * A variação é intencional: oito cards idênticos não têm hierarquia nenhuma.
 */
function KpiCard({ title, value, sub, icon: Icon, tone, size = 'compact', onClick, loading }: {
  title: string
  value: string | number
  sub?: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  tone: KpiTone
  size?: 'lead' | 'compact'
  onClick?: () => void
  loading?: boolean
}) {
  const t = KPI_TONE[tone]
  const isLead = size === 'lead'

  if (loading) {
    return (
      <div className={`rounded-[14px] border border-line surface-premium flex flex-col gap-3 ${isLead ? 'p-5' : 'p-4'}`}>
        <ShimmerBlock className="w-24 h-3" />
        <ShimmerBlock className={isLead ? 'w-32 h-8' : 'w-16 h-6'} />
        <ShimmerBlock className="w-20 h-3" />
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${title}: ${value}${sub ? `. ${sub}` : ''}`}
      className={`group relative overflow-hidden text-left rounded-[14px] border surface-premium transition-all duration-200 cursor-pointer
        hover:-translate-y-0.5 hover:shadow-dropdown hover:border-line-strong
        ${t.gold ? 'gold-edge gold-edge-short' : ''}
        ${t.card} ${isLead ? 'p-5' : 'p-4'}`}
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-label text-[11px] font-bold uppercase tracking-[0.1em] text-t3 truncate">{title}</span>
        <span className={`rounded-lg flex items-center justify-center flex-shrink-0 ${t.chip} ${isLead ? 'w-8 h-8' : 'w-7 h-7'}`}>
          <Icon size={isLead ? 15 : 13} className={t.icon} />
        </span>
      </div>
      <p className={`font-heading font-black tabular-nums leading-none tracking-[-0.02em] ${t.value} ${isLead ? 'text-[30px] mt-3.5' : 'text-[22px] mt-2.5'}`}>
        {value}
      </p>
      {sub && (
        <p className="flex items-center gap-1 text-[11px] text-t4 mt-2">
          <span className="truncate">{sub}</span>
          <ArrowRight size={11} className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-auto" aria-hidden />
        </p>
      )}
    </button>
  )
}

// ─── 3. Prioridades de hoje ───────────────────────────────────────────────────

type Severity = 'critical' | 'attention' | 'opportunity'

interface PriorityItem {
  id: string
  severity: Severity
  title: string       // nome do lead ou da tarefa
  reason: string      // por que está aqui
  time: string        // há quanto tempo / para quando
  actionLabel: string
  onAction: () => void
  onOpen: () => void
}

const SEVERITY: Record<Severity, { label: string; text: string; bg: string; bar: string }> = {
  critical:    { label: 'Crítico',      text: 'text-error',   bg: 'bg-error-bg',   bar: 'bg-error'   },
  attention:   { label: 'Atenção',      text: 'text-warning', bg: 'bg-warning-bg', bar: 'bg-warning' },
  opportunity: { label: 'Oportunidade', text: 'text-info',    bg: 'bg-info-bg',    bar: 'bg-info'    },
}

function PriorityFeed({ items, loading, onSeeAll, coldOverflow = 0 }: {
  items: PriorityItem[]
  loading: boolean
  onSeeAll: () => void
  /** Leads frios que não couberam na lista — anunciados, nunca omitidos em silêncio. */
  coldOverflow?: number
}) {
  const [expanded, setExpanded] = useState(false)
  const LIMIT = 6
  const shown = expanded ? items : items.slice(0, LIMIT)

  if (loading) {
    return (
      <div className="rounded-[16px] border border-line bg-surface divide-y divide-line">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4">
            <ShimmerBlock className="w-16 h-5" />
            <div className="flex-1 flex flex-col gap-2">
              <ShimmerBlock className="w-40 h-4" /><ShimmerBlock className="w-56 h-3" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="rounded-[16px] border border-success-line bg-success-bg px-6 py-7 flex items-center gap-4">
        <span className="w-11 h-11 rounded-full bg-success/15 flex items-center justify-center flex-shrink-0">
          <CheckCircle2 size={20} className="text-success" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-t1">Nada exige ação agora</p>
          <p className="text-xs text-t3 mt-1">
            Sem SLA vencido, tarefa atrasada ou lead esquecido. Bom momento para prospectar e alimentar o topo do funil.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-[16px] border border-line surface-premium overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
      <ul className="divide-y divide-line">
        {shown.map(item => {
          const s = SEVERITY[item.severity]
          return (
            <li key={item.id} className="relative">
              <span className={`absolute left-0 inset-y-0 w-[3px] ${s.bar}`} aria-hidden />
              <div className="flex items-center gap-3 sm:gap-4 pl-5 pr-4 py-3.5 hover:bg-s2/50 transition-colors">
                <button
                  onClick={item.onOpen}
                  className="flex-1 min-w-0 text-left cursor-pointer"
                  aria-label={`Abrir ${item.title}. ${item.reason}, ${item.time}`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-label text-[10px] font-bold uppercase tracking-[0.1em] px-1.5 py-0.5 rounded ${s.text} ${s.bg}`}>
                      {s.label}
                    </span>
                    <span className="text-sm font-bold text-t1 truncate">{item.title}</span>
                  </div>
                  <p className="text-xs text-t3 mt-1 truncate">
                    {item.reason} <span className="text-t4">· {item.time}</span>
                  </p>
                </button>
                <button
                  onClick={item.onAction}
                  className="flex-shrink-0 flex items-center gap-1.5 font-heading text-xs font-bold px-3 py-2 rounded-[10px]
                    text-[var(--brand-btn-text)] bg-brand hover:bg-brand-dark transition-colors cursor-pointer active:scale-[0.98]"
                >
                  {item.actionLabel}
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="flex items-center justify-between gap-3 px-5 py-2.5 border-t border-line bg-s2/30">
        {items.length > LIMIT ? (
          <button
            onClick={() => setExpanded(v => !v)}
            aria-expanded={expanded}
            className="text-xs font-semibold text-t3 hover:text-t1 transition-colors cursor-pointer flex items-center gap-1"
          >
            {expanded
              ? <><ChevronUp size={13} /> Mostrar menos</>
              : <><ChevronDown size={13} /> Ver mais {items.length - LIMIT}</>}
          </button>
        ) : <span />}
        <span className="flex items-center gap-3">
          {coldOverflow > 0 && (
            <span className="text-[11px] text-t4 hidden sm:inline">
              +{coldOverflow} lead{coldOverflow !== 1 ? 's' : ''} frio{coldOverflow !== 1 ? 's' : ''} fora da lista
            </span>
          )}
          <button onClick={onSeeAll} className="text-xs font-semibold text-brand hover:text-brand-text transition-colors cursor-pointer flex items-center gap-1">
            Abrir funil <ArrowRight size={12} />
          </button>
        </span>
      </div>
    </div>
  )
}

// ─── 4. Funil de receita ──────────────────────────────────────────────────────

interface StageDetail { vgv: number; parados: number }

/**
 * Funil de receita — duas leituras na mesma tabela, cada uma com a sua base:
 *
 *   COORTE (RPC lead_funnel_analytics): quantos leads já alcançaram a etapa,
 *   a conversão entre etapas e o tempo médio até avançar. Monotônico.
 *
 *   AGORA (overview + store de leads): quantos estão parados na etapa neste
 *   momento, quanto de VGV está ali e quantos passaram de 7 dias sem sair.
 *
 * Misturar as duas produz absurdos — dividir a ocupação de "Followup" pela de
 * "Lead" chega a dar mais de 100%. Por isso a barra e a conversão usam a
 * coorte, e o VGV/parados aparecem em colunas separadas, rotuladas.
 */
function RevenueFunnel({ data, analytics, detail, loading, error, onNavigate }: {
  data: OverviewData | null
  analytics: FunnelAnalytics | null
  detail: Record<string, StageDetail>
  loading: boolean
  error: string | null
  onNavigate: () => void
}) {
  const rows = useMemo(() => {
    if (!data) return []
    const stages = FUNNEL_STAGES.map(stage => ({
      stage,
      theme: STAGE_THEME[stage],
      agora:   data.leadFunnel.find(s => s.stage === stage)?.count ?? 0,
      reached: analytics?.funnel.find(f => f.stage === stage)?.reached ?? null,
      avgDays: analytics?.funnel.find(f => f.stage === stage)?.avgDays ?? null,
    }))
    // A barra usa a coorte quando disponível; sem ela, cai para a ocupação
    // escalada pelo MAIOR valor (nunca pelo primeiro — o topo pode estar vazio).
    const maxAgora = Math.max(...stages.map(s => s.agora), 1)
    const topReached = stages[0]?.reached ?? 0
    return stages.map((s, i) => {
      const prev = i > 0 ? stages[i - 1].reached : null
      const base = s.reached !== null && topReached > 0 ? s.reached / topReached : s.agora / maxAgora
      return {
        ...s,
        widthPct: Math.min(Math.max(base * 100, (s.reached ?? s.agora) > 0 ? 3 : 0), 100),
        conv: s.reached !== null && prev !== null && prev > 0
          ? Math.round((s.reached / prev) * 100)
          : null,
      }
    })
  }, [data, analytics])

  // Gargalo = pior conversão de coorte entre duas etapas. Só ele é destacado.
  const bottleneckIdx = useMemo(() => {
    let idx = -1, worst = Infinity
    rows.forEach((r, i) => { if (r.conv !== null && r.conv < worst) { worst = r.conv; idx = i } })
    return worst < 100 ? idx : -1
  }, [rows])

  const total = data?.leadFunnel.reduce((a, s) => a + s.count, 0) ?? 0
  const hasDetail = Object.keys(detail).length > 0
  const hasCohort = !!analytics

  if (error && !data) {
    return <p className="rounded-[16px] border border-line bg-surface px-5 py-4 text-xs text-error" role="alert">{error}</p>
  }

  if (loading && !data) {
    return (
      <div className="rounded-[16px] border border-line bg-surface p-5 flex flex-col gap-3">
        {Array.from({ length: 6 }).map((_, i) => <ShimmerBlock key={i} className="w-full h-9" />)}
      </div>
    )
  }

  if (data && total === 0) {
    return (
      <div className="rounded-[16px] border border-line bg-surface flex flex-col items-center py-12 gap-2">
        <Users size={26} className="text-t4" aria-hidden />
        <p className="text-sm text-t3">Nenhum lead no funil ainda</p>
        <button onClick={onNavigate} className="text-xs font-semibold text-brand hover:text-brand-text transition-colors cursor-pointer mt-1">
          Cadastrar o primeiro lead →
        </button>
      </div>
    )
  }

  const bottleneck = bottleneckIdx > 0 ? rows[bottleneckIdx] : null

  return (
    <div className="rounded-[16px] border border-line surface-premium overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
      {/* Leitura do gargalo — a decisão que a tela quer provocar */}
      {bottleneck && (
        <div className="flex items-start gap-2.5 px-5 py-3 border-b border-line bg-warning-bg/40">
          <AlertTriangle size={14} className="text-warning flex-shrink-0 mt-0.5" aria-hidden />
          <p className="text-[13px] text-t2 leading-relaxed">
            Maior gargalo entre <span className="font-semibold text-t1">{rows[bottleneckIdx - 1].theme.label}</span> e{' '}
            <span className="font-semibold text-t1">{bottleneck.theme.label}</span>: apenas{' '}
            <span className="font-bold text-warning tabular-nums">{bottleneck.conv}%</span> dos leads avançam.
          </p>
        </div>
      )}

      {/* Cabeçalho de colunas */}
      <div className="hidden md:flex items-center gap-3 px-5 pt-3.5 pb-1.5">
        <span className="w-28 flex-shrink-0" />
        <span className="flex-1" />
        {hasCohort && (
          <span className="font-label text-[10px] font-bold uppercase tracking-[0.1em] text-t4 w-20 text-right flex-shrink-0" title="Leads que já alcançaram esta etapa">
            Alcançaram
          </span>
        )}
        <span className="font-label text-[10px] font-bold uppercase tracking-[0.1em] text-t4 w-16 text-right flex-shrink-0" title="Leads parados nesta etapa agora">Agora</span>
        {hasDetail && (
          <span className="font-label text-[10px] font-bold uppercase tracking-[0.1em] text-t4 w-20 text-right flex-shrink-0">VGV</span>
        )}
        {hasCohort && (
          <span className="font-label text-[10px] font-bold uppercase tracking-[0.1em] text-t4 w-14 text-right flex-shrink-0" title="Tempo médio até avançar">Médio</span>
        )}
        {hasDetail && (
          <span className="font-label text-[10px] font-bold uppercase tracking-[0.1em] text-t4 w-16 text-right flex-shrink-0" title="Parados há mais de 7 dias">Parados</span>
        )}
      </div>

      <div className="px-5 pb-5">
        {rows.map((r, i) => {
          const d = detail[r.stage]
          const isBottleneck = i === bottleneckIdx
          return (
            <div key={r.stage}>
              {r.conv !== null && (
                <div className="flex items-center gap-2 pl-[7.5rem] py-1">
                  <ArrowDown size={11} className={isBottleneck ? 'text-warning' : 'text-t5'} aria-hidden />
                  <span className={`text-[11px] font-bold tabular-nums ${isBottleneck ? 'text-warning' : 'text-t4'}`}>
                    {r.conv}%
                  </span>
                  {isBottleneck && (
                    <span className="font-label text-[10px] font-bold uppercase tracking-[0.1em] text-warning bg-warning-bg border border-warning-line px-1.5 py-px rounded-full">
                      gargalo
                    </span>
                  )}
                </div>
              )}

              <button
                onClick={onNavigate}
                className="w-full flex items-center gap-3 py-1.5 text-left cursor-pointer group"
                aria-label={
                  `${r.theme.label}: ${r.reached !== null ? `${r.reached} alcançaram, ` : ''}${r.agora} em aberto agora` +
                  `${d ? `, ${formatCurrency(d.vgv)} em VGV, ${d.parados} parados` : ''}`
                }
              >
                <span className="flex items-center gap-2 w-28 flex-shrink-0 min-w-0">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${r.theme.dot}`} aria-hidden />
                  <span className="text-sm font-semibold text-t2 truncate group-hover:text-t1 transition-colors">{r.theme.label}</span>
                </span>

                <span className="flex-1 h-8 rounded-[8px] bg-s3/40 overflow-hidden min-w-0">
                  <span
                    className={`block h-full rounded-[8px] ${r.theme.dot} opacity-85 transition-all duration-700`}
                    style={{ width: `${r.widthPct}%` }}
                  />
                </span>

                {hasCohort && (
                  <span className="text-sm font-bold text-t1 tabular-nums w-20 text-right flex-shrink-0 hidden md:block">
                    {r.reached !== null ? r.reached.toLocaleString('pt-BR') : '—'}
                  </span>
                )}

                <span className="text-sm font-semibold text-t2 tabular-nums w-16 text-right flex-shrink-0">
                  {r.agora.toLocaleString('pt-BR')}
                </span>

                {hasDetail && (
                  <span className="text-xs text-t2 tabular-nums w-20 text-right flex-shrink-0 hidden md:block">
                    {d && d.vgv > 0 ? formatCurrency(d.vgv) : '—'}
                  </span>
                )}
                {hasCohort && (
                  <span className="text-xs text-t4 tabular-nums w-14 text-right flex-shrink-0 hidden md:block">
                    {r.avgDays !== null && r.avgDays > 0 ? `${Math.round(r.avgDays)}d` : '—'}
                  </span>
                )}
                {hasDetail && (
                  <span
                    className={`text-xs tabular-nums w-16 text-right flex-shrink-0 hidden md:block ${d && d.parados > 0 ? 'text-warning font-semibold' : 'text-t4'}`}
                    title={d && d.parados > 0 ? `${d.parados} lead(s) há mais de 7 dias parados nesta etapa` : undefined}
                  >
                    {d && d.parados > 0 ? d.parados : '—'}
                  </span>
                )}
              </button>
            </div>
          )
        })}
      </div>

      <p className="px-5 pb-4 text-[11px] text-t4 leading-relaxed">
        <span className="font-semibold text-t3">Alcançaram</span> e <span className="font-semibold text-t3">conversão</span> usam a
        coorte (profundidade máxima já atingida pelo lead). <span className="font-semibold text-t3">Agora</span>, VGV e parados
        descrevem quem está na etapa neste momento.
      </p>
    </div>
  )
}

// ─── 5. Evolução de receita ───────────────────────────────────────────────────

interface WeekPoint { label: string; realizado: number; acumulado: number; metaAcum: number }

/**
 * VGV por semana × meta acumulada.
 *
 * Desenhado à mão em SVG de propósito: o Dashboard é a rota "/" e importar
 * recharts aqui traria ~110 kB gzip para a abertura do app — exatamente a
 * regressão que a otimização de carga do Dashboard resolveu. O gráfico é
 * simples o bastante para não justificar a biblioteca.
 *
 * Semana = domingo → sábado (convenção do sistema).
 */
function RevenueTrend({ points, target, loading }: {
  points: WeekPoint[]
  target: number
  loading: boolean
}) {
  if (loading) {
    return <div className="rounded-[16px] border border-line bg-surface p-5"><ShimmerBlock className="w-full h-48" /></div>
  }

  const totalRealizado = points.reduce((a, p) => a + p.realizado, 0)
  if (points.length === 0 || (totalRealizado === 0 && target === 0)) {
    return (
      <div className="rounded-[16px] border border-line bg-surface flex flex-col items-center py-12 gap-2">
        <BarChart3 size={26} className="text-t4" aria-hidden />
        <p className="text-sm text-t3">Sem vendas registradas neste mês ainda</p>
      </div>
    )
  }

  const W = 720, H = 200, padL = 8, padR = 8, padT = 16, padB = 28
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const scaleMax = Math.max(target, ...points.map(p => Math.max(p.acumulado, p.metaAcum)), 1)
  const bandW = innerW / points.length
  const barW  = Math.min(bandW * 0.42, 46)

  const y  = (v: number) => padT + innerH - (v / scaleMax) * innerH
  const cx = (i: number) => padL + bandW * i + bandW / 2

  const metaPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${cx(i)},${y(p.metaAcum)}`).join(' ')
  const acumPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${cx(i)},${y(p.acumulado)}`).join(' ')

  return (
    <div className="rounded-[16px] border border-line surface-premium overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
      <div className="flex items-center gap-4 px-5 pt-4 pb-1 flex-wrap">
        <span className="flex items-center gap-1.5 text-[11px] text-t3">
          <span className="w-2.5 h-2.5 rounded-sm bg-brand flex-shrink-0" aria-hidden /> VGV da semana
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-t3">
          <span className="w-4 h-0.5 rounded bg-success flex-shrink-0" aria-hidden /> Acumulado
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-t3">
          <span className="w-4 h-0.5 rounded flex-shrink-0" style={{ background: 'var(--t3)' }} aria-hidden /> Meta acumulada
        </span>
        <span className="ml-auto text-[11px] text-t4">Ritmo linear · semana de domingo a sábado</span>
      </div>

      <div className="px-3 pb-4">
        <svg
          viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
          aria-label={
            'Evolução do VGV por semana. ' +
            points.map(p => `${p.label}: ${formatCurrency(p.realizado)}, acumulado ${formatCurrency(p.acumulado)}`).join('. ')
          }
        >
          <defs>
            <linearGradient id="rtBar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="var(--brand)"      stopOpacity="0.95" />
              <stop offset="100%" stopColor="var(--brand-dark)" stopOpacity="0.55" />
            </linearGradient>
          </defs>

          {[0.25, 0.5, 0.75, 1].map(f => (
            <line key={f} x1={padL} x2={W - padR} y1={y(scaleMax * f)} y2={y(scaleMax * f)}
              stroke="var(--line)" strokeWidth="1" strokeDasharray="3 5" />
          ))}

          {points.map((p, i) => {
            const h = p.realizado > 0 ? Math.max(innerH - (y(p.realizado) - padT), 3) : 0
            return h > 0 ? (
              <rect key={p.label} x={cx(i) - barW / 2} y={padT + innerH - h}
                width={barW} height={h} rx="4" fill="url(#rtBar)" />
            ) : null
          })}

          <path d={metaPath} fill="none" stroke="var(--t3)" strokeWidth="1.5" strokeDasharray="5 4" />
          <path d={acumPath} fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((p, i) => (
            <circle key={p.label} cx={cx(i)} cy={y(p.acumulado)} r="3.5"
              fill="var(--success)" stroke="var(--surface)" strokeWidth="2" />
          ))}

          {points.map((p, i) => (
            <text key={p.label} x={cx(i)} y={H - 8} textAnchor="middle"
              className="fill-t4" fontSize="11" fontWeight="600" fontFamily="inherit">
              {p.label}
            </text>
          ))}
        </svg>
      </div>
    </div>
  )
}

// ─── Helpers de data ──────────────────────────────────────────────────────────

function daysOverdue(dueDate: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.floor((today.getTime() - new Date(dueDate + 'T00:00:00').getTime()) / 86_400_000)
}

/** Semana começa no domingo — convenção do sistema (ver GoalsPage). */
function startOfWeek(d: Date): Date {
  const x = new Date(d); x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() - x.getDay())
  return x
}

function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ═══ Dashboard ════════════════════════════════════════════════════════════════

export function DashboardPage() {
  const navigate = useNavigate()
  const [taskFormOpen,    setTaskFormOpen]    = useState(false)
  const [selectedLead,    setSelectedLead]    = useState<Lead | null>(null)
  const [overviewData,    setOverviewData]    = useState<OverviewData | null>(null)
  const [analytics,       setAnalytics]       = useState<FunnelAnalytics | null>(null)
  const [extras,          setExtras]          = useState<ExtrasData | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [overviewError,   setOverviewError]   = useState<string | null>(null)

  const { profile } = useAuthStore()
  const { effectiveBrokerId, isGlobalView } = useAdminView()
  const firstName = profile?.name?.split(' ')[0] ?? 'Corretor'

  const { sales, load: loadSales }                    = useSalesStore()
  const { tasks, load: loadTasks }                    = useTasksStore()
  const { leads, load: loadMyLeads, advanceFollowup } = useLeadsStore()
  const { add: addInteraction }                       = useLeadInteractionsStore()

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

  async function loadExtras() {
    const { data, error } = await supabase.rpc('dashboard_extras', { p_broker_id: effectiveBrokerId })
    if (error) {
      // Não derruba a tela: os widgets que dependem disso não renderizam.
      console.error('[dashboard] extras:', error)
      return
    }
    setExtras(data as ExtrasData)
  }

  // Coorte do funil — base correta para conversão e tempo médio por etapa.
  // Mesma RPC da aba Conversão em Leads, sem filtro de período (funil inteiro).
  async function loadAnalytics() {
    const { data, error } = await supabase.rpc('lead_funnel_analytics', {
      p_broker_id: effectiveBrokerId, p_start: null, p_end: null,
    })
    if (error) {
      // O funil degrada para a leitura de ocupação — sem conversão inventada.
      console.error('[dashboard] funnel analytics:', error)
      setAnalytics(null)
      return
    }
    setAnalytics(data as FunnelAnalytics)
  }

  useEffect(() => {
    loadSales(); loadTasks(); loadMyLeads()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadOverview()
    loadExtras()
    loadAnalytics()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveBrokerId])

  // Escopo da visão para o que é lido de stores no cliente.
  const inView = <T extends { brokerId?: string | null }>(arr: T[]) =>
    isGlobalView ? arr : arr.filter(x => x.brokerId === effectiveBrokerId)
  const inViewTasks = (arr: Task[]) =>
    isGlobalView ? arr : arr.filter(t => (t.assignedToId ?? t.brokerId) === effectiveBrokerId)

  const todayStr = localISO(new Date())

  const activeLeads = useMemo(
    () => inView(leads.filter(l => !l.discardReason && !l.closedAt)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leads, effectiveBrokerId, isGlobalView]
  )

  // ── Ocupação por etapa: VGV parado e leads envelhecendo ────────────────────
  // O tempo médio NÃO sai daqui — "há quanto tempo os que ficaram estão presos"
  // não é a mesma coisa que "quanto tempo leva para avançar". O segundo vem da
  // coorte (analytics.avgDays); usar o primeiro no lugar dele inflaria o número
  // com justamente os leads que nunca avançaram.
  const funnelDetail = useMemo(() => {
    const STALE_DAYS = 7
    const acc: Record<string, StageDetail> = {}
    activeLeads.forEach(l => {
      const d = acc[l.funnelStage] ?? { vgv: 0, parados: 0 }
      d.vgv += l.averageTicket ?? 0
      const ref = l.stageChangedAt ?? l.createdAt
      if (ref && (Date.now() - new Date(ref).getTime()) / 86_400_000 > STALE_DAYS) d.parados += 1
      acc[l.funnelStage] = d
    })
    return acc
  }, [activeLeads])

  // ── Prioridades de hoje ────────────────────────────────────────────────────
  async function registrarContato(lead: Lead) {
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

  const priorityItems = useMemo<PriorityItem[]>(() => {
    const out: PriorityItem[] = []
    const nowMs = Date.now()
    const byId = new Map(leads.map(l => [l.id, l]))

    // 1. SLA de 1º contato — estourado ou vencendo
    activeLeads
      .filter(l => l.slaDueAt && !l.firstContactAt)
      .forEach(l => {
        const diffMin = Math.round((new Date(l.slaDueAt!).getTime() - nowMs) / 60_000)
        if (diffMin < 0) {
          const atraso = Math.abs(diffMin)
          out.push({
            id: `sla-${l.id}`, severity: 'critical', title: l.name,
            reason: 'SLA de primeiro contato estourado',
            time: atraso >= 60 ? `${Math.round(atraso / 60)}h em atraso` : `${atraso} min em atraso`,
            actionLabel: 'WhatsApp', onAction: () => registrarContato(l), onOpen: () => setSelectedLead(l),
          })
        } else if (diffMin <= 120) {
          out.push({
            id: `sla-${l.id}`, severity: 'attention', title: l.name,
            reason: 'SLA de primeiro contato vencendo',
            time: `vence em ${diffMin} min`,
            actionLabel: 'WhatsApp', onAction: () => registrarContato(l), onOpen: () => setSelectedLead(l),
          })
        }
      })

    // 2. Tarefas vencidas
    inViewTasks(tasks.filter(t => t.status !== 'done' && t.dueDate && t.dueDate < todayStr))
      .forEach(t => {
        const d = daysOverdue(t.dueDate!)
        out.push({
          id: `task-${t.id}`, severity: 'critical', title: t.title,
          reason: 'Tarefa vencida',
          time: d === 1 ? '1 dia de atraso' : `${d} dias de atraso`,
          actionLabel: 'Resolver', onAction: () => navigate('/tarefas'), onOpen: () => navigate('/tarefas'),
        })
      })

    // 3. Visitas e tarefas de hoje
    inViewTasks(tasks.filter(t => t.status !== 'done' && t.dueDate === todayStr))
      .forEach(t => {
        out.push({
          id: `today-${t.id}`, severity: 'attention', title: t.title,
          reason: t.category === 'visita' ? 'Visita agendada para hoje' : 'Tarefa com prazo hoje',
          time: t.dueTime ? `hoje às ${t.dueTime}` : 'hoje',
          actionLabel: 'Abrir', onAction: () => navigate('/tarefas'), onOpen: () => navigate('/tarefas'),
        })
      })

    // 4. Proposta parada — oportunidade madura esfriando
    activeLeads
      .filter(l => l.funnelStage === 'proposta' && l.stageChangedAt)
      .forEach(l => {
        const dias = Math.floor((nowMs - new Date(l.stageChangedAt!).getTime()) / 86_400_000)
        if (dias >= 5) {
          out.push({
            id: `prop-${l.id}`, severity: 'attention', title: l.name,
            reason: 'Proposta sem retorno',
            time: `${dias} dias na etapa`,
            actionLabel: 'WhatsApp', onAction: () => registrarContato(l), onOpen: () => setSelectedLead(l),
          })
        }
      })

    // 5. Leads esquecidos — lista agregada pela RPC, cruzada com o store.
    //
    // Limitado aos mais frios: a base tem dezenas de leads sem contato há meses
    // e despejar todos aqui transformaria a lista de prioridades num relatório.
    // O corte é explícito na tela (COLD_LIMIT + link para o funil), nunca uma
    // truncagem silenciosa.
    const jaListados = new Set(out.map(o => o.id.split('-').slice(1).join('-')))
    const frios = (extras?.leadsSemContato ?? [])
      .filter(({ leadId }) => byId.has(leadId) && !jaListados.has(leadId))
      .sort((a, b) => b.dias - a.dias)
      .slice(0, COLD_LIMIT)

    frios.forEach(({ leadId, dias }) => {
      const l = byId.get(leadId)!
      out.push({
        id: `cold-${l.id}`, severity: 'opportunity', title: l.name,
        reason: `Sem contato · etapa ${STAGE_THEME[l.funnelStage]?.label ?? l.funnelStage}`,
        time: `${Math.floor(dias)} dias sem interação`,
        actionLabel: 'WhatsApp', onAction: () => registrarContato(l), onOpen: () => setSelectedLead(l),
      })
    })

    const rank: Record<Severity, number> = { critical: 0, attention: 1, opportunity: 2 }
    return out.sort((a, b) => rank[a.severity] - rank[b.severity])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLeads, tasks, extras, leads, todayStr, effectiveBrokerId, isGlobalView])

  // Quantos leads frios ficaram de fora da lista de prioridades.
  const coldOverflow = Math.max(
    (extras?.leadsSemContato?.length ?? 0) - COLD_LIMIT, 0
  )

  // ── Evolução semanal de VGV ────────────────────────────────────────────────
  const weeklyTrend = useMemo<WeekPoint[]>(() => {
    const target = overviewData?.vgl.target ?? 0
    const now = new Date()
    const monthStartD = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEndD   = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const daysInMonth = monthEndD.getDate()

    // Semanas do mês, ancoradas em domingo (convenção do sistema).
    const weeks: Array<{ start: Date; end: Date }> = []
    let cursor = startOfWeek(monthStartD)
    while (cursor <= monthEndD) {
      const end = new Date(cursor); end.setDate(end.getDate() + 6)
      weeks.push({ start: new Date(cursor), end })
      cursor = new Date(cursor); cursor.setDate(cursor.getDate() + 7)
    }

    const monthSales = inView(
      sales.filter(s => s.date >= localISO(monthStartD) && s.date <= localISO(monthEndD))
    )

    let acumulado = 0
    return weeks.map((w, i) => {
      const wStart = localISO(w.start), wEnd = localISO(w.end)
      const realizado = monthSales
        .filter(s => s.date >= wStart && s.date <= wEnd)
        .reduce((a, s) => a + s.value, 0)
      acumulado += realizado
      // Meta acumulada = ritmo linear até o último dia da semana que cai no mês.
      const lastDayInMonth = w.end > monthEndD ? daysInMonth : w.end.getDate()
      return {
        label: `S${i + 1}`,
        realizado,
        acumulado,
        metaAcum: target * (lastDayInMonth / daysInMonth),
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sales, overviewData, effectiveBrokerId, isGlobalView])

  // ── Indicadores ────────────────────────────────────────────────────────────
  const nowMonth   = new Date()
  const monthStart = localISO(new Date(nowMonth.getFullYear(), nowMonth.getMonth(), 1))
  const monthEndS  = localISO(new Date(nowMonth.getFullYear(), nowMonth.getMonth() + 1, 0))
  const salesMonth = inView(sales.filter(s => s.date >= monthStart && s.date <= monthEndS))
  const comissaoRealizada = salesMonth.reduce((a, s) => a + calcSaleCommissions(s).totalCommission, 0)
  const comissaoPrevista  = (overviewData?.vgl.expectativa ?? 0) * PIPELINE_COMMISSION_RATE
  const visitasAgendadas  = inViewTasks(tasks.filter(t => t.category === 'visita' && t.status !== 'done')).length

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Bom dia'
    if (h < 18) return 'Boa tarde'
    return 'Boa noite'
  }
  const todayFormatted = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
  const kpiLoading = overviewLoading && !overviewData

  return (
    <PageLayout
      title={`${greeting()}, ${firstName}`}
      subtitle={todayFormatted.charAt(0).toUpperCase() + todayFormatted.slice(1)}
      ctaLabel="Nova Tarefa"
      onCta={() => setTaskFormOpen(true)}
    >
      {/* ══ 1. Hero executivo ═══════════════════════════════════════════ */}
      <div className="mb-8">
        <CommandHero
          data={overviewData}
          loading={overviewLoading}
          error={overviewError}
          onRetry={loadOverview}
          onNavigateVendas={() => navigate('/vendas')}
          onNavigateLeads={() => navigate('/leads')}
        />
      </div>

      {/* ══ 2. Indicadores ══════════════════════════════════════════════ */}
      <SectionLabel hint="Mês corrente">Indicadores</SectionLabel>

      {/* Receita — protagonismo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <KpiCard
          title="Vendas no mês" size="lead" tone="success" icon={TrendingUp}
          value={overviewData?.vgl.vendasMes ?? '—'}
          sub={overviewData ? formatCurrency(overviewData.vgl.realizadoMes) : undefined}
          onClick={() => navigate('/vendas')} loading={kpiLoading}
        />
        <KpiCard
          title="Comissão realizada" size="lead" tone="success" icon={Wallet}
          value={formatCurrency(comissaoRealizada)}
          sub={`${salesMonth.length} venda${salesMonth.length !== 1 ? 's' : ''} no mês`}
          onClick={() => navigate('/vendas')} loading={kpiLoading}
        />
        <KpiCard
          title="Comissão prevista" size="lead" tone="revenue" icon={DollarSign}
          value={formatCurrency(comissaoPrevista)}
          sub="estimada em 2% do pipeline"
          onClick={() => navigate('/leads')} loading={kpiLoading}
        />
        <KpiCard
          title="Propostas abertas" size="lead" tone="brand" icon={FileText}
          value={overviewData?.vgl.leadsProposta ?? '—'}
          sub={overviewData ? formatCurrency(overviewData.vgl.expectativaProposta) : undefined}
          onClick={() => navigate('/leads')} loading={kpiLoading}
        />
      </div>

      {/* Operação e alerta — discretos ou urgentes */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <KpiCard
          title="Leads ativos" tone="neutral" icon={Users}
          value={overviewData?.leadsAtivos ?? '—'} sub="em aberto no funil"
          onClick={() => navigate('/leads')} loading={kpiLoading}
        />
        <KpiCard
          title="Visitas agendadas" tone="neutral" icon={CalendarCheck}
          value={visitasAgendadas} sub="tarefas de visita em aberto"
          onClick={() => navigate('/tarefas')} loading={kpiLoading}
        />
        <KpiCard
          title="SLA estourado" icon={Flame}
          tone={overviewData && overviewData.alertas.slaEstourado > 0 ? 'alert' : 'neutral'}
          value={overviewData?.alertas.slaEstourado ?? '—'} sub="sem 1º contato no prazo"
          onClick={() => navigate('/leads')} loading={kpiLoading}
        />
        <KpiCard
          title="Tarefas vencidas" icon={Siren}
          tone={overviewData && overviewData.alertas.tarefasEmAtraso > 0 ? 'alert' : 'neutral'}
          value={overviewData?.alertas.tarefasEmAtraso ?? '—'} sub="passaram do prazo"
          onClick={() => navigate('/tarefas')} loading={kpiLoading}
        />
      </div>

      {/* ══ 3. Prioridades de hoje ══════════════════════════════════════ */}
      <SectionLabel hint={priorityItems.length > 0 ? `${priorityItems.length} item${priorityItems.length !== 1 ? 's' : ''} exigindo ação` : undefined}>
        Prioridades de hoje
      </SectionLabel>
      <div className="mb-8">
        <PriorityFeed items={priorityItems} loading={kpiLoading} coldOverflow={coldOverflow} onSeeAll={() => navigate('/leads')} />
      </div>

      {/* ══ 4. Funil de receita ═════════════════════════════════════════ */}
      <SectionLabel hint="Volume, receita e tempo por etapa">Funil de receita</SectionLabel>
      <div className="mb-8">
        <RevenueFunnel
          data={overviewData} analytics={analytics} detail={funnelDetail}
          loading={overviewLoading} error={overviewError}
          onNavigate={() => navigate('/leads')}
        />
      </div>

      {/* ══ 5. Evolução de receita ══════════════════════════════════════ */}
      <SectionLabel hint="VGV por semana contra a meta acumulada">Evolução de receita</SectionLabel>
      <div className="mb-8">
        <RevenueTrend points={weeklyTrend} target={overviewData?.vgl.target ?? 0} loading={kpiLoading} />
      </div>

      {/* Modais */}
      <TaskForm isOpen={taskFormOpen} onClose={() => setTaskFormOpen(false)} />
      {selectedLead && <LeadModal lead={selectedLead} onClose={() => setSelectedLead(null)} />}
    </PageLayout>
  )
}
