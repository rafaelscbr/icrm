import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  History, ArrowLeft, Trophy, TrendingUp, TrendingDown, Minus,
  Footprints, FileText, BadgeDollarSign, Zap, ChevronRight,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PageLayout } from '../../components/layout/PageLayout'
import { EstadoTela } from '../../components/shared/EstadoTela'
import { EsqueletoCards } from '../../components/shared/Esqueleto'
import { Painel, Rotulo, Barra, Chip } from '../../components/shared/visual'
import type { Tom } from '../../components/shared/visual'
import { useWeekSnapshotStore, type WeekSnapshotDeCorretor } from '../../store/useWeekSnapshotStore'
import { useGoalsStore } from '../../store/useGoalsStore'
import { useTasksStore } from '../../store/useTasksStore'
import { useSalesStore } from '../../store/useSalesStore'
import { useAuthStore } from '../../store/useAuthStore'
import { iniciais } from '../../lib/formatters'
import { WeekSnapshot, WeekSnapshotEntry, GoalCategory } from '../../types'

/**
 * Histórico semanal.
 *
 * Dois defeitos saíram daqui. O primeiro era de dado: na Visão Global a mesma
 * semana aparecia duas vezes, uma por corretor, sem dizer de quem era — quem
 * lia achava que era bug. Agora a Visão Global lê o histórico de TODOS e
 * mostra uma semana por card, com uma linha por corretor. A visão de um
 * corretor continua com o card de sempre.
 *
 * O segundo era de cor: 0% vinha em vermelho em todas as semanas. Meta de
 * esforço não batida não é risco — o vermelho fica reservado para o que é
 * risco de verdade (SLA estourado, tarefa vencida). Aqui os tons são os do
 * resto de Metas: verde feito, ouro no caminho, âmbar acelerar, neutro parado.
 */

const MONTHS_PT_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

const CATEGORIA: Record<GoalCategory, { icon: LucideIcon; tom: Tom }> = {
  acionamento: { icon: Zap,             tom: 'info'    },
  visita:      { icon: Footprints,      tom: 'atencao' },
  proposta:    { icon: FileText,        tom: 'marca'   },
  venda:       { icon: BadgeDollarSign, tom: 'sucesso' },
}

function formatWeekLabel(weekStart: string, weekEnd: string): { range: string; year: string } {
  const [sy, sm, sd] = weekStart.split('-').map(Number)
  const [, em, ed]   = weekEnd.split('-').map(Number)
  return { range: `${sd} ${MONTHS_PT_SHORT[sm - 1]} – ${ed} ${MONTHS_PT_SHORT[em - 1]}`, year: String(sy) }
}

function tomDoScore(score: number): { tom: Tom; icon: LucideIcon } {
  if (score >= 80) return { tom: 'sucesso', icon: TrendingUp }
  if (score >= 50) return { tom: 'marca',   icon: Minus }
  if (score >= 25) return { tom: 'atencao', icon: TrendingDown }
  return               { tom: 'neutro',  icon: Minus }
}

function ScoreChip({ score }: { score: number }) {
  const { tom, icon } = tomDoScore(score)
  return <Chip icon={icon} tom={tom}>{score}%</Chip>
}

function metasBatidas(entries: WeekSnapshotEntry[]): number {
  return entries.filter(e => e.target > 0 && e.achieved >= e.target).length
}

/** As linhas de meta de um snapshot — nome, feito/meta e barra. */
function LinhasDeMeta({ entries }: { entries: WeekSnapshotEntry[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      {entries.map(entry => {
        const cfg  = CATEGORIA[entry.category] ?? CATEGORIA.visita
        const pct  = entry.target > 0 ? Math.min(100, Math.round((entry.achieved / entry.target) * 100)) : 0
        const done = entry.target > 0 && entry.achieved >= entry.target
        const Icon = cfg.icon
        return (
          <div key={entry.goalId}>
            <div className="flex items-center gap-2 mb-1">
              <Icon size={11} strokeWidth={1.7} className="text-t4 shrink-0" aria-hidden />
              <span className="text-xs text-t3 flex-1 truncate">{entry.goalName}</span>
              <span className={`text-xs font-semibold tabular-nums ${done ? 'text-success' : 'text-t2'}`}>
                {entry.achieved}/{entry.target}
              </span>
              <span className="text-[11px] text-t4 tabular-nums w-8 text-right">{pct}%</span>
            </div>
            <Barra
              pct={pct}
              tom={done ? 'sucesso' : cfg.tom}
              altura={5}
              rotuloAcessivel={`${entry.goalName}: ${entry.achieved} de ${entry.target}`}
            />
          </div>
        )
      })}
    </div>
  )
}

/** Card de uma semana na visão de UM corretor. */
function WeekCard({ snapshot }: { snapshot: WeekSnapshot }) {
  const { range, year } = formatWeekLabel(snapshot.weekStart, snapshot.weekEnd)
  return (
    <Painel className="px-4 py-4">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="font-heading text-[14px] font-bold text-t1 leading-tight">{range}</p>
          <p className="text-[11px] text-t4 mt-0.5 tabular-nums">{year} · {metasBatidas(snapshot.entries)} de {snapshot.entries.length} metas</p>
        </div>
        <ScoreChip score={snapshot.score} />
      </div>
      <LinhasDeMeta entries={snapshot.entries} />
    </Painel>
  )
}

/** Card de uma semana na Visão Global: uma linha por corretor, detalhe sob demanda. */
function WeekCardEquipe({ weekStart, weekEnd, itens, nomes }: {
  weekStart: string
  weekEnd: string
  itens: WeekSnapshotDeCorretor[]
  nomes: Map<string, string>
}) {
  const { range, year } = formatWeekLabel(weekStart, weekEnd)
  const [aberto, setAberto] = useState<string | null>(null)
  const media = Math.round(itens.reduce((a, s) => a + s.score, 0) / itens.length)
  const ordenados = [...itens].sort((a, b) => b.score - a.score)

  return (
    <Painel className="px-4 py-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="font-heading text-[14px] font-bold text-t1 leading-tight">{range}</p>
          <p className="text-[11px] text-t4 mt-0.5 tabular-nums">{year} · {itens.length} corretor{itens.length !== 1 ? 'es' : ''}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Rotulo>média</Rotulo>
          <ScoreChip score={media} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {ordenados.map(s => {
          const nome = nomes.get(s.brokerId) ?? 'Corretor'
          const estaAberto = aberto === s.brokerId
          return (
            <div key={s.brokerId} className="rounded-[12px] border border-line bg-s2/40 overflow-hidden">
              <button
                onClick={() => setAberto(estaAberto ? null : s.brokerId)}
                aria-expanded={estaAberto}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left cursor-pointer hover:bg-s3/40
                           transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
              >
                <span
                  className="w-7 h-7 rounded-full bg-brand-tint border border-brand/25 text-brand-text font-heading
                             text-[11px] font-bold flex items-center justify-center shrink-0"
                  aria-hidden
                >
                  {iniciais(nome) || '?'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-t1 truncate">{nome}</span>
                  <span className="block text-[11px] text-t4 tabular-nums">
                    {metasBatidas(s.entries)} de {s.entries.length} metas batidas
                  </span>
                </span>
                <ScoreChip score={s.score} />
                <ChevronRight
                  size={13} strokeWidth={1.8} aria-hidden
                  className={`text-t4 shrink-0 transition-transform ${estaAberto ? 'rotate-90' : ''}`}
                />
              </button>
              {estaAberto && (
                <div className="px-3 pb-3 pt-1 border-t border-line">
                  <LinhasDeMeta entries={s.entries} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Painel>
  )
}

function Resumo({ media, melhor, perfeitas, rotuloMedia }: {
  media: number; melhor: number; perfeitas: number; rotuloMedia: string
}) {
  return (
    <div className="grid grid-cols-3 gap-3 mb-8">
      {[
        { valor: `${media}%`,  rotulo: rotuloMedia },
        { valor: `${melhor}%`, rotulo: 'Melhor semana' },
        { valor: String(perfeitas), rotulo: 'Semanas 100%', icon: Trophy },
      ].map(k => (
        <Painel key={k.rotulo} className="px-4 py-4 text-center">
          <p className="font-heading text-[26px] font-extrabold text-t1 tabular-nums leading-none flex items-center justify-center gap-1.5">
            {k.icon && <k.icon size={16} className="text-brand-text" aria-hidden />}
            {k.valor}
          </p>
          <p className="text-[11px] text-t4 mt-1.5">{k.rotulo}</p>
        </Painel>
      ))}
    </div>
  )
}

export function WeekHistoryPage() {
  const { snapshots, snapshotsTodos, loading, erro, checkAndSave, load: loadSnapshots, loadTodos } = useWeekSnapshotStore()
  const { goals, load: loadGoals }   = useGoalsStore()
  const { tasks, load: loadTasks }   = useTasksStore()
  const { sales, load: loadSales }   = useSalesStore()
  const { profile, isAdmin, viewAsBrokerId, allProfiles } = useAuthStore()

  const visaoGlobal = isAdmin && !viewAsBrokerId
  const effectiveBrokerId = isAdmin && viewAsBrokerId ? viewAsBrokerId : profile?.id

  useEffect(() => {
    Promise.all([loadGoals(), loadTasks(), loadSales()])
    if (visaoGlobal) loadTodos()
    else if (effectiveBrokerId) loadSnapshots(effectiveBrokerId)
  }, [effectiveBrokerId, visaoGlobal]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fecha as semanas passadas do próprio usuário (o store recorta o que é dele).
  useEffect(() => {
    if (goals.length > 0) checkAndSave(tasks, sales, goals)
  }, [goals, tasks, sales, checkAndSave])

  const nomes = useMemo(() => new Map(allProfiles.map(p => [p.id, p.name])), [allProfiles])

  // Visão Global: uma entrada por semana, com os snapshots de cada corretor.
  const semanas = useMemo(() => {
    const porSemana = new Map<string, WeekSnapshotDeCorretor[]>()
    for (const s of snapshotsTodos) {
      if (!porSemana.has(s.weekStart)) porSemana.set(s.weekStart, [])
      porSemana.get(s.weekStart)!.push(s)
    }
    return [...porSemana.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([weekStart, itens]) => ({ weekStart, weekEnd: itens[0].weekEnd, itens }))
  }, [snapshotsTodos])

  const base: WeekSnapshot[] = visaoGlobal ? snapshotsTodos : snapshots
  const avgScore = base.length > 0 ? Math.round(base.reduce((a, s) => a + s.score, 0) / base.length) : 0
  const bestScore = base.length > 0 ? Math.max(...base.map(s => s.score)) : 0
  const perfect   = base.filter(s => s.score === 100).length
  const total     = visaoGlobal ? semanas.length : snapshots.length

  return (
    <PageLayout
      icon={History}
      iconTom="info"
      title="Histórico Semanal"
      subtitle={erro
        ? 'não foi possível ler o histórico'
        : `${total} semana${total !== 1 ? 's' : ''} registrada${total !== 1 ? 's' : ''}${visaoGlobal ? ' · equipe inteira' : ''}`}
    >
      <Link
        to="/metas"
        className="inline-flex items-center gap-1.5 text-xs text-t3 hover:text-t2 mb-6 transition-colors"
      >
        <ArrowLeft size={12} /> Voltar para Metas
      </Link>

      <EstadoTela
        carregando={loading && base.length === 0}
        erro={erro}
        vazio={total === 0}
        onTentarDeNovo={() => { if (visaoGlobal) void loadTodos(); else void loadSnapshots(effectiveBrokerId) }}
        esqueleto={<EsqueletoCards cards={3} colunas={3} />}
        icone={History}
        titulo="Nenhuma semana registrada ainda"
        descricao="O histórico é gerado automaticamente ao virar a semana. Complete uma semana com atividades e volte aqui."
      >
        <>
          <Resumo
            media={avgScore} melhor={bestScore} perfeitas={perfect}
            rotuloMedia={visaoGlobal ? 'Média da equipe' : 'Média geral'}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
            {visaoGlobal
              ? semanas.map(s => (
                  <WeekCardEquipe key={s.weekStart} weekStart={s.weekStart} weekEnd={s.weekEnd} itens={s.itens} nomes={nomes} />
                ))
              : snapshots.map(snapshot => (
                  <WeekCard key={snapshot.id} snapshot={snapshot} />
                ))}
          </div>
        </>
      </EstadoTela>
    </PageLayout>
  )
}
