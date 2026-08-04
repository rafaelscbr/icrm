import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Target, Pencil, Trash2, CheckCircle2, TrendingUp,
  Calendar, CalendarDays, Footprints, FileText,
  BadgeDollarSign, History, Zap, MessageCircle,
  ChevronRight, Plus, Phone, Gauge, PauseCircle, PlayCircle, Sparkles,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { DAILY_TARGETS, WEEKLY_TARGETS, MONTHLY_TARGETS } from '../../lib/metasConfig'
import confetti from 'canvas-confetti'
import { useAuthStore } from '../../store/useAuthStore'
import { useRovingTabs } from '../../components/shared/Abas'
import { PageLayout } from '../../components/layout/PageLayout'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Painel, Rotulo, IconeTom, Barra, Chip, SecaoTitulo, TOM } from '../../components/shared/visual'
import type { Tom } from '../../components/shared/visual'
import { GoalForm } from './GoalForm'
import { useGoalsStore, calcProgress, getVisitMetrics } from '../../store/useGoalsStore'
import { useWeekSnapshotStore } from '../../store/useWeekSnapshotStore'
import { useTasksStore } from '../../store/useTasksStore'
import { useSalesStore } from '../../store/useSalesStore'
import { useLeadInteractionsStore } from '../../store/useLeadInteractionsStore'
import { useCampaignActivityStore } from '../../store/useCampaignActivityStore'
import { useDisparosStore } from '../../store/useDisparosStore'
import { useCallQueueStore } from '../../store/useCallQueueStore'
import { Goal, GoalCategory, Task } from '../../types'

/**
 * Metas — o painel de esforço do corretor.
 *
 * A tela responde duas perguntas em ordem: "estou no ritmo?" e "o que falta
 * fazer?". A versão anterior misturava três linguagens visuais na mesma página
 * — anel SVG de score, cards de KPI com paleta própria em Tailwind cru, e
 * anéis menores nos cards de meta — e nenhuma delas dizia qual número era o
 * mais importante.
 *
 * Agora é uma só: superfície do sistema, tom semântico por status, número
 * grande em tabular e barra com o mesmo desenho em todo lugar. O dourado
 * aparece uma vez, no bloco de desempenho, porque é ele que carrega o
 * julgamento do período.
 */

// ─── Constantes ───────────────────────────────────────────────────────────────

const REAL_TYPES = new Set(['ligacao', 'whatsapp', 'email', 'visita', 'reuniao', 'nota', 'tarefa'])

type PeriodTab = 'hoje' | 'semana' | 'mes'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWeekStart(): Date {
  // Semana = Domingo → Sábado: volta até o domingo (getDay 0)
  const d = new Date(); d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay()); return d
}
function getMonthStart(): Date {
  const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1)
}
function toLocalDate(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// ─── Status de um indicador ───────────────────────────────────────────────────

type KpiStatus = 'done' | 'good' | 'warn' | 'behind'

function getStatus(value: number, target: number): KpiStatus {
  const pct = target > 0 ? value / target : 0
  if (pct >= 1)    return 'done'
  if (pct >= 0.7)  return 'good'
  if (pct >= 0.3)  return 'warn'
  return 'behind'
}

/**
 * Semântica única de status, igual à do funil: verde = feito, ouro = no
 * caminho, âmbar = acelerar, neutro = começou agora.
 *
 * O vermelho ficou de fora de propósito. Meta de esforço em andamento não é
 * risco — usar risco aqui gastaria a cor que precisa significar "SLA estourado"
 * e "tarefa vencida" no resto do sistema.
 */
const STATUS: Record<KpiStatus, { tom: Tom; label: string }> = {
  done:   { tom: 'sucesso', label: 'Meta atingida' },
  good:   { tom: 'marca',   label: 'No caminho'    },
  warn:   { tom: 'atencao', label: 'Acelerar'      },
  behind: { tom: 'neutro',  label: 'Começar'       },
}

// ─── Anel de score ────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r = 52; const sz = 128; const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  const cor = score >= 80 ? 'var(--success)'
            : score >= 50 ? 'var(--brand)'
            : score >= 25 ? 'var(--warning)'
            : 'var(--t4)'
  return (
    <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`} className="shrink-0" role="img"
         aria-label={`Score do período: ${score} de 100 pontos`}>
      <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={9} />
      <circle
        cx={sz/2} cy={sz/2} r={r} fill="none"
        stroke={cor} strokeWidth={9} strokeLinecap="round"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeDashoffset={circ / 4}
        style={{ transition: 'stroke-dasharray 900ms cubic-bezier(0.16,1,0.3,1), stroke 500ms' }}
      />
      <text x={sz/2} y={sz/2 - 4} textAnchor="middle" fill="var(--t1)"
            fontSize={30} fontWeight="900" fontFamily="inherit">{score}</text>
      <text x={sz/2} y={sz/2 + 14} textAnchor="middle" fill="var(--t4)"
            fontSize={10} fontFamily="inherit">de 100</text>
    </svg>
  )
}

// ─── Métricas por período ─────────────────────────────────────────────────────

interface PeriodData {
  disparosHoje: number
  disparosSemana: number
  disparosMes: number
  disparosHojeNew: number
  disparosSemanaNew: number
  disparosMesNew: number
  ligacoesHoje: number
  ligacoesSemana: number
  ligacoesMes: number
  daily: number
  weekVisits: number
  weekProp: number
  monthVisits: number
  monthProp: number
  monthSales: number
}

function usePeriodData(tasks: Task[], brokerId: string | null): PeriodData {
  const { getAllInteractions, loadAll, allLoaded } = useLeadInteractionsStore()
  const { getAll: getCampaignActivities, loadAll: loadCampaignActivities, allLoaded: campaignActivitiesLoaded } = useCampaignActivityStore()
  const { sales }        = useSalesStore()
  // Fonte única: disparo_logs no Supabase (por corretor via RLS)
  const {
    countDay: disparosHoje, countWeek: disparosSemana, countMonth: disparosMes,
    countDayNew: disparosHojeNew, countWeekNew: disparosSemanaNew, countMonthNew: disparosMesNew,
    load: loadDisparos,
  } = useDisparosStore()

  // Ligações da prospecção ativa — contadas direto de call_logs, por corretor.
  // Não vêm de lead_interactions: base fria não tem lead no funil ainda.
  const contarLigacoes = useCallQueueStore(s => s.contarLigacoes)
  const [ligacoes, setLigacoes] = useState({ hoje: 0, semana: 0, mes: 0 })

  useEffect(() => {
    contarLigacoes(brokerId).then(setLigacoes).catch(() => {})
  }, [contarLigacoes, brokerId])

  useEffect(() => { loadDisparos() }, [loadDisparos])
  useEffect(() => { if (!allLoaded) loadAll() }, [allLoaded, loadAll])
  useEffect(() => { if (!campaignActivitiesLoaded) loadCampaignActivities() }, [campaignActivitiesLoaded, loadCampaignActivities])

  const weekStartMs  = useMemo(() => getWeekStart().getTime(), [])
  const monthStartMs = useMemo(() => getMonthStart().getTime(), [])

  const metrics = useMemo(() => {
    // Atribuição pela autoria: interações que o corretor fez (inclusive em leads
    // de campanha de outros) contam para ele. Sem brokerId (visão global), conta tudo.
    const all    = brokerId ? getAllInteractions().filter(i => i.brokerId === brokerId) : getAllInteractions()
    const wStart = new Date(weekStartMs)
    const mStart = new Date(monthStartMs)
    const now    = new Date()
    const today  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`

    // Pareceres em leads de campanha: registro real do corretor, conta como interação.
    // Disparo já entra como acionamento (disparo_logs) e mudança de etapa não é contato.
    const campaignRegs = getCampaignActivities().filter(a =>
      a.actionType === 'parecer' && (!brokerId || a.brokerId === brokerId))

    const daily = all.filter(i => REAL_TYPES.has(i.type) && toLocalDate(i.interactedAt) === today).length
      + campaignRegs.filter(a => toLocalDate(a.createdAt) === today).length

    const weekInteract  = all.filter(i => new Date(i.interactedAt) >= wStart)
    const monthInteract = all.filter(i => new Date(i.interactedAt) >= mStart)
    const weekProp      = weekInteract.filter(i  => i.type === 'stage_change' && i.description?.includes('→ Proposta')).length
    const monthProp     = monthInteract.filter(i => i.type === 'stage_change' && i.description?.includes('→ Proposta')).length
    const monthSales    = sales.filter(s => s.date >= new Date(monthStartMs).toISOString().slice(0,10)).length

    const visitasDone = tasks.filter(t => t.status === 'done' && t.category === 'visita')
    const weekVisits  = visitasDone.filter(t => { const d = t.completedAt ?? t.dueDate; return d && new Date(d) >= wStart }).length
    const monthVisits = visitasDone.filter(t => { const d = t.completedAt ?? t.dueDate; return d && new Date(d) >= mStart }).length

    return { daily, weekVisits, weekProp, monthVisits, monthProp, monthSales }
  }, [getAllInteractions, allLoaded, getCampaignActivities, campaignActivitiesLoaded, sales, tasks, weekStartMs, monthStartMs, brokerId])  // eslint-disable-line react-hooks/exhaustive-deps -- allLoaded e campaignActivitiesLoaded parecem inúteis para a regra, mas são o que faz o cálculo refazer quando os dados terminam de chegar — os getters leem do store por fora do fluxo de props

  return {
    disparosHoje, disparosSemana, disparosMes,
    disparosHojeNew, disparosSemanaNew, disparosMesNew,
    ligacoesHoje:   ligacoes.hoje,
    ligacoesSemana: ligacoes.semana,
    ligacoesMes:    ligacoes.mes,
    ...metrics,
  }
}

function calcScore(kpis: Array<{ value: number; target: number }>): number {
  // KPIs com target=0 são informativos (sem meta definida) e não entram no cálculo
  const scored = kpis.filter(k => k.target > 0)
  if (!scored.length) return 0
  const avg = scored.reduce((acc, k) => acc + Math.min(1, k.value / k.target), 0) / scored.length
  return Math.round(avg * 100)
}

// ─── Cartão de indicador ──────────────────────────────────────────────────────

function KpiCard({ label, value, target, icon: Icon, note }: {
  label: string; value: number; target: number; icon: LucideIcon; note?: string
}) {
  const pct    = Math.min(100, target > 0 ? Math.round(value / target * 100) : 0)
  const status = getStatus(value, target)
  const cfg    = STATUS[status]
  const done   = status === 'done'

  return (
    <Painel className="px-4 py-3.5 flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <IconeTom icon={Icon} tom={cfg.tom} tamanho="sm" />
        <Rotulo className="truncate">{label}</Rotulo>
        <span className={`ml-auto font-heading text-[13px] font-bold tabular-nums shrink-0
                          ${done ? 'text-success' : 'text-t3'}`}>
          {pct}%
        </span>
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className={`font-heading font-extrabold tabular-nums leading-none text-[30px]
                          tracking-tight ${done ? 'text-success' : 'text-t1'}`}>
          {value}
        </span>
        <span className="text-[13px] text-t4 font-medium tabular-nums">/{target}</span>
        {done && <CheckCircle2 size={15} className="text-success ml-auto shrink-0" aria-hidden />}
      </div>

      <Barra pct={pct} tom={cfg.tom} altura={5} rotuloAcessivel={`${label}: ${value} de ${target}`} />

      <div className="flex items-center justify-between gap-2">
        <span className={`text-[11px] font-semibold ${done ? 'text-success' : 'text-t4'}`}>
          {cfg.label}
        </span>
        {note && <span className="text-[11px] text-t4 truncate">{note}</span>}
      </div>
    </Painel>
  )
}

// ─── Bloco de desempenho do período ───────────────────────────────────────────

function PerformanceHero({ tasks, period, brokerId }: {
  tasks: Task[]; period: PeriodTab; brokerId: string | null
}) {
  const data = usePeriodData(tasks, brokerId)

  const kpis = useMemo(() => {
    if (period === 'hoje') return [
      { label: 'Novos disparos',   value: data.disparosHojeNew, target: DAILY_TARGETS.disparos,   icon: Zap,            note: 'base fria'        },
      { label: 'Ligações',         value: data.ligacoesHoje,    target: DAILY_TARGETS.ligacoes,   icon: Phone,          note: 'prospecção ativa' },
      { label: 'Interações',       value: data.daily,           target: DAILY_TARGETS.interacoes, icon: MessageCircle,  note: 'mensagens e calls' },
    ]
    if (period === 'semana') return [
      { label: 'Novos disparos',   value: data.disparosSemanaNew, target: WEEKLY_TARGETS.disparos,     icon: Zap,           note: 'base fria'        },
      { label: 'Ligações',         value: data.ligacoesSemana,    target: WEEKLY_TARGETS.ligacoes,     icon: Phone,         note: 'prospecção ativa' },
      { label: 'Atendimentos',     value: data.weekVisits,        target: WEEKLY_TARGETS.atendimentos, icon: Footprints,    note: 'vídeo ou presencial' },
      { label: 'Propostas',        value: data.weekProp,          target: WEEKLY_TARGETS.propostas,    icon: FileText,      note: 'enviadas'         },
    ]
    return [
      { label: 'Novos disparos',   value: data.disparosMesNew, target: MONTHLY_TARGETS.disparos,     icon: Zap,             note: 'base fria'        },
      { label: 'Ligações',         value: data.ligacoesMes,    target: MONTHLY_TARGETS.ligacoes,     icon: Phone,           note: 'prospecção ativa' },
      { label: 'Atendimentos',     value: data.monthVisits,    target: MONTHLY_TARGETS.atendimentos, icon: Footprints,      note: 'vídeo ou presencial' },
      { label: 'Propostas',        value: data.monthProp,      target: MONTHLY_TARGETS.propostas,    icon: FileText,        note: 'enviadas'         },
      { label: 'Vendas',           value: data.monthSales,     target: MONTHLY_TARGETS.vendas,       icon: BadgeDollarSign, note: 'fechadas no mês'  },
    ]
  }, [period, data])

  const score = calcScore(kpis)
  const faltando = kpis.filter(k => k.value < k.target).length

  const veredito = score >= 80 ? 'Semana de gente que fecha negócio.'
                 : score >= 50 ? 'No ritmo — falta pouco para fechar.'
                 : score >= 25 ? 'Dá para virar, mas precisa acelerar hoje.'
                 : 'O período mal começou. Comece pelo topo do funil.'

  const PERIODO = {
    hoje:   { titulo: 'Hoje',        sub: new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }) },
    semana: { titulo: 'Esta semana', sub: (() => { const s = getWeekStart(); const e = new Date(s); e.setDate(s.getDate()+6); return `${s.getDate()}/${s.getMonth()+1} a ${e.getDate()}/${e.getMonth()+1}` })() },
    mes:    { titulo: 'Este mês',    sub: new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) },
  }[period]

  return (
    <div className="flex flex-col gap-4 mb-7">
      {/* Desempenho — o único bloco dourado da tela */}
      <Painel dourado className="px-5 py-5">
        <div className="flex items-center gap-6 flex-wrap">
          <ScoreRing score={score} />

          <div className="flex-1 min-w-[240px]">
            <div className="flex items-center gap-2">
              <Gauge size={13} strokeWidth={1.7} className="text-brand" aria-hidden />
              <Rotulo>Desempenho · {PERIODO.titulo}</Rotulo>
            </div>

            <p className="font-heading text-[22px] font-extrabold text-t1 leading-tight
                          tracking-[-0.02em] mt-1.5">
              {veredito}
            </p>
            <p className="text-[13px] text-t3 mt-1">{PERIODO.sub}</p>

            <div className="flex flex-wrap items-center gap-2 mt-3">
              {faltando === 0
                ? <Chip icon={Sparkles} tom="sucesso">todas as metas do período batidas</Chip>
                : <Chip icon={Target} tom={score >= 50 ? 'marca' : 'atencao'}>
                    {faltando} de {kpis.length} {faltando === 1 ? 'meta em aberto' : 'metas em aberto'}
                  </Chip>}
            </div>
          </div>
        </div>
      </Painel>

      {/* Indicadores do período */}
      <div className={`grid gap-3 ${
        kpis.length === 3 ? 'grid-cols-1 sm:grid-cols-3'
        : kpis.length === 4 ? 'grid-cols-2 lg:grid-cols-4'
        : 'grid-cols-2 lg:grid-cols-5'}`}>
        {kpis.map(k => <KpiCard key={k.label} {...k} />)}
      </div>
    </div>
  )
}

// ─── Metas personalizadas ─────────────────────────────────────────────────────

const CAT_CFG: Record<GoalCategory, { icon: LucideIcon; tom: Tom; label: string }> = {
  acionamento: { icon: Zap,             tom: 'neutro',  label: 'Acionamento' },
  visita:      { icon: Footprints,      tom: 'atencao', label: 'Atendimento' },
  proposta:    { icon: FileText,        tom: 'marca',   label: 'Proposta'    },
  venda:       { icon: BadgeDollarSign, tom: 'sucesso', label: 'Venda'       },
}

function GoalCard({ goal, progress, onEdit, onDelete, onPause }: {
  goal: Goal; progress: number; onEdit: () => void; onDelete: () => void; onPause: () => void
}) {
  const cfg      = CAT_CFG[goal.category]
  const done     = progress >= goal.target
  const pct      = Math.min(100, goal.target > 0 ? Math.round(progress / goal.target * 100) : 0)
  const tom      = done ? 'sucesso' : cfg.tom
  const firedRef = useRef(false)

  useEffect(() => {
    if (done && !firedRef.current) {
      firedRef.current = true
      confetti({ particleCount: 70, spread: 55, origin: { y: 0.6 }, colors: ['#E4B23C','#C2922A','#34C88A','#F6F3EC'] })
    }
  }, [done])

  return (
    <Painel className="group px-4 py-4 flex flex-col gap-3">
      <div className="flex items-start gap-2.5">
        <IconeTom icon={cfg.icon} tom={tom} />
        <div className="min-w-0 flex-1">
          <p className="font-heading text-[14px] font-bold text-t1 truncate leading-tight">{goal.name}</p>
          <p className="text-[11px] text-t4 mt-0.5">
            {cfg.label} · {goal.period === 'weekly' ? 'semanal' : 'mensal'} · meta {goal.target}
          </p>
        </div>
        {done && <CheckCircle2 size={16} className="text-success shrink-0 mt-0.5" aria-hidden />}
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className={`font-heading font-extrabold tabular-nums leading-none text-[32px]
                          tracking-tight ${done ? 'text-success' : 'text-t1'}`}>
          {progress}
        </span>
        <span className="text-[13px] text-t4 font-medium tabular-nums">/{goal.target}</span>
        <span className={`ml-auto font-heading text-[13px] font-bold tabular-nums
                          ${done ? 'text-success' : 'text-t3'}`}>
          {pct}%
        </span>
      </div>

      <Barra pct={pct} tom={tom} altura={5} rotuloAcessivel={`${goal.name}: ${progress} de ${goal.target}`} />

      {done && (
        <p className="text-[11px] font-semibold text-success">Meta atingida — pode subir a régua.</p>
      )}

      {/* Ações crescem no hover. Colapsar a ALTURA (e não só a opacidade) é o
          que evita o vazio embaixo do gráfico; focus-within mantém o alcance
          por teclado. */}
      <div className="flex items-center gap-1 overflow-hidden max-h-0 opacity-0
                      group-hover:max-h-12 group-hover:opacity-100 group-hover:pt-1
                      group-hover:border-t focus-within:max-h-12 focus-within:opacity-100
                      focus-within:pt-1 focus-within:border-t border-line
                      transition-all duration-200">
        <button
          onClick={onPause}
          className="flex items-center gap-1.5 text-[11px] text-t4 hover:text-t2 px-2 py-1.5
                     rounded-lg hover:bg-s3/60 transition-colors cursor-pointer
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
        >
          <PauseCircle size={12} strokeWidth={1.7} aria-hidden /> Pausar
        </button>
        <button
          onClick={onEdit}
          aria-label={`Editar meta ${goal.name}`}
          className="ml-auto w-8 h-8 flex items-center justify-center rounded-lg hover:bg-s3/70
                     text-t4 hover:text-t2 transition-colors cursor-pointer
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
        >
          <Pencil size={13} strokeWidth={1.7} />
        </button>
        <button
          onClick={onDelete}
          aria-label={`Excluir meta ${goal.name}`}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-error-bg
                     text-t4 hover:text-error transition-colors cursor-pointer
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-error/30"
        >
          <Trash2 size={13} strokeWidth={1.7} />
        </button>
      </div>
    </Painel>
  )
}

/**
 * Atendimentos ganham card próprio porque a meta tem duas janelas (semana e
 * mês) e um número que não é meta nenhuma: o que está AGENDADO. Espremer isso
 * num card genérico esconderia justamente o que dá para fazer a respeito.
 */
function VisitasCard({ tasks, visitGoals, onEdit, onDelete, onPause }: {
  tasks: Task[]; visitGoals: Goal[]
  onEdit: (g: Goal) => void; onDelete: (g: Goal) => void; onPause: (id: string) => void
}) {
  const { agendadasMes, realizadasSemana, realizadasMes } = getVisitMetrics(tasks)
  const metaSem = visitGoals.find(g => g.period === 'weekly')?.target  ?? 2
  const metaMes = visitGoals.find(g => g.period === 'monthly')?.target ?? 8
  const semOk = realizadasSemana >= metaSem
  const mesOk = realizadasMes    >= metaMes
  const principal = visitGoals[0]

  const numeros = [
    { valor: agendadasMes,     rotulo: 'agendadas\nno mês',    tom: 'info'    as Tom },
    { valor: realizadasSemana, rotulo: 'feitas\nna semana',    tom: semOk ? 'sucesso' as Tom : 'neutro' as Tom },
    { valor: realizadasMes,    rotulo: 'feitas\nno mês',       tom: mesOk ? 'sucesso' as Tom : 'neutro' as Tom },
  ]

  return (
    <Painel className="group px-4 py-4 flex flex-col gap-3 sm:col-span-2">
      <div className="flex items-start gap-2.5">
        <IconeTom icon={Footprints} tom="atencao" />
        <div className="min-w-0 flex-1">
          <p className="font-heading text-[14px] font-bold text-t1 leading-tight">Atendimentos</p>
          <p className="text-[11px] text-t4 mt-0.5">meta {metaSem}/semana · {metaMes}/mês</p>
        </div>
        {principal && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100
                          focus-within:opacity-100 transition-opacity">
            <button
              onClick={() => onPause(principal.id)}
              className="flex items-center gap-1.5 text-[11px] text-t4 hover:text-t2 px-2 py-1.5
                         rounded-lg hover:bg-s3/60 transition-colors cursor-pointer
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
            >
              <PauseCircle size={12} strokeWidth={1.7} aria-hidden /> Pausar
            </button>
            <button
              onClick={() => onEdit(principal)}
              aria-label="Editar meta de atendimentos"
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-s3/70
                         text-t4 hover:text-t2 transition-colors cursor-pointer
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
            >
              <Pencil size={13} strokeWidth={1.7} />
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {numeros.map(n => (
          <div key={n.rotulo} className={`rounded-[12px] border px-3 py-2.5 text-center
                                          ${TOM[n.tom].borda} ${TOM[n.tom].fundo}`}>
            <p className={`font-heading font-extrabold tabular-nums leading-none text-[26px]
                           ${n.tom === 'neutro' ? 'text-t1' : TOM[n.tom].texto}`}>
              {n.valor}
            </p>
            <p className="text-[11px] text-t4 mt-1.5 leading-tight whitespace-pre-line">{n.rotulo}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2.5">
        {[
          { icon: Calendar,     rotulo: 'Semana', valor: realizadasSemana, meta: metaSem, ok: semOk },
          { icon: CalendarDays, rotulo: 'Mês',    valor: realizadasMes,    meta: metaMes, ok: mesOk },
        ].map(b => (
          <div key={b.rotulo}>
            <div className="flex items-center gap-1.5 mb-1">
              <b.icon size={11} strokeWidth={1.7} className="text-t4" aria-hidden />
              <Rotulo>{b.rotulo}</Rotulo>
              <span className={`ml-auto text-[11px] font-semibold tabular-nums
                                ${b.ok ? 'text-success' : 'text-t3'}`}>
                {b.ok ? 'meta atingida' : `${b.valor} de ${b.meta}`}
              </span>
            </div>
            <Barra
              pct={b.meta > 0 ? (b.valor / b.meta) * 100 : 0}
              tom={b.ok ? 'sucesso' : 'atencao'}
              altura={5}
              rotuloAcessivel={`Atendimentos na ${b.rotulo.toLowerCase()}: ${b.valor} de ${b.meta}`}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5 overflow-hidden max-h-0 opacity-0
                      group-hover:max-h-20 group-hover:opacity-100 group-hover:pt-1
                      group-hover:border-t focus-within:max-h-20 focus-within:opacity-100
                      focus-within:pt-1 focus-within:border-t border-line
                      transition-all duration-200">
        {visitGoals.map(g => (
          <button
            key={g.id}
            onClick={() => onDelete(g)}
            className="flex items-center gap-1 text-[11px] text-t4 hover:text-error px-2 py-1.5
                       rounded-lg hover:bg-error-bg transition-colors cursor-pointer
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-error/30"
          >
            <Trash2 size={11} strokeWidth={1.7} aria-hidden />
            excluir meta {g.period === 'weekly' ? 'semanal' : 'mensal'}
          </button>
        ))}
      </div>
    </Painel>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export function GoalsPage() {
  const { goals, load, loadForBroker, remove, update } = useGoalsStore()
  const { tasks: allTasks, load: loadTasks }  = useTasksStore()
  const { sales: allSales, load: loadSales }  = useSalesStore()
  const { checkAndSave, snapshots, load: loadSnapshots } = useWeekSnapshotStore()
  const { isAdmin, viewAsBrokerId, profile }  = useAuthStore()
  // Acionamentos do período (disparos sem followup) — alimenta metas de acionamento
  const { countWeekNew: disparosWeek, countMonthNew: disparosMonth } = useDisparosStore()

  const [tab,          setTab]          = useState<PeriodTab>('semana')
  const [formOpen,     setFormOpen]     = useState(false)
  const [editing,      setEditing]      = useState<Goal | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<Goal | undefined>()

  // Usa viewAsBrokerId do store global — elimina estado local desconectado
  const effectiveBrokerId = isAdmin ? viewAsBrokerId : (profile?.id ?? null)

  useEffect(() => {
    loadTasks()
    loadSales()
    if (effectiveBrokerId) {
      loadForBroker(effectiveBrokerId)
      loadSnapshots(effectiveBrokerId)
    } else {
      load()
      if (profile?.id) loadSnapshots(profile.id)
    }
  }, [effectiveBrokerId]) // eslint-disable-line react-hooks/exhaustive-deps

  const tasks = effectiveBrokerId ? allTasks.filter(t => t.brokerId === effectiveBrokerId) : allTasks
  const sales = effectiveBrokerId ? allSales.filter(s => s.brokerId === effectiveBrokerId) : allSales

  useEffect(() => {
    if (goals.length > 0) checkAndSave(tasks, sales, goals)
  }, [goals, tasks, sales, checkAndSave])

  // Esta tela é de metas por contagem (acionamento/visita/proposta/venda).
  // VGL é meta monetária da empresa e vive no hero da Dashboard — fora daqui.
  // Filtrar por CAT_CFG evita crash com categorias sem config visual (vgl/agenciamento).
  const active   = goals.filter(g => g.active && !!CAT_CFG[g.category])
  const inactive = goals.filter(g => !g.active && !!CAT_CFG[g.category])
  const visitGoals = active.filter(g => g.category === 'visita')
  const otherGoals = active.filter(g => g.category !== 'visita')

  const PERIOD_TABS: Array<{ id: PeriodTab; label: string; sub: string }> = [
    { id: 'hoje',   label: 'Hoje',        sub: new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }) },
    { id: 'semana', label: 'Esta semana', sub: (() => { const s = getWeekStart(); const e = new Date(s); e.setDate(s.getDate()+6); return `${s.getDate()}/${s.getMonth()+1} a ${e.getDate()}/${e.getMonth()+1}` })() },
    { id: 'mes',    label: 'Este mês',    sub: new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) },
  ]
  // rótulo em duas linhas não cabe no <Abas>; só o teclado vem de lá
  const propsDaAba = useRovingTabs(PERIOD_TABS.map(t => t.id), tab, setTab)

  return (
    <PageLayout
      icon={Target}
      iconTom="marca"
      title="Metas"
      subtitle={`${active.length} meta${active.length !== 1 ? 's' : ''} ativa${active.length !== 1 ? 's' : ''} · esforço que vira venda`}
      ctaLabel="Nova meta"
      onCta={() => { setEditing(undefined); setFormOpen(true) }}
      band={
        <div className="flex gap-1 p-1 rounded-[14px] border border-line bg-s2/50 w-full sm:w-fit"
             role="tablist" aria-label="Período">
          {PERIOD_TABS.map((t, i) => {
            const ativo = tab === t.id
            return (
              <button
                key={t.id}
                {...propsDaAba(i)}
                onClick={() => setTab(t.id)}
                className={`flex-1 sm:flex-none flex flex-col items-center sm:items-start gap-0.5
                            px-4 py-2 rounded-[10px] transition-all cursor-pointer min-h-[44px]
                            focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30
                            ${ativo ? 'grad-brand' : 'text-t3 hover:text-t1 hover:bg-s3/50'}`}
              >
                <span className="text-[13px] font-bold leading-none">{t.label}</span>
                <span className={`text-[11px] leading-none ${ativo ? 'opacity-75' : 'text-t4'}`}>
                  {t.sub}
                </span>
              </button>
            )
          })}
        </div>
      }
    >
      {/* ── Desempenho do período ──────────────────────────────────────── */}
      <PerformanceHero tasks={tasks} period={tab} brokerId={effectiveBrokerId} />

      {/* ── Metas personalizadas ───────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <SecaoTitulo icon={TrendingUp} tom="marca"
          descricao="Acompanhamento próprio, além dos mínimos da casa">
          Metas personalizadas
        </SecaoTitulo>

        {snapshots.length > 0 && (
          <Link
            to="/metas/historico"
            className="flex items-center gap-1.5 text-[13px] text-t3 hover:text-t1 transition-colors
                       px-3 py-2 rounded-[10px] hover:bg-s3/50 shrink-0 min-h-[40px]
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
          >
            <History size={13} strokeWidth={1.7} aria-hidden />
            <span className="hidden sm:inline">Histórico semanal</span>
            <span className="tabular-nums text-t4">({snapshots.length})</span>
            <ChevronRight size={12} strokeWidth={1.7} aria-hidden />
          </Link>
        )}
      </div>

      {/* items-start porque o card de Atendimentos ocupa duas colunas e é mais
          alto: sem isso os vizinhos esticam até a altura dele e sobra vazio. */}
      {active.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8 items-start">
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
              progress={calcProgress(goal, tasks, sales, { week: disparosWeek, month: disparosMonth })}
              onEdit={() => { setEditing(goal); setFormOpen(true) }}
              onDelete={() => setDeleteTarget(goal)}
              onPause={() => update(goal.id, { active: false })}
            />
          ))}
        </div>
      ) : (
        <Painel className="flex flex-col items-center gap-4 px-6 py-12 text-center mb-8">
          <IconeTom icon={Target} tom="marca" tamanho="lg" />
          <div>
            <p className="font-heading text-base font-bold text-t1">Nenhuma meta personalizada</p>
            <p className="text-sm text-t3 mt-1 max-w-sm">
              Os mínimos da casa já aparecem acima. Crie uma meta própria quando quiser
              acompanhar algo além deles — visitas, propostas ou vendas.
            </p>
          </div>
          <Button onClick={() => { setEditing(undefined); setFormOpen(true) }} className="gap-2 mt-1">
            <Plus size={14} /> Criar primeira meta
          </Button>
        </Painel>
      )}

      {/* ── Metas pausadas ─────────────────────────────────────────────── */}
      {inactive.length > 0 && (
        <div>
          <SecaoTitulo icon={PauseCircle} tom="neutro"
            descricao="Não contam para o score enquanto estiverem paradas">
            Pausadas
          </SecaoTitulo>

          <div className="flex flex-col gap-2">
            {inactive.map(goal => {
              const cfg = CAT_CFG[goal.category]
              return (
                <div
                  key={goal.id}
                  className="group flex items-center gap-3 rounded-[14px] border border-line
                             bg-s2/40 px-4 py-3 hover:bg-s3/40 transition-colors"
                >
                  <span className="opacity-45">
                    <IconeTom icon={cfg.icon} tom={cfg.tom} tamanho="sm" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-t3 truncate">{goal.name}</p>
                    <p className="text-[11px] text-t4">
                      {cfg.label} · {goal.target}× {goal.period === 'weekly' ? 'por semana' : 'por mês'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100
                                  focus-within:opacity-100 transition-opacity">
                    <button
                      onClick={() => update(goal.id, { active: true })}
                      className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-text
                                 px-2.5 py-1.5 rounded-lg hover:bg-brand-tint transition-colors
                                 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                    >
                      <PlayCircle size={12} strokeWidth={1.8} aria-hidden /> Reativar
                    </button>
                    <button
                      onClick={() => { setEditing(goal); setFormOpen(true) }}
                      aria-label={`Editar meta ${goal.name}`}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-s3/70
                                 text-t4 hover:text-t2 transition-colors cursor-pointer
                                 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                    >
                      <Pencil size={13} strokeWidth={1.7} />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(goal)}
                      aria-label={`Excluir meta ${goal.name}`}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-error-bg
                                 text-t4 hover:text-error transition-colors cursor-pointer
                                 focus:outline-none focus-visible:ring-2 focus-visible:ring-error/30"
                    >
                      <Trash2 size={13} strokeWidth={1.7} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <GoalForm isOpen={formOpen} onClose={() => setFormOpen(false)} goal={editing} forBrokerId={effectiveBrokerId ?? undefined} />

      {/* Modal central é a exceção: exclusão é curta e destrutiva. */}
      <Modal isOpen={Boolean(deleteTarget)} onClose={() => setDeleteTarget(undefined)} title="Excluir meta" size="sm">
        <p className="text-sm text-t3 mb-6">
          Excluir <span className="font-semibold text-t1">"{deleteTarget?.name}"</span>?
          O histórico das semanas já fechadas não muda.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setDeleteTarget(undefined)}>
            Cancelar
          </Button>
          <Button
            variant="danger" className="flex-1"
            onClick={async () => { if (deleteTarget) { await remove(deleteTarget.id); setDeleteTarget(undefined) } }}
          >
            Excluir
          </Button>
        </div>
      </Modal>
    </PageLayout>
  )
}
