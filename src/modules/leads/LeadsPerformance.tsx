import { useMemo, useEffect } from 'react'
import {
  TrendingUp, TrendingDown, Minus, MessageCircle, ArrowRight,
  XCircle, UserPlus, Zap, Clock, BarChart2, Target,
} from 'lucide-react'
import { Lead } from '../../types'
import { useLeadInteractionsStore } from '../../store/useLeadInteractionsStore'
import { STAGE_CONFIG } from './LeadKanban'

const STAGES = ['lead', 'followup', 'atendimento', 'visita', 'proposta', 'venda'] as const

// Tipos que representam ação real do corretor (excluindo eventos de sistema)
const REAL_INTERACTION_TYPES = new Set(['ligacao', 'whatsapp', 'email', 'visita', 'reuniao', 'nota'])

function startOfWeek(offsetWeeks = 0): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  // getDay(): 0=dom, 1=seg ... 6=sab
  // Domingo (0) → volta 6 dias para segunda; demais → (getDay() - 1) dias
  const dayOfWeek = d.getDay()
  const distToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  d.setDate(d.getDate() - distToMonday - offsetWeeks * 7)
  return d
}

function endOfWeek(offsetWeeks = 0): Date {
  const start = startOfWeek(offsetWeeks)
  const d = new Date(start)
  d.setDate(d.getDate() + 6)
  d.setHours(23, 59, 59, 999)
  return d
}

function inRange(iso: string, from: Date, to: Date): boolean {
  const t = new Date(iso).getTime()
  return t >= from.getTime() && t <= to.getTime()
}

function formatDays(days: number): string {
  if (days < 1) return '<1d'
  return `${Math.round(days)}d`
}

function DeltaBadge({ current, prev, unit = '' }: { current: number; prev: number; unit?: string }) {
  if (prev === 0 && current === 0) return <span className="text-[10px] text-t4">—</span>
  const delta = current - prev
  if (delta === 0) return (
    <span className="flex items-center gap-0.5 text-[10px] text-t3">
      <Minus size={9} /> igual à semana passada
    </span>
  )
  const up = delta > 0
  return (
    <span className={`flex items-center gap-0.5 text-[10px] font-medium ${up ? 'text-emerald-400' : 'text-red-400'}`}>
      {up ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
      {up ? '+' : ''}{delta}{unit} vs semana passada
    </span>
  )
}

interface Props {
  leads: Lead[]
}

export function LeadsPerformance({ leads }: Props) {
  const { byLead, loadAll, allLoaded } = useLeadInteractionsStore()

  useEffect(() => { if (!allLoaded) loadAll() }, [allLoaded])

  const allInteractions = useMemo(() => Object.values(byLead).flat(), [byLead])

  // ── Semana atual e anterior ───────────────────────────────────────────────
  const thisWeekStart = startOfWeek(0)
  const thisWeekEnd   = endOfWeek(0)
  const lastWeekStart = startOfWeek(1)
  const lastWeekEnd   = endOfWeek(1)

  const weekStats = useMemo(() => {
    const realNow  = allInteractions.filter(i => REAL_INTERACTION_TYPES.has(i.type) && inRange(i.interactedAt, thisWeekStart, thisWeekEnd))
    const realPrev = allInteractions.filter(i => REAL_INTERACTION_TYPES.has(i.type) && inRange(i.interactedAt, lastWeekStart, lastWeekEnd))

    const advNow  = allInteractions.filter(i => i.type === 'stage_change' && inRange(i.interactedAt, thisWeekStart, thisWeekEnd))
    const advPrev = allInteractions.filter(i => i.type === 'stage_change' && inRange(i.interactedAt, lastWeekStart, lastWeekEnd))

    const discNow  = allInteractions.filter(i => i.type === 'discard' && inRange(i.interactedAt, thisWeekStart, thisWeekEnd))
    const discPrev = allInteractions.filter(i => i.type === 'discard' && inRange(i.interactedAt, lastWeekStart, lastWeekEnd))

    const newNow  = leads.filter(l => inRange(l.createdAt, thisWeekStart, thisWeekEnd))
    const newPrev = leads.filter(l => inRange(l.createdAt, lastWeekStart, lastWeekEnd))

    return {
      contacts:  { now: realNow.length,  prev: realPrev.length  },
      advances:  { now: advNow.length,   prev: advPrev.length   },
      discards:  { now: discNow.length,  prev: discPrev.length  },
      newLeads:  { now: newNow.length,   prev: newPrev.length   },
    }
  }, [allInteractions, leads])

  // ── Ritmo diário — últimos 30 dias ────────────────────────────────────────

  // Retorna "YYYY-MM-DD" no fuso local (evita o bug toISOString() que usa UTC)
  function localDateOf(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }

  const dailyRhythm = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      d.setDate(d.getDate() - (29 - i))
      // Data local — não usa toISOString() que retorna UTC e pode errar o dia
      const dateStr = localDateOf(d)
      const label = i === 29 ? 'Hoje' : i === 28 ? 'Ontem'
        : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      // Compara data local da interação com data local do dia
      const contacts = allInteractions.filter(x => {
        if (!REAL_INTERACTION_TYPES.has(x.type)) return false
        return localDateOf(new Date(x.interactedAt)) === dateStr
      }).length
      const advances = allInteractions.filter(x => {
        if (x.type !== 'stage_change') return false
        return localDateOf(new Date(x.interactedAt)) === dateStr
      }).length
      const dow = d.getDay() // 0=dom, 6=sab
      return { dateStr, label, contacts, advances, dow }
    })
  }, [allInteractions])

  const maxContacts = Math.max(1, ...dailyRhythm.map(d => d.contacts))

  // Melhor dia da semana
  const dowTotals = useMemo(() => {
    const names = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
    return names.map((name, dow) => ({
      name,
      total: dailyRhythm.filter(d => d.dow === dow).reduce((s, d) => s + d.contacts, 0),
    }))
  }, [dailyRhythm])
  const bestDow = dowTotals.reduce((best, d) => d.total > best.total ? d : best, dowTotals[0])

  const avgDaily = useMemo(() => {
    const total = dailyRhythm.reduce((s, d) => s + d.contacts, 0)
    const activeDays = dailyRhythm.filter(d => d.contacts > 0).length
    return activeDays > 0 ? (total / activeDays).toFixed(1) : '0'
  }, [dailyRhythm])

  // ── Eficiência do funil ───────────────────────────────────────────────────
  const funnelEfficiency = useMemo(() => {
    const active = leads.filter(l => !l.discardReason)

    return STAGES.filter(s => s !== 'venda').map(stage => {
      const inStage = active.filter(l => l.funnelStage === stage)

      // Tempo médio na etapa atual (quem ainda está nela)
      const avgDaysNow = inStage.length > 0
        ? inStage.reduce((s, l) => {
            const ref = l.stageChangedAt ?? l.createdAt
            return s + (Date.now() - new Date(ref).getTime()) / 86_400_000
          }, 0) / inStage.length
        : 0

      // Descartes nesta etapa
      const discardedHere = allInteractions.filter(i =>
        i.type === 'discard' && i.description?.includes(STAGE_CONFIG[stage].label)
      ).length

      // Avanços saindo desta etapa
      const advancedFrom = allInteractions.filter(i =>
        i.type === 'stage_change' && i.description?.includes(`${STAGE_CONFIG[stage].label} →`)
      ).length

      const total = advancedFrom + discardedHere
      const convRate = total > 0 ? Math.round((advancedFrom / total) * 100) : null

      return {
        stage,
        count: inStage.length,
        avgDays: avgDaysNow,
        discardedHere,
        advancedFrom,
        convRate,
        conf: STAGE_CONFIG[stage],
      }
    })
  }, [leads, allInteractions])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-5 space-y-5 max-w-5xl mx-auto">

      {/* ── BLOCO 1 — Atividade da semana ──────────────────────────────────── */}
      <div className="bg-page border border-line rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 bg-violet-500/15 rounded-lg flex items-center justify-center">
            <Zap size={13} className="text-violet-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-t1">Atividade da semana</p>
            <p className="text-[11px] text-t4">Segunda a hoje · comparativo com semana anterior</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Contatos realizados', icon: MessageCircle, color: 'text-green-400', bg: 'bg-green-500/10', ...weekStats.contacts },
            { label: 'Avanços de etapa',    icon: ArrowRight,    color: 'text-violet-400', bg: 'bg-violet-500/10', ...weekStats.advances },
            { label: 'Leads novos',         icon: UserPlus,      color: 'text-sky-400',    bg: 'bg-sky-500/10',    ...weekStats.newLeads },
            { label: 'Descartes',           icon: XCircle,       color: 'text-rose-400',   bg: 'bg-rose-500/10',   ...weekStats.discards },
          ].map(({ label, icon: Icon, color, bg, now, prev }) => (
            <div key={label} className="bg-s2/50 border border-line rounded-xl p-4">
              <div className={`w-7 h-7 ${bg} rounded-lg flex items-center justify-center mb-3`}>
                <Icon size={13} className={color} />
              </div>
              <p className={`text-3xl font-black tabular-nums ${color}`}>{now}</p>
              <p className="text-[11px] text-t3 mt-0.5 mb-2">{label}</p>
              <DeltaBadge current={now} prev={prev} />
            </div>
          ))}
        </div>
      </div>

      {/* ── BLOCO 2 — Ritmo diário 30 dias ─────────────────────────────────── */}
      <div className="bg-page border border-line rounded-xl p-5">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-s3/70 rounded-lg flex items-center justify-center">
              <BarChart2 size={13} className="text-t2" />
            </div>
            <p className="text-sm font-semibold text-t1">Ritmo de contatos — últimos 30 dias</p>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-t3">
            <span>Média: <span className="text-t2 font-semibold">{avgDaily}/dia ativo</span></span>
            <span>Melhor dia: <span className="text-violet-300 font-semibold">{bestDow.name} ({bestDow.total})</span></span>
          </div>
        </div>

        <p className="text-[11px] text-t4 mb-4 ml-9">Contatos reais: WhatsApp, ligação, email, visita, reunião, nota</p>

        {/* Gráfico de barras */}
        <div className="flex items-end gap-[3px] h-28">
          {dailyRhythm.map((day, i) => {
            const heightPct = maxContacts > 0 ? (day.contacts / maxContacts) * 100 : 0
            const isWeekend = day.dow === 0 || day.dow === 6
            const isToday = i === 29
            return (
              <div key={day.dateStr} className="flex-1 flex flex-col items-center gap-1 group relative">
                {day.contacts > 0 && (
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 hidden group-hover:flex bg-slate-800 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap z-10">
                    {day.label}: {day.contacts}
                  </div>
                )}
                <div className="w-full flex flex-col justify-end" style={{ height: '100%' }}>
                  <div
                    className={`w-full rounded-t transition-all ${
                      isToday        ? 'bg-violet-500'
                      : isWeekend    ? 'bg-slate-700/60'
                      : day.contacts > 0 ? 'bg-blue-500/70 group-hover:bg-blue-400'
                      : 'bg-s3/50'
                    }`}
                    style={{ height: `${Math.max(heightPct, day.contacts > 0 ? 4 : 1)}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/* Labels de referência */}
        <div className="flex justify-between mt-1.5 px-0.5">
          {[0, 9, 19, 29].map(i => (
            <span key={i} className="text-[9px] text-t5">{dailyRhythm[i]?.label}</span>
          ))}
        </div>
      </div>

      {/* ── BLOCO 3 — Eficiência do funil ──────────────────────────────────── */}
      <div className="bg-page border border-line rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 bg-amber-500/15 rounded-lg flex items-center justify-center">
            <Target size={13} className="text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-t1">Eficiência do funil</p>
            <p className="text-[11px] text-t4">Tempo médio em etapa · taxa de avanço · descartes por etapa</p>
          </div>
        </div>

        <div className="space-y-2">
          {funnelEfficiency.map(item => (
            <div
              key={item.stage}
              className={`flex items-center gap-4 p-3 rounded-xl border ${item.conf.border} ${item.conf.bg}`}
            >
              {/* Etapa */}
              <div className="w-24 flex-shrink-0">
                <p className={`text-xs font-bold ${item.conf.headerText}`}>{item.conf.label}</p>
                <p className="text-[10px] text-t4">{item.count} ativo{item.count !== 1 ? 's' : ''}</p>
              </div>

              {/* Tempo médio na etapa */}
              <div className="flex items-center gap-1.5 w-20 flex-shrink-0">
                <Clock size={10} className="text-t4 flex-shrink-0" />
                <div>
                  <p className={`text-sm font-bold tabular-nums ${
                    item.avgDays <= 3 ? 'text-t3' :
                    item.avgDays <= 7 ? 'text-amber-400' : 'text-red-400'
                  }`}>{formatDays(item.avgDays)}</p>
                  <p className="text-[9px] text-t5">tempo médio</p>
                </div>
              </div>

              {/* Taxa de conversão */}
              <div className="flex-1">
                {item.convRate !== null ? (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-t3">{item.advancedFrom} avançaram · {item.discardedHere} saíram</span>
                      <span className={`text-xs font-bold tabular-nums ${
                        item.convRate >= 70 ? 'text-emerald-400' :
                        item.convRate >= 40 ? 'text-amber-400' : 'text-red-400'
                      }`}>{item.convRate}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-s3/70 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          item.convRate >= 70 ? 'bg-emerald-500' :
                          item.convRate >= 40 ? 'bg-amber-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${item.convRate}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] text-t5">Sem movimentações registradas ainda</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="text-[10px] text-t5 mt-3">
          * Taxa de avanço é calculada com base nos logs de movimentação a partir do momento em que a feature foi ativada.
          Dados crescem com o uso.
        </p>
      </div>

    </div>
  )
}
