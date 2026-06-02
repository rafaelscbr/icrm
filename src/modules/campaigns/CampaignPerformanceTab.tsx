import { useEffect, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { Card } from '../../components/ui/Card'
import { CampaignLead } from '../../types'
import { DAILY_LIMIT } from './dailyCounter'
import { useDisparosStore } from '../../store/useDisparosStore'

// ─── Constantes ───────────────────────────────────────────────────────────────

const DAILY_TARGET   = DAILY_LIMIT          // 30
const WEEKLY_TARGET  = 150                  // 30 × 5 dias úteis
const MONTHLY_TARGET = 600                  // 30 × 5 × 4 semanas

const axisStyle = { fill: '#475569', fontSize: 11 }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(v: number, t: number) {
  return t > 0 ? Math.min(100, Math.round(v / t * 100)) : 0
}

// ─── Cartão de meta ───────────────────────────────────────────────────────────

function MetaCard({ label, value, target, color }: {
  label: string; value: number; target: number; color: string
}) {
  const p    = pct(value, target)
  const done = value >= target
  return (
    <div className="bg-s2/50 border border-line rounded-xl p-4 flex flex-col gap-2">
      <p className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className={`text-3xl font-black tabular-nums leading-none ${done ? 'text-green-400' : 'text-t1'}`}>{value}</span>
        <span className="text-sm text-slate-600">/ {target}</span>
        {done && <span className="ml-1 text-green-400 text-base">✓</span>}
      </div>
      <div className="h-1.5 bg-s3/50 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${done ? 'bg-green-500' : color}`}
          style={{ width: `${p}%` }}
        />
      </div>
      <p className="text-[10px] text-slate-600">{p}% da meta</p>
    </div>
  )
}

// ─── Tooltip customizado ──────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-page border border-line rounded-xl px-3 py-2.5 text-xs space-y-1 shadow-xl">
      <p className="text-slate-400 font-semibold mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: <span className="font-bold">{p.value}</span></p>
      ))}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface Props {
  leads: CampaignLead[]
}

export function CampaignPerformanceTab({ leads }: Props) {

  // Disparos do Supabase (persistentes entre dispositivos e limpezas de cache)
  const { countDay: disparosHoje, countWeek: disparosSemana, countMonth: disparosMes, history, load: loadDisparos } = useDisparosStore()
  useEffect(() => { loadDisparos() }, [loadDisparos])

  // Interessados por dia (funnelStage === 'attended', agrupados por stageUpdatedAt)
  const intByDay = useMemo(() => {
    const map: Record<string, number> = {}
    leads
      .filter(l => l.funnelStage !== 'new' && l.funnelStage !== 'sent')
      .forEach(l => {
        const d = (l.stageUpdatedAt ?? l.updatedAt ?? '').slice(0, 10)
        if (d) map[d] = (map[d] ?? 0) + 1
      })
    return map
  }, [leads])

  // Combina histórico de disparos + interessados num único array pro gráfico
  const chartData = useMemo(() => history.map(h => ({
    label:        h.label,
    date:         h.date,
    Disparos:     h.count,
    Interessados: intByDay[h.date] ?? 0,
  })), [history, intByDay])

  // Melhor dia (mais interessados)
  const bestDay = useMemo(() => {
    return chartData.reduce<typeof chartData[0] | null>((best, d) => {
      if (!best || d.Interessados > best.Interessados) return d
      return best
    }, null)
  }, [chartData])

  // Métricas gerais desta campanha
  const total        = leads.length
  const contacted    = leads.filter(l => l.firstContactAt).length
  const interested   = leads.filter(l => !['new', 'sent'].includes(l.funnelStage)).length
  const scheduled    = leads.filter(l => l.funnelStage === 'scheduled').length
  const transferred  = leads.filter(l => l.transferredAt).length
  const responseRate = contacted > 0 ? Math.round(interested / contacted * 100) : 0

  // Tempo médio até interesse (dias entre firstContactAt → stageUpdatedAt para leads interessados)
  const avgDaysToInterest = useMemo(() => {
    const relevant = leads.filter(l =>
      !['new', 'sent'].includes(l.funnelStage) && l.firstContactAt && l.stageUpdatedAt
    )
    if (relevant.length === 0) return null
    const totalMs = relevant.reduce((s, l) => {
      return s + (new Date(l.stageUpdatedAt!).getTime() - new Date(l.firstContactAt!).getTime())
    }, 0)
    return (totalMs / relevant.length / 86_400_000).toFixed(1)
  }, [leads])

  return (
    <div className="flex flex-col gap-6 pb-6">

      {/* ── Metas de disparo (automático) ─────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1.5 h-4 rounded-full bg-violet-500" />
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Metas de disparo — lista fria</p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <MetaCard label="Hoje"       value={disparosHoje}   target={DAILY_TARGET}   color="bg-violet-500" />
          <MetaCard label="Esta semana" value={disparosSemana} target={WEEKLY_TARGET}  color="bg-violet-500" />
          <MetaCard label="Este mês"   value={disparosMes}    target={MONTHLY_TARGET} color="bg-violet-500" />
        </div>
      </div>

      {/* ── KPIs desta campanha ───────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1.5 h-4 rounded-full bg-blue-500" />
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Desempenho desta campanha</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Total de leads',     value: total.toLocaleString('pt-BR'),                   color: 'text-slate-200'  },
            { label: 'Acionados',          value: `${contacted} (${pct(contacted, total)}%)`,       color: 'text-blue-400'   },
            { label: 'Taxa de resposta',   value: `${responseRate}%`,                               color: 'text-cyan-400'   },
            { label: 'Transferidos',       value: `${transferred} (${pct(transferred, total)}%)`,   color: 'text-violet-400' },
          ].map(kpi => (
            <div key={kpi.label} className="bg-s2/50 border border-line rounded-xl p-3">
              <p className="text-[10px] text-slate-500 mb-1">{kpi.label}</p>
              <p className={`text-2xl font-black tabular-nums ${kpi.color}`}>{kpi.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Melhor dia ────────────────────────────────────────────────────── */}
      {bestDay && bestDay.Interessados > 0 && (
        <div className="bg-amber-500/8 border border-amber-500/25 rounded-xl px-5 py-4 flex items-center gap-4">
          <span className="text-3xl">🏆</span>
          <div>
            <p className="text-xs font-bold text-amber-400 uppercase tracking-wide">Melhor dia</p>
            <p className="text-sm font-semibold text-slate-200 mt-0.5">
              {bestDay.label} — <span className="text-amber-300">{bestDay.Interessados} interessado{bestDay.Interessados !== 1 ? 's'  : ''}</span> com <span className="text-violet-300">{bestDay.Disparos} disparo{bestDay.Disparos !== 1 ? 's' : ''}</span>
            </p>
          </div>
        </div>
      )}

      {/* ── Gráfico disparos × interessados (30 dias) ─────────────────────── */}
      <Card>
        <h2 className="text-sm font-semibold text-slate-300 mb-1">Disparos × Interessados — últimos 30 dias</h2>
        <p className="text-[11px] text-slate-600 mb-5">Disparos registrados automaticamente ao clicar WhatsApp nas campanhas</p>
        {chartData.every(d => d.Disparos === 0) ? (
          <div className="flex flex-col items-center py-10 gap-2">
            <p className="text-sm text-slate-600">Nenhum disparo registrado ainda</p>
            <p className="text-xs text-slate-700">Clique em WhatsApp na aba Leads para registrar automaticamente</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="label" tick={axisStyle} axisLine={false} tickLine={false} interval={4} />
              <YAxis tick={axisStyle} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8', paddingTop: 12 }} />
              <Bar dataKey="Disparos"     fill="#7c3aed" radius={[3, 3, 0, 0]} maxBarSize={20} />
              <Bar dataKey="Interessados" fill="#06b6d4" radius={[3, 3, 0, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* ── Funil rápido desta campanha ──────────────────────────────────── */}
      <Card>
        <h2 className="text-sm font-semibold text-slate-300 mb-4">Funil desta campanha</h2>
        <div className="flex flex-col gap-2">
          {[
            { label: 'Leads importados',      value: total,        color: 'bg-slate-500',  text: 'text-slate-300'  },
            { label: 'Acionados (1º msg)',    value: contacted,    color: 'bg-blue-500',   text: 'text-blue-300'   },
            { label: 'Demonstraram interesse',value: interested,   color: 'bg-cyan-500',   text: 'text-cyan-300'   },
            { label: 'Agendaram apresentação',value: scheduled,    color: 'bg-violet-500', text: 'text-violet-300' },
            { label: 'Transferidos ao funil', value: transferred,  color: 'bg-indigo-500', text: 'text-indigo-300' },
          ].map((row, i, arr) => {
            const prev    = arr[i - 1]?.value ?? row.value
            const convPct = prev > 0 ? Math.round(row.value / prev * 100) : 0
            const barPct  = total > 0 ? Math.round(row.value / total * 100) : 0
            return (
              <div key={row.label} className="flex items-center gap-3">
                <p className="text-[11px] text-slate-500 w-36 flex-shrink-0">{row.label}</p>
                <div className="flex-1 h-5 bg-s2/60 rounded-md overflow-hidden">
                  <div className={`h-full ${row.color} opacity-70 rounded-md transition-all duration-700`} style={{ width: `${barPct}%` }} />
                </div>
                <span className={`text-sm font-bold tabular-nums w-8 text-right ${row.text}`}>{row.value}</span>
                {i > 0 && (
                  <span className="text-[10px] text-slate-700 w-10 text-right tabular-nums">{convPct}%</span>
                )}
              </div>
            )
          })}
        </div>
        {avgDaysToInterest !== null && (
          <p className="text-[11px] text-slate-600 mt-4 pt-3 border-t border-line">
            ⏱ Tempo médio até demonstrar interesse: <span className="text-cyan-400 font-semibold">{avgDaysToInterest} dias</span> após o primeiro contato
          </p>
        )}
      </Card>

    </div>
  )
}
