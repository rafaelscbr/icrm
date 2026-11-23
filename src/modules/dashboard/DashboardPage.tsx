import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, AlertTriangle, RefreshCw, Info, LayoutDashboard } from 'lucide-react'
import { Task, calcSaleCommissions } from '../../types'
import { TaskForm } from '../tasks/TaskForm'
import { PageLayout } from '../../components/layout/PageLayout'
import { FaixaNumeros } from '../../components/shared/visual'
import { FunisComerciais } from './FunisComerciais'
import { useSalesStore } from '../../store/useSalesStore'
import { useTasksStore } from '../../store/useTasksStore'
import { useLeadsStore } from '../../store/useLeadsStore'
import { useAdminView } from '../../hooks/useAdminView'
import { useAuthStore } from '../../store/useAuthStore'
import { formatCurrency, formatCurrencyFull } from '../../lib/formatters'
import { supabase } from '../../lib/supabase'

/* ═══════════════════════════════════════════════════════════════════════════
   SOUZA COMMAND CENTER
   Inteligência comercial para transformar meta em vendas.

   Hierarquia da tela, de cima para baixo:
     1. Hero        — Meta de VGV × Previsão de VGV (o coração da tela)
     2. Indicadores — receita em protagonismo, operação discreta, alerta urgente
     3. Funil       — geral, por produto e por corretor: conversão, VGV em
                      andamento e vendido, comissão (FunisComerciais.tsx)

   Próxima ação, Prioridades de hoje e Evolução da receita saíram em
   23/11/2026 (pedido do Rafael): a dashboard termina no funil.

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

/** Comissão bruta estimada sobre a previsão (visita + proposta) — 5%, a regra da casa (comissao.ts). */
const PIPELINE_COMMISSION_RATE = 0.05

// ─── Primitivas ───────────────────────────────────────────────────────────────

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
      className="pointer-events-none absolute inset-x-0 bottom-0 -z-[1] h-24 w-full opacity-80"
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

function healthOf(coverage: number, metaBatida = false): Health {
  // Meta já batida manda: "pipeline insuficiente" em vermelho ao lado de
  // "236% da meta" era a tela se contradizendo.
  if (metaBatida)      return { label: 'Meta batida',           cls: 'text-success bg-success-bg border-success-line', dot: 'bg-success' }
  if (coverage >= 1)   return { label: 'Meta coberta',          cls: 'text-success bg-success-bg border-success-line', dot: 'bg-success' }
  if (coverage >= 0.6) return { label: 'Em construção',         cls: 'text-brand-text bg-brand-tint border-brand/30',  dot: 'bg-brand'   }
  return                      { label: 'Pipeline insuficiente', cls: 'text-error bg-error-bg border-error-line',       dot: 'bg-error'   }
}

/**
 * Meta e previsão de VGV — v6: dois blocos do mosaico em vez de um cartão
 * dividido ao meio. A meta é o bloco-herói azul (o maior da tela); a previsão
 * é um bloco comum ao lado. Quem posiciona é o grid da página (`metaClass`,
 * `previsaoClass`).
 */
function CommandHero({ data, loading, error, onRetry, onNavigateVendas, onNavigateLeads, metaClass = '', previsaoClass = '' }: {
  metaClass?: string
  previsaoClass?: string
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
  const metaBatida = target > 0 && realizado >= target
  const health   = healthOf(coverage, metaBatida)
  const noRitmo  = pct >= paceFrac

  // Ticket médio só existe se houve venda no mês — sem venda, não estimamos.
  const ticketMedio    = vendasMes > 0 ? realizado / vendasMes : null
  const vendasParaMeta = ticketMedio && falta > 0 ? Math.ceil(falta / ticketMedio) : null

  const insight = metaBatida
    ? previsao > 0
      ? `A meta do mês já foi batida. Os ${formatCurrency(previsao)} em visita e proposta são o que ainda pode somar além dela.`
      : 'A meta do mês já foi batida. Não há VGV em visita ou proposta agora — bom momento para abastecer o funil do próximo mês.'
    : coverage >= 1
    ? `A previsão cobre ${Math.round(coverage * 100)}% da meta. O pipeline maduro já é suficiente — o foco agora é fechar o que está em negociação.`
    : `A previsão cobre ${Math.round(coverage * 100)}% da meta. Para fechar o gap, a operação precisa converter ${formatCurrency(gapPrev)} em novas visitas ou propostas.`

  if (error && !data) {
    return (
      <div className={`rounded-[22px] border border-error-line bg-error-bg px-6 py-6 flex items-center gap-3 ${metaClass}`}>
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
      <>
        <div className={`hero-tile p-8 flex flex-col gap-4 min-h-[280px] ${metaClass}`}>
          <ShimmerBlock className="w-40 h-3" /><ShimmerBlock className="w-72 h-14" />
          <ShimmerBlock className="w-full h-3" /><ShimmerBlock className="w-52 h-4" />
        </div>
        <div className={`bento p-6 flex flex-col gap-4 ${previsaoClass}`}>
          <ShimmerBlock className="w-40 h-3" /><ShimmerBlock className="w-56 h-10" />
          <ShimmerBlock className="w-full h-16" />
        </div>
      </>
    )
  }

  if (!data) return null

  return (
    <>
        {/* ── Meta de VGV ──────────────────────────────────────────────── */}
        <section className={`hero-tile p-6 lg:p-8 flex flex-col ${metaClass}`} aria-label="Meta de VGV do mês">
          <HorizonCurve />
          <div className="flex items-center gap-2 mb-5">
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

          <p className="font-display text-[clamp(2.25rem,4vw,3.25rem)] font-extrabold text-t1 tabular-nums leading-[0.95] tracking-[-0.03em]">
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
                  background: 'linear-gradient(90deg, var(--brand-fill-deep), var(--brand-fill) 70%, var(--brand-fill-hover))',
                  boxShadow: '0 0 16px rgba(214,178,110,0.35)',
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
          <div className="mt-auto pt-6 flex flex-wrap items-stretch gap-x-8 gap-y-4">
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
        <section className={`bento relative p-6 ${previsaoClass}`} aria-label="Previsão de VGV">
          <div className="flex items-center gap-2 mb-5 flex-wrap">
                        <h3 className="font-label text-[11px] font-bold uppercase tracking-[0.16em] text-t3">Previsão de VGV</h3>
            <InfoHint text="Previsão = VGV somado apenas das etapas Visita e Proposta. Etapas de topo (Lead, Follow-up, Atendimento) não entram: são volume, não oportunidade madura." />
            <span className={`ml-auto flex items-center gap-1.5 font-label text-[11px] font-bold uppercase tracking-[0.08em] px-2.5 py-1 rounded-full border ${health.cls}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${health.dot}`} aria-hidden />
              {health.label}
            </span>
          </div>

          <p className="font-display text-[clamp(2rem,3.4vw,2.6rem)] font-extrabold text-t1 tabular-nums leading-[0.95] tracking-[-0.02em]">
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
    </>
  )
}

// ─── Helpers de data ──────────────────────────────────────────────────────────

function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ═══ Dashboard ════════════════════════════════════════════════════════════════

export function DashboardPage() {
  const navigate = useNavigate()
  const [taskFormOpen,    setTaskFormOpen]    = useState(false)
  const [overviewData,    setOverviewData]    = useState<OverviewData | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [overviewError,   setOverviewError]   = useState<string | null>(null)

  const { profile, isAdmin } = useAuthStore()
  const { effectiveBrokerId, isGlobalView } = useAdminView()
  const firstName = profile?.name?.split(' ')[0] ?? 'Corretor'

  const { sales, load: loadSales }                    = useSalesStore()
  const { tasks, load: loadTasks }                    = useTasksStore()
  const { leads, load: loadMyLeads }                  = useLeadsStore()

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

  useEffect(() => {
    loadSales(); loadTasks(); loadMyLeads()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadOverview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveBrokerId])

  // Escopo da visão para o que é lido de stores no cliente.
  const inView = <T extends { brokerId?: string | null }>(arr: T[]) =>
    isGlobalView ? arr : arr.filter(x => x.brokerId === effectiveBrokerId)
  const inViewTasks = (arr: Task[]) =>
    isGlobalView ? arr : arr.filter(t => (t.assignedToId ?? t.brokerId) === effectiveBrokerId)

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
      icon={LayoutDashboard}
      iconTom="marca"
      title={`${greeting()}, *${firstName}*`}
      subtitle={todayFormatted.charAt(0).toUpperCase() + todayFormatted.slice(1)}
      ctaLabel="Nova Tarefa"
      onCta={() => setTaskFormOpen(true)}
    >
      {/* ══ Meta e previsão (v10) ═══════════════════════════════════════
          Lado a lado, na mesma altura. Os indicadores são uma faixa de quatro
          números logo abaixo. */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-4">
        <CommandHero
          data={overviewData}
          loading={overviewLoading}
          error={overviewError}
          onRetry={loadOverview}
          onNavigateVendas={() => navigate('/vendas')}
          onNavigateLeads={() => navigate('/leads')}
          metaClass="lg:col-span-7"
          previsaoClass="lg:col-span-5"
        />
      </div>

      {kpiLoading ? (
        <div className="h-[84px] rounded-[22px] shimmer mb-4" aria-hidden />
      ) : (
        // Uma faixa, quatro números (16/11/2026). Eram oito em duas faixas, e
        // metade repetia o que já está na tela:
        //   · "Vendas no mês" e "Propostas abertas" estão nos dois cartões acima
        //     (meta e previsão), com o mesmo valor;
        //   · "SLA estourado" e "Tarefas vencidas" são exceção, não indicador
        //     (desde 23/11/2026 ficam no Kanban, em Tarefas e nos avisos).
        <FaixaNumeros
          className="mb-10"
          itens={[
            { rotulo: 'Comissão realizada', valor: formatCurrency(comissaoRealizada), nota: 'vendas do mês',
              tom: comissaoRealizada > 0 ? 'text-success' : 'text-t1', onClick: () => navigate('/vendas') },
            { rotulo: 'Comissão prevista', valor: formatCurrency(comissaoPrevista), nota: '5% de visita + proposta', onClick: () => navigate('/leads') },
            { rotulo: 'Leads ativos', valor: overviewData?.leadsAtivos ?? '—', nota: 'em aberto no funil', onClick: () => navigate('/leads') },
            { rotulo: 'Visitas agendadas', valor: visitasAgendadas, nota: 'tarefas de visita em aberto', onClick: () => navigate('/tarefas') },
          ]}
        />
      )}

      {/* ══ Funil comercial — geral, por produto e por corretor (23/11/2026) ══
          Logo abaixo da meta: de onde vem o que falta. */}
      <FunisComerciais
        leads={leads}
        sales={sales}
        corretor={isGlobalView ? null : (effectiveBrokerId ?? null)}
        mostrarCorretores={isGlobalView && isAdmin}
      />

      {/* Modais */}
      <TaskForm isOpen={taskFormOpen} onClose={() => setTaskFormOpen(false)} />
    </PageLayout>
  )
}
