import { useEffect, useMemo, useState } from 'react'
import { Filter, AlertTriangle, RefreshCw, ArrowDown, Clock, Megaphone, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { STAGE_THEME, FUNNEL_STAGES } from '../../lib/stageTheme'
import { useAdminView } from '../../hooks/useAdminView'

// ─── Tipos do payload da RPC lead_funnel_analytics ───────────────────────────

interface FunnelRow  { stage: string; reached: number; avgDays: number | null }
interface OriginRow  { origin: string; total: number; stages: Record<string, number> }
interface BrokerRow  { brokerId: string | null; name: string; total: number; stages: Record<string, number> }
interface Analytics  { totalLeads: number; funnel: FunnelRow[]; byOrigin: OriginRow[]; byBroker: BrokerRow[] }

const ORIGIN_LABEL: Record<string, string> = {
  felicita: 'Felicità', meta_ads: 'Meta Ads', portal: 'Portal', offline: 'Offline', campanha: 'Campanha',
}

const PERIODS = [
  { key: 'all', label: 'Tudo',      days: null },
  { key: '90',  label: '90 dias',   days: 90   },
  { key: '365', label: '12 meses',  days: 365  },
] as const
type PeriodKey = typeof PERIODS[number]['key']

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}

function toneForPct(p: number): string {
  if (p >= 50) return 'text-green-400'
  if (p >= 20) return 'text-amber-400'
  return 'text-t3'
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function LeadConversionTab() {
  const { effectiveBrokerId, isGlobalView } = useAdminView()
  const [data,    setData]    = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [period,  setPeriod]  = useState<PeriodKey>('all')

  async function fetchData() {
    setLoading(true)
    setError(null)
    const days = PERIODS.find(p => p.key === period)?.days ?? null
    const start = days ? new Date(Date.now() - days * 86_400_000).toISOString().split('T')[0] : null
    const { data: result, error: rpcError } = await supabase.rpc('lead_funnel_analytics', {
      p_broker_id: effectiveBrokerId,
      p_start: start,
      p_end: null,
    })
    if (rpcError) { setError(rpcError.message); setLoading(false); return }
    setData(result as Analytics)
    setLoading(false)
  }

  useEffect(() => { fetchData() /* eslint-disable-next-line */ }, [effectiveBrokerId, period])

  // Ordena o funil na ordem canônica das etapas
  const funnel = useMemo(() => {
    if (!data) return []
    return FUNNEL_STAGES.map(stage => data.funnel.find(f => f.stage === stage) ?? { stage, reached: 0, avgDays: null })
  }, [data])

  const topReached = funnel[0]?.reached ?? 0

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">

        {/* Cabeçalho + filtro de período */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-heading text-lg font-bold text-t1">Conversão do funil</h2>
            <p className="text-xs text-t3 mt-0.5">
              {data ? `${data.totalLeads.toLocaleString('pt-BR')} leads na coorte` : 'Carregando…'}
              {!isGlobalView && ' · visão do corretor'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-0.5 p-0.5 rounded-xl border border-line bg-s2/40">
              {PERIODS.map(p => (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  aria-pressed={period === p.key}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                    period === p.key ? 'bg-brand/15 text-brand border border-brand/25' : 'text-t3 hover:text-t2 border border-transparent'
                  }`}
                >
                  {p.key === 'all' && <Filter size={11} />}{p.label}
                </button>
              ))}
            </div>
            <button
              onClick={fetchData}
              disabled={loading}
              className="p-2 rounded-lg text-t4 hover:text-t2 hover:bg-s2/60 transition-colors cursor-pointer disabled:opacity-50"
              aria-label="Atualizar"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-3 px-5 py-4 rounded-xl border border-error-line bg-error-bg">
            <AlertTriangle size={16} className="text-error flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-error">Não foi possível carregar a conversão</p>
              <p className="text-xs text-error/70 truncate" role="alert">{error}</p>
            </div>
            <button onClick={fetchData} className="text-xs text-error border border-error-line hover:bg-error-bg px-3 py-1.5 rounded-lg cursor-pointer flex-shrink-0">
              Tentar novamente
            </button>
          </div>
        )}

        {loading && !data && !error && (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 rounded-full border-2 border-brand/30 border-t-brand animate-spin" />
          </div>
        )}

        {data && !error && (
          <>
            {/* ── Funil de conversão ───────────────────────────────────────── */}
            <div className="rounded-xl border border-line bg-surface overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
              <div className="px-5 pt-4 pb-3 border-b border-line">
                <p className="font-label text-[11px] font-bold tracking-[0.12em] text-t4 uppercase">Funil de conversão</p>
                <h3 className="text-sm font-bold text-t1 leading-none mt-0.5">Etapa a etapa (alcançaram cada etapa)</h3>
              </div>
              <div className="p-5 flex flex-col">
                {funnel.map((row, i) => {
                  const theme   = STAGE_THEME[row.stage as keyof typeof STAGE_THEME]
                  const barW    = topReached > 0 ? Math.round((row.reached / topReached) * 100) : 0
                  const penTot  = pct(row.reached, data.totalLeads)
                  const convPrev = i > 0 ? pct(row.reached, funnel[i - 1].reached) : null
                  return (
                    <div key={row.stage}>
                      {convPrev !== null && (
                        <div className="flex items-center gap-2 pl-1 py-1">
                          <ArrowDown size={12} className="text-t5" />
                          <span className={`text-xs font-bold tabular-nums ${toneForPct(convPrev)}`}>{convPrev}%</span>
                          <span className="text-[11px] text-t4">convertem de {STAGE_THEME[funnel[i - 1].stage as keyof typeof STAGE_THEME]?.label}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-3 py-1.5">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${theme?.dot ?? 'bg-slate-400'}`} />
                        <p className={`text-sm font-semibold w-28 flex-shrink-0 truncate ${theme?.color ?? 'text-t2'}`}>{theme?.label ?? row.stage}</p>
                        <div className="flex-1 h-6 bg-s3/40 rounded-lg overflow-hidden relative" role="progressbar" aria-valuenow={penTot} aria-valuemin={0} aria-valuemax={100} aria-label={`${theme?.label}: ${row.reached} leads`}>
                          <div className={`h-full rounded-lg ${theme?.dot ?? 'bg-slate-400'} opacity-80 transition-all duration-700`} style={{ width: `${barW}%` }} />
                        </div>
                        <p className="text-sm font-black text-t1 tabular-nums w-12 text-right flex-shrink-0">{row.reached.toLocaleString('pt-BR')}</p>
                        <p className="text-[11px] text-t4 tabular-nums w-10 text-right flex-shrink-0">{penTot}%</p>
                        <p className="hidden sm:flex items-center gap-1 text-[11px] text-t4 w-20 justify-end flex-shrink-0">
                          {row.avgDays != null && <><Clock size={10} /> {row.avgDays}d</>}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── Conversão por origem ─────────────────────────────────────── */}
            <ConversionTable
              title="Conversão por origem"
              eyebrow="De onde veio o lead"
              icon={Megaphone}
              rows={data.byOrigin.map(o => ({
                key: o.origin,
                label: ORIGIN_LABEL[o.origin] ?? o.origin,
                total: o.total,
                stages: o.stages,
              }))}
              highlightKey="meta_ads"
            />

            {/* ── Conversão por corretor (admin / equipe) ──────────────────── */}
            {data.byBroker.length > 1 && (
              <ConversionTable
                title="Conversão por corretor"
                eyebrow="Quem está convertendo melhor"
                icon={Users}
                rows={data.byBroker.map(b => ({
                  key: b.brokerId ?? b.name,
                  label: b.name,
                  total: b.total,
                  stages: b.stages,
                }))}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Tabela de conversão (origem / corretor) ─────────────────────────────────

interface TableRow { key: string; label: string; total: number; stages: Record<string, number> }

function ConversionTable({ title, eyebrow, icon: Icon, rows, highlightKey }: {
  title: string
  eyebrow: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  rows: TableRow[]
  highlightKey?: string
}) {
  if (rows.length === 0) return null
  return (
    <div className="rounded-xl border border-line bg-surface overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-line">
        <div className="w-8 h-8 bg-brand-tint rounded-lg flex items-center justify-center flex-shrink-0">
          <Icon size={15} className="text-brand" />
        </div>
        <div>
          <p className="font-label text-[11px] font-bold tracking-[0.12em] text-t4 uppercase">{eyebrow}</p>
          <h3 className="text-sm font-bold text-t1 leading-none mt-0.5">{title}</h3>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-t4 uppercase tracking-wider border-b border-line">
              <th className="text-left font-semibold px-5 py-2.5">{title.includes('origem') ? 'Origem' : 'Corretor'}</th>
              <th className="text-right font-semibold px-3 py-2.5">Leads</th>
              <th className="text-right font-semibold px-3 py-2.5">→ Atend.</th>
              <th className="text-right font-semibold px-3 py-2.5">Atend→Visita</th>
              <th className="text-right font-semibold px-3 py-2.5">→ Visita</th>
              <th className="text-right font-semibold px-5 py-2.5">→ Venda</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const s = r.stages
              const toAtend   = pct(s.atendimento ?? 0, r.total)
              const atendVis  = pct(s.visita ?? 0, s.atendimento ?? 0)
              const toVisita  = pct(s.visita ?? 0, r.total)
              const toVenda   = pct(s.venda ?? 0, r.total)
              const hl = highlightKey && r.key === highlightKey
              return (
                <tr key={r.key} className={`border-b border-line/60 last:border-0 ${hl ? 'bg-brand-tint/30' : 'hover:bg-s2/30'} transition-colors`}>
                  <td className="px-5 py-3 font-semibold text-t1 truncate max-w-[160px]">{r.label}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-t2">{r.total.toLocaleString('pt-BR')}</td>
                  <td className={`px-3 py-3 text-right tabular-nums font-bold ${toneForPct(toAtend)}`}>{toAtend}%</td>
                  <td className={`px-3 py-3 text-right tabular-nums font-bold ${toneForPct(atendVis)}`}>{atendVis}%</td>
                  <td className={`px-3 py-3 text-right tabular-nums font-bold ${toneForPct(toVisita)}`}>{toVisita}%</td>
                  <td className={`px-5 py-3 text-right tabular-nums font-bold ${toneForPct(toVenda)}`}>{toVenda}%</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-t4 px-5 py-2.5 border-t border-line">
        % calculado sobre o total da linha (penetração no funil); "Atend→Visita" é a conversão direta entre as duas etapas.
      </p>
    </div>
  )
}
