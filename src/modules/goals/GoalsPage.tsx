import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Target, Pencil, Trash2, CheckCircle2, TrendingUp,
  Calendar, CalendarDays, Footprints, FileText,
  BadgeDollarSign, History, Zap, MessageCircle,
  ChevronRight, Plus, Phone, PauseCircle, PlayCircle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { DAILY_TARGETS, WEEKLY_TARGETS, MONTHLY_TARGETS } from '../../lib/metasConfig'
import confetti from 'canvas-confetti'
import { useAuthStore } from '../../store/useAuthStore'
import { Abas } from '../../components/shared/Abas'
import { PageLayout } from '../../components/layout/PageLayout'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Painel, Rotulo, IconeTom, Barra, SecaoTitulo, TOM } from '../../components/shared/visual'
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
import { Goal, GoalCategory, Task, Sale } from '../../types'
import { iniciais } from '../../lib/formatters'
import { useContagem } from '../../hooks/useContagem'
import { avisarComDesfazer } from '../../lib/desfazer'

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
  const sz = 60; const r = 25; const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  const cor = score >= 80 ? 'var(--success)'
            : score >= 50 ? 'var(--brand)'
            : score >= 25 ? 'var(--warning)'
            : 'var(--t4)'
  return (
    <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`} className="shrink-0" role="img"
         aria-label={`Score do período: ${score} de 100 pontos`}>
      <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={6} />
      <circle
        cx={sz/2} cy={sz/2} r={r} fill="none"
        stroke={cor} strokeWidth={6} strokeLinecap="round"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeDashoffset={circ / 4}
        style={{ transition: 'stroke-dasharray 900ms cubic-bezier(0.16,1,0.3,1), stroke 500ms' }}
      />
      <text x={sz/2} y={sz/2 + 6} textAnchor="middle" fill="var(--t1)"
            fontSize={18} fontWeight="800" fontFamily="inherit">{score}</text>
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
  const { todas, loadAll, allLoaded } = useLeadInteractionsStore()
  const { getAll: getCampaignActivities, loadAll: loadCampaignActivities, allLoaded: campaignActivitiesLoaded } = useCampaignActivityStore()
  const { sales }        = useSalesStore()
  // Fonte única: disparo_logs no Supabase (por corretor via RLS)
  const {
    countDay: disparosHoje, countWeek: disparosSemana, countMonth: disparosMes,
    countDayNew: disparosHojeNew, countWeekNew: disparosSemanaNew, countMonthNew: disparosMesNew,
    load: loadDisparos,
  } = useDisparosStore()

  // Tentativas de ligação da prospecção ativa — contadas direto de call_logs,
  // por corretor, já sem o que não chegou a virar ligação (ver migração 072).
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
    const all    = brokerId ? todas.filter(i => i.brokerId === brokerId) : todas
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
  }, [todas, getCampaignActivities, campaignActivitiesLoaded, sales, tasks, weekStartMs, monthStartMs, brokerId])  // eslint-disable-line react-hooks/exhaustive-deps -- campaignActivitiesLoaded parece inútil para a regra, mas é o que faz o cálculo refazer quando as atividades terminam de chegar — o getter lê do store por fora do fluxo de props

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

// ─── Indicador do período (uma célula da faixa) ───────────────────────────────

function KpiCelula({ label, value, target, note }: {
  label: string; value: number; target: number; note?: string
}) {
  const pct     = Math.min(100, target > 0 ? Math.round(value / target * 100) : 0)
  const status  = getStatus(value, target)
  const cfg     = STATUS[status]
  const done    = status === 'done'
  const contado = useContagem(value)

  return (
    <div className="kpi-celula px-5 py-3.5 min-w-0 flex flex-col gap-1.5" title={note}>
      <p className="text-[12.5px] text-t4 truncate">{label}</p>
      <p className="flex items-baseline gap-1.5">
        <span className={`font-display font-extrabold tabular-nums leading-none text-[22px] tracking-[-0.02em]
                          ${done ? 'text-success' : 'text-t1'}`}>
          {contado}
        </span>
        <span className="text-[12.5px] text-t4 tabular-nums">de {target}</span>
      </p>
      <Barra pct={pct} tom={cfg.tom} altura={4} rotuloAcessivel={`${label}: ${value} de ${target}`} />
      <p className={`text-[12px] ${done ? 'text-success font-medium' : 'text-t4'}`}>{cfg.label}</p>
    </div>
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
      { label: 'Tentativas',         value: data.ligacoesHoje,    target: DAILY_TARGETS.ligacoes,   icon: Phone,          note: 'prospecção ativa' },
      { label: 'Interações',       value: data.daily,           target: DAILY_TARGETS.interacoes, icon: MessageCircle,  note: 'mensagens e calls' },
    ]
    if (period === 'semana') return [
      { label: 'Novos disparos',   value: data.disparosSemanaNew, target: WEEKLY_TARGETS.disparos,     icon: Zap,           note: 'base fria'        },
      { label: 'Tentativas',         value: data.ligacoesSemana,    target: WEEKLY_TARGETS.ligacoes,     icon: Phone,         note: 'prospecção ativa' },
      { label: 'Atendimentos',     value: data.weekVisits,        target: WEEKLY_TARGETS.atendimentos, icon: Footprints,    note: 'vídeo ou presencial' },
      { label: 'Propostas',        value: data.weekProp,          target: WEEKLY_TARGETS.propostas,    icon: FileText,      note: 'enviadas'         },
    ]
    return [
      { label: 'Novos disparos',   value: data.disparosMesNew, target: MONTHLY_TARGETS.disparos,     icon: Zap,             note: 'base fria'        },
      { label: 'Tentativas',         value: data.ligacoesMes,    target: MONTHLY_TARGETS.ligacoes,     icon: Phone,           note: 'prospecção ativa' },
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

  // v10 (01/11/2026): score e indicadores numa faixa só. Antes era um painel
  // dourado com anel de 128px e frase de 22px, mais uma grade de cards — ~350px
  // antes da primeira meta personalizada.
  // Abaixo de 1280px o score ganha a linha toda e os indicadores descem para
  // a de baixo: espremido numa coluna, o veredito quebrava em quatro linhas.
  const colunas = {
    3: 'md:grid-cols-3 xl:grid-cols-[minmax(240px,1.3fr)_repeat(3,minmax(0,1fr))]',
    4: 'md:grid-cols-4 xl:grid-cols-[minmax(240px,1.3fr)_repeat(4,minmax(0,1fr))]',
    5: 'md:grid-cols-5 xl:grid-cols-[minmax(240px,1.3fr)_repeat(5,minmax(0,1fr))]',
  }[kpis.length] ?? 'md:grid-cols-4'

  return (
    <div className={`bento faixa-metas grid grid-cols-2 ${colunas} overflow-hidden mb-7`}>
      <div className="col-span-full xl:col-span-1 flex items-center gap-3.5 px-5 py-3.5 min-w-0">
        <ScoreRing score={score} />
        <div className="min-w-0">
          <p className="text-[12.5px] text-t4 truncate">Desempenho · {PERIODO.sub}</p>
          <p className="text-[14.5px] font-semibold text-t1 leading-snug mt-0.5">{veredito}</p>
          <p className={`text-[12px] mt-0.5 ${faltando === 0 ? 'text-success' : 'text-t4'}`}>
            {faltando === 0
              ? 'Todas as metas do período batidas'
              : `${faltando} de ${kpis.length} ${faltando === 1 ? 'meta em aberto' : 'metas em aberto'}`}
          </p>
        </div>
      </div>
      {kpis.map(k => <KpiCelula key={k.label} {...k} />)}
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
  const contado  = useContagem(progress)

  useEffect(() => {
    if (done && !firedRef.current) {
      firedRef.current = true
      confetti({ particleCount: 70, spread: 55, origin: { y: 0.6 }, colors: ['#D6B26E','#B8934F','#34C88A','#F6F3EC'] })
    }
  }, [done])

  return (
    <Painel className="group px-4 py-4 flex flex-col gap-3">
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <p className="font-heading text-[14px] font-bold text-t1 truncate leading-tight">{goal.name}</p>
          <p className="text-[11px] text-t4 mt-0.5">
            {cfg.label} · {goal.period === 'weekly' ? 'semanal' : 'mensal'} · meta {goal.target}
          </p>
        </div>
        {done && <CheckCircle2 size={16} className="text-success shrink-0 mt-0.5" aria-hidden />}
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className={`font-display font-extrabold tabular-nums leading-none text-[24px]
                          tracking-[-0.02em] ${done ? 'text-success' : 'text-t1'}`}>
          {contado}
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
        {/* Fundo tonalizado sem borda: caixa dentro de caixa dentro de caixa
            era o que deixava o card pesado. */}
        {numeros.map(n => (
          <div key={n.rotulo} className={`rounded-[12px] px-3 py-2.5 text-center ${TOM[n.tom].fundo}`}>
            <p className={`font-display font-extrabold tabular-nums leading-none text-[22px]
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

// ─── Visão Global: metas por corretor ────────────────────────────────────────

interface GrupoDeMetas {
  id: string
  nome: string
  ativo: boolean
  metas: Goal[]
}

/**
 * Na Visão Global as metas de todo mundo chegavam numa grade só, sem dizer de
 * quem era cada uma: 33 cards, a maioria "Acionamentos semanais · 0/250", e o
 * admin não conseguia responder a pergunta mais simples da tela — quem está
 * atrasado. Agora cada corretor é uma seção, com o próprio progresso (só as
 * tarefas e vendas DELE), e o que não se moveu no período fica recolhido numa
 * linha, em vez de ocupar uma parede.
 */
function GrupoDoCorretor({ grupo, tasks, sales, disparos, onEdit, onDelete, onPause, onNova }: {
  grupo: GrupoDeMetas
  tasks: Task[]
  sales: Sale[]
  disparos: { week: number; month: number }
  onEdit: (g: Goal) => void
  onDelete: (g: Goal) => void
  onPause: (id: string) => void
  onNova: () => void
}) {
  const [mostrarParadas, setMostrarParadas] = useState(false)

  const visitGoals = grupo.metas.filter(g => g.category === 'visita')
  const outras     = grupo.metas.filter(g => g.category !== 'visita')
  const comProgresso = outras.map(goal => ({ goal, progress: calcProgress(goal, tasks, sales, disparos) }))
  const movimentadas = comProgresso.filter(x => x.progress > 0)
  const paradas      = comProgresso.filter(x => x.progress === 0)
  const emDia        = comProgresso.filter(x => x.progress >= x.goal.target).length

  const { agendadasMes, realizadasSemana, realizadasMes } = getVisitMetrics(tasks)
  const visitasComMovimento = agendadasMes + realizadasSemana + realizadasMes > 0
  const visitasParadas = visitGoals.length > 0 && !visitasComMovimento
  const totalParadas = paradas.length + (visitasParadas ? 1 : 0)
  const total = grupo.metas.length

  const acoes = {
    onEdit: (g: Goal) => onEdit(g),
    onDelete: (g: Goal) => onDelete(g),
    onPause: (id: string) => onPause(id),
  }

  return (
    <section aria-label={`Metas de ${grupo.nome}`}>
      <div className="flex items-center gap-3 mb-3">
        <span
          className="w-8 h-8 rounded-full bg-brand-tint border border-brand/25 text-brand-text font-heading
                     text-[12px] font-bold flex items-center justify-center shrink-0"
          aria-hidden
        >
          {iniciais(grupo.nome) || '?'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-[14px] font-bold text-t1 leading-tight truncate">
            {grupo.nome}
            {!grupo.ativo && <span className="ml-2 text-[11px] font-medium text-t4">desativado</span>}
          </p>
          <p className="text-[11px] text-t4 tabular-nums">
            {total} meta{total !== 1 ? 's' : ''} · {emDia} em dia
          </p>
        </div>
        <button
          onClick={onNova}
          className="flex items-center gap-1.5 text-[12px] font-semibold text-t3 hover:text-t1 px-3 py-2
                     rounded-[10px] hover:bg-s3/50 transition-colors cursor-pointer min-h-[36px]
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
        >
          <Plus size={13} strokeWidth={2} aria-hidden /> Nova meta
        </button>
      </div>

      {(movimentadas.length > 0 || (visitGoals.length > 0 && !visitasParadas) || (mostrarParadas && totalParadas > 0)) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start stagger-children">
          {visitGoals.length > 0 && (!visitasParadas || mostrarParadas) && (
            <VisitasCard tasks={tasks} visitGoals={visitGoals} {...acoes} />
          )}
          {movimentadas.map(({ goal, progress }) => (
            <GoalCard
              key={goal.id} goal={goal} progress={progress}
              onEdit={() => onEdit(goal)} onDelete={() => onDelete(goal)} onPause={() => onPause(goal.id)}
            />
          ))}
          {mostrarParadas && paradas.map(({ goal, progress }) => (
            <GoalCard
              key={goal.id} goal={goal} progress={progress}
              onEdit={() => onEdit(goal)} onDelete={() => onDelete(goal)} onPause={() => onPause(goal.id)}
            />
          ))}
        </div>
      )}

      {totalParadas > 0 && (
        <button
          onClick={() => setMostrarParadas(v => !v)}
          aria-expanded={mostrarParadas}
          className="mt-3 w-full flex items-center justify-center gap-2 rounded-[12px] border border-dashed
                     border-line-strong px-4 py-2.5 text-[12.5px] text-t3 hover:text-t1 hover:bg-s2/60
                     transition-colors cursor-pointer min-h-[40px]
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
        >
          <ChevronRight
            size={13} strokeWidth={1.8} aria-hidden
            className={`transition-transform ${mostrarParadas ? 'rotate-90' : ''}`}
          />
          {mostrarParadas
            ? 'Recolher as metas sem movimento'
            : `${totalParadas} meta${totalParadas !== 1 ? 's' : ''} sem movimento no período · mostrar`}
        </button>
      )}
    </section>
  )
}

// ─── Página ───────────────────────────────────────────────────────────────────

export function GoalsPage() {
  const { goals, load, loadForBroker, remove, update, restaurar } = useGoalsStore()
  const [excluindo, setExcluindo] = useState(false)

  // Pausar e reativar esperam o banco; a falha já vira toast na camada do
  // banco, aqui só evitamos a promessa rejeitada solta.
  function mudarAtiva(id: string, active: boolean) {
    update(id, { active }).catch(() => {})
  }
  const { tasks: allTasks, load: loadTasks }  = useTasksStore()
  const { sales: allSales, load: loadSales }  = useSalesStore()
  const { checkAndSave, snapshots, load: loadSnapshots } = useWeekSnapshotStore()
  const { isAdmin, viewAsBrokerId, profile, allProfiles } = useAuthStore()
  // Acionamentos do período (disparos sem followup) — alimenta metas de acionamento
  const { countWeekNew: disparosWeek, countMonthNew: disparosMonth } = useDisparosStore()

  const [tab,          setTab]          = useState<PeriodTab>('semana')
  const [formOpen,     setFormOpen]     = useState(false)
  const [editing,      setEditing]      = useState<Goal | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<Goal | undefined>()
  // Na Visão Global, "Nova meta" dentro da seção de um corretor cria para ele.
  const [formBroker,   setFormBroker]   = useState<string | null>(null)

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

  // Visão Global: uma seção por corretor, com o progresso calculado só com o
  // que é dele. Corretores ativos primeiro; quem não tem cadastro fica por último.
  const visaoGlobal = isAdmin && !effectiveBrokerId
  const gruposPorCorretor = useMemo<GrupoDeMetas[]>(() => {
    if (!visaoGlobal) return []
    const porId = new Map<string, Goal[]>()
    for (const g of active) {
      const k = g.brokerId ?? ''
      if (!porId.has(k)) porId.set(k, [])
      porId.get(k)!.push(g)
    }
    return [...porId.entries()]
      .map(([id, metas]) => {
        const p = allProfiles.find(x => x.id === id)
        return { id, nome: p?.name ?? (id ? 'Corretor sem cadastro' : 'Sem dono'), ativo: p?.active !== false, metas }
      })
      .sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome))
  }, [visaoGlobal, active, allProfiles])

  const PERIOD_TABS: Array<{ id: PeriodTab; label: string; sub: string }> = [
    { id: 'hoje',   label: 'Hoje',        sub: new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }) },
    { id: 'semana', label: 'Esta semana', sub: (() => { const s = getWeekStart(); const e = new Date(s); e.setDate(s.getDate()+6); return `${s.getDate()}/${s.getMonth()+1} a ${e.getDate()}/${e.getMonth()+1}` })() },
    { id: 'mes',    label: 'Este mês',    sub: new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) },
  ]

  return (
    <PageLayout
      title="Metas"
      subtitle={visaoGlobal
        ? `${active.length} meta${active.length !== 1 ? 's' : ''} ativa${active.length !== 1 ? 's' : ''} · ${gruposPorCorretor.length} corretor${gruposPorCorretor.length !== 1 ? 'es' : ''}`
        : `${active.length} meta${active.length !== 1 ? 's' : ''} ativa${active.length !== 1 ? 's' : ''} · esforço que vira venda`}
      ctaLabel="Nova meta"
      onCta={() => { setEditing(undefined); setFormOpen(true) }}
      band={
        <Abas
          abas={PERIOD_TABS.map(t => ({ value: t.id, label: t.label }))}
          valor={tab}
          onChange={setTab}
          rotulo="Período"
          variante="sublinhado"
        />
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
      {visaoGlobal && gruposPorCorretor.length > 0 ? (
        <div className="flex flex-col gap-7 mb-8">
          {gruposPorCorretor.map(grupo => (
            <GrupoDoCorretor
              key={grupo.id || 'sem-dono'}
              grupo={grupo}
              tasks={allTasks.filter(t => t.brokerId === grupo.id)}
              sales={allSales.filter(s => s.brokerId === grupo.id)}
              disparos={{ week: disparosWeek, month: disparosMonth }}
              onEdit={g => { setEditing(g); setFormBroker(g.brokerId ?? null); setFormOpen(true) }}
              onDelete={g => setDeleteTarget(g)}
              onPause={id => mudarAtiva(id, false)}
              onNova={() => { setEditing(undefined); setFormBroker(grupo.id || null); setFormOpen(true) }}
            />
          ))}
        </div>
      ) : active.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8 items-start stagger-children">
          {visitGoals.length > 0 && (
            <VisitasCard
              tasks={tasks} visitGoals={visitGoals}
              onEdit={g => { setEditing(g); setFormOpen(true) }}
              onDelete={g => setDeleteTarget(g)}
              onPause={id => mudarAtiva(id, false)}
            />
          )}
          {otherGoals.map(goal => (
            <GoalCard
              key={goal.id} goal={goal}
              progress={calcProgress(goal, tasks, sales, { week: disparosWeek, month: disparosMonth })}
              onEdit={() => { setEditing(goal); setFormOpen(true) }}
              onDelete={() => setDeleteTarget(goal)}
              onPause={() => mudarAtiva(goal.id, false)}
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
                      onClick={() => mudarAtiva(goal.id, true)}
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

      <GoalForm
        isOpen={formOpen}
        onClose={() => { setFormOpen(false); setFormBroker(null) }}
        goal={editing}
        forBrokerId={formBroker ?? effectiveBrokerId ?? undefined}
      />

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
            variant="danger" className="flex-1" carregando={excluindo}
            onClick={async () => {
              if (!deleteTarget) return
              const meta = deleteTarget
              setExcluindo(true)
              try {
                await remove(meta.id)
                setDeleteTarget(undefined)
                avisarComDesfazer('Meta excluída', () => restaurar(meta))
              } catch {
                // deleteOne já mostrou o erro; a meta continua na tela.
              } finally {
                setExcluindo(false)
              }
            }}
          >
            Excluir
          </Button>
        </div>
      </Modal>
    </PageLayout>
  )
}
