import { useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Card } from '../../components/ui/Card'
import { Campaign, CampaignLead } from '../../types'
import { FUNNEL_STAGES, FUNNEL_COLORS, SITUATION_CONFIG } from './config'
import { UserCircle2 } from 'lucide-react'

interface MetricsTabProps {
  leads: CampaignLead[]
  campaign: Campaign
}

const axisStyle = { fill: '#475569', fontSize: 11 }

// Funil da campanha vai só até 'scheduled' — a partir daí passa para o funil principal
const CAMPAIGN_FUNNEL_STAGES = FUNNEL_STAGES.filter(
  s => ['new', 'sent', 'attended', 'scheduled'].includes(s.value)
)

// Larguras fixas decrescentes para as 4 etapas da campanha
const STAGE_WIDTHS_PCT = [100, 78, 58, 40]

// ─── Funil SVG — pirâmide invertida (somente etapas da campanha) ─────────────

function SalesFunnel({ leads }: { leads: CampaignLead[] }) {
  const total = leads.length

  // Ordem das etapas para comparação de índice
  const STAGE_ORDER = FUNNEL_STAGES.map(s => s.value)

  const stageData = CAMPAIGN_FUNNEL_STAGES.map((s, i) => {
    // Conta leads que estão nesta etapa OU em etapas posteriores (já passaram por aqui)
    const stageIdx = STAGE_ORDER.indexOf(s.value)
    const count    = leads.filter(l => STAGE_ORDER.indexOf(l.funnelStage) >= stageIdx).length
    const ofTotal  = total > 0 ? Math.round((count / total) * 100) : 0
    const widthPct = STAGE_WIDTHS_PCT[i] ?? 20
    return { ...s, count, ofTotal, widthPct, fill: FUNNEL_COLORS[s.value] }
  })

  // Conversão estágio-a-estágio (em relação ao estágio anterior)
  const convPct = stageData.map((s, i) => {
    if (i === 0) return null
    const prev = stageData[i - 1].count
    return prev > 0 ? Math.round((s.count / prev) * 100) : 0
  })

  const W       = 460    // viewBox width
  const STAGE_H = 46     // altura de cada faixa
  const TOTAL_H = stageData.length * STAGE_H
  const BADGE_R = 18     // raio dos badges de conversão

  const stages = stageData.map((s, i) => {
    const barW = (s.widthPct / 100) * W
    const x    = (W - barW) / 2
    const y    = i * STAGE_H
    return { ...s, barW, x, y }
  })

  return (
    <svg
      viewBox={`-${BADGE_R + 4} 0 ${W + (BADGE_R + 4) * 2} ${TOTAL_H}`}
      width="100%"
      style={{ display: 'block', maxHeight: 340 }}
    >
      <defs>
        {stages.map(s => (
          <linearGradient key={s.value} id={`mfg-${s.value}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor={s.fill} stopOpacity={0.6}  />
            <stop offset="50%"  stopColor={s.fill} stopOpacity={1.0}  />
            <stop offset="100%" stopColor={s.fill} stopOpacity={0.6}  />
          </linearGradient>
        ))}
      </defs>

      {stages.map((stage, i) => {
        const next = stages[i + 1]
        const cx   = W / 2
        const cy   = stage.y + STAGE_H / 2

        // Trapézio: topo desta etapa afunilando até o topo da próxima
        const x1 = stage.x,           y1 = stage.y
        const x2 = stage.x + stage.barW
        const y2 = stage.y + STAGE_H
        const x3 = next ? next.x             : cx - 2
        const x4 = next ? next.x + next.barW : cx + 2

        const conv = convPct[i]

        return (
          <g key={stage.value}>
            {/* Trapézio preenchido */}
            <polygon
              points={`${x1},${y1} ${x2},${y1} ${x4},${y2} ${x3},${y2}`}
              fill={`url(#mfg-${stage.value})`}
            />
            {/* Borda superior sutil */}
            <line x1={x1} y1={y1} x2={x2} y2={y1} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />

            {/* Label da etapa */}
            <text x={cx} y={cy - 7} textAnchor="middle" fill="white" fontSize={10} fontWeight="700" opacity={0.92}>
              {stage.label}
            </text>

            {/* Contagem */}
            <text x={cx} y={cy + 6} textAnchor="middle" fill="white" fontSize={13} fontWeight="800">
              {stage.count.toLocaleString('pt-BR')}
            </text>

            {/* % conversão da etapa anterior (mais útil que % do total) */}
            {conv !== null && (
              <text x={cx} y={cy + 19} textAnchor="middle" fill="white" fontSize={8} fontWeight="400" opacity={0.55}>
                {conv}% do anterior
              </text>
            )}

            {/* Badge de conversão (entre etapas) — à direita */}
            {conv !== null && (
              <g>
                {/* linha tracejada */}
                <line
                  x1={x2 + 4} y1={stage.y}
                  x2={W / 2 + stage.barW / 2 + BADGE_R + 2} y2={stage.y}
                  stroke="rgba(255,255,255,0.1)" strokeWidth={0.8} strokeDasharray="3 2"
                />
                {/* círculo badge */}
                <circle
                  cx={W / 2 + stage.barW / 2 + BADGE_R + 6}
                  cy={stage.y}
                  r={BADGE_R}
                  fill={conv >= 50 ? '#22c55e22' : conv >= 20 ? '#f59e0b22' : '#ef444422'}
                  stroke={conv >= 50 ? '#22c55e80' : conv >= 20 ? '#f59e0b80' : '#ef444480'}
                  strokeWidth={1}
                />
                <text
                  x={W / 2 + stage.barW / 2 + BADGE_R + 6}
                  y={stage.y + 4}
                  textAnchor="middle"
                  fill={conv >= 50 ? '#4ade80' : conv >= 20 ? '#fbbf24' : '#f87171'}
                  fontSize={9} fontWeight="700"
                >
                  {conv}%
                </text>
              </g>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ─── Conversão por modelo de mensagem ────────────────────────────────────────

const ENGAGED_STAGES = ['attended', 'scheduled']

function ConversionByMessage({ leads, campaign }: { leads: CampaignLead[]; campaign: Campaign }) {
  // Todos os templates originais (sem substituição de nome)
  const templates = useMemo(
    () => [campaign.message, ...(campaign.messages ?? [])],
    [campaign],
  )

  const templateStats = useMemo(() => {
    // Para leads com messageIndex gravado usa direto.
    // Para leads antigos (só lastMessage), tenta inferir o template comparando o texto
    // gerado por cada template com o nome do lead.
    function resolveIndex(l: CampaignLead): number | undefined {
      if (l.messageIndex !== undefined) return l.messageIndex
      if (!l.lastMessage) return undefined
      const firstName = l.name.trim().split(/\s+/)[0]
      const idx = templates.findIndex(t => t.replace(/\{nome\}/gi, firstName) === l.lastMessage)
      return idx === -1 ? undefined : idx
    }

    const leadsWithMessage = leads.filter(l => l.lastMessage || l.messageIndex !== undefined)
    if (leadsWithMessage.length === 0) return []

    const map = new Map<number, { total: number; engaged: number }>()
    leadsWithMessage.forEach(l => {
      const idx = resolveIndex(l)
      if (idx === undefined) return
      const existing = map.get(idx) ?? { total: 0, engaged: 0 }
      existing.total += 1
      if (ENGAGED_STAGES.includes(l.funnelStage)) existing.engaged += 1
      map.set(idx, existing)
    })

    return Array.from(map.entries())
      .map(([idx, { total, engaged }]) => ({
        idx,
        label: `Mensagem ${idx + 1}`,
        preview: templates[idx] ?? '',
        total,
        engaged,
        rate: total > 0 ? Math.round((engaged / total) * 100) : 0,
      }))
      .sort((a, b) => b.rate - a.rate)
  }, [leads, templates])

  const hasData = templateStats.length > 0

  return (
    <Card>
      <h2 className="text-sm font-semibold text-t2 mb-4">Conversão por modelo de mensagem</h2>
      {!hasData ? (
        <p className="text-sm text-t4 text-center py-6">
          Envie mensagens pelo sistema para ver a análise por template
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {templateStats.map(item => (
            <div
              key={item.idx}
              className="flex flex-col gap-2 p-3 rounded-xl bg-s2/50 border border-line"
            >
              {/* Label do template + badge de leads */}
              <div className="flex items-center gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-tint text-brand text-[11px] font-bold flex items-center justify-center">
                  {item.idx + 1}
                </span>
                <span className="flex-1 text-xs font-semibold text-t2">{item.label}</span>
                <span className="flex-shrink-0 text-[11px] font-semibold bg-s3/70 text-t2 px-2 py-0.5 rounded-full whitespace-nowrap">
                  {item.total} lead{item.total !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Preview do template original */}
              {item.preview && (
                <p
                  className="text-xs italic text-t3 leading-5 ml-9"
                  style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  "{item.preview}"
                </p>
              )}

              {/* Progress bar + percentage */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-s3/70 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-green-500 transition-all"
                    style={{ width: `${item.rate}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-green-400 tabular-nums w-9 text-right">
                  {item.rate}%
                </span>
              </div>
              <p className="text-[10px] text-t4">
                {item.engaged} de {item.total} engajaram
              </p>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ─── Breakdown por corretor ───────────────────────────────────────────────────

function BrokerBreakdown({ leads }: { leads: CampaignLead[] }) {
  const data = useMemo(() => {
    const map = new Map<string, { name: string; dispatches: number; interested: number; sales: number }>()
    for (const l of leads) {
      if (!l.lastSentByName) continue
      const key = l.lastSentById ?? l.lastSentByName
      const row = map.get(key) ?? { name: l.lastSentByName, dispatches: 0, interested: 0, sales: 0 }
      row.dispatches++
      if (['attended','scheduled'].includes(l.funnelStage)) row.interested++
      if (l.transferredAt) row.sales++
      map.set(key, row)
    }
    return [...map.values()].sort((a, b) => b.dispatches - a.dispatches)
  }, [leads])

  if (data.length === 0) return null

  return (
    <Card>
      <h2 className="text-sm font-semibold text-t2 mb-4">Performance por corretor</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-t4 uppercase tracking-wider border-b border-line">
              <th className="text-left pb-2 font-semibold">Corretor</th>
              <th className="text-right pb-2 font-semibold">Disparos</th>
              <th className="text-right pb-2 font-semibold">Interessados</th>
              <th className="text-right pb-2 font-semibold">Taxa</th>
              <th className="text-right pb-2 font-semibold">Transferidos</th>
            </tr>
          </thead>
          <tbody>
            {data.map(row => {
              const taxa = row.dispatches > 0 ? Math.round(row.interested / row.dispatches * 100) : 0
              return (
                <tr key={row.name} className="border-b border-line/50 hover:bg-s2/30 transition-colors">
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                        <UserCircle2 size={12} className="text-violet-400" />
                      </div>
                      <span className="text-t2 font-medium">{row.name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-t3">{row.dispatches}</td>
                  <td className="py-2.5 text-right tabular-nums text-cyan-400">{row.interested}</td>
                  <td className="py-2.5 text-right tabular-nums">
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                      taxa >= 10 ? 'bg-green-500/15 text-green-400' :
                      taxa >= 5  ? 'bg-amber-500/15 text-amber-400' :
                                   'bg-slate-500/15 text-t3'
                    }`}>{taxa}%</span>
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-violet-400 font-semibold">{row.sales}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function MetricsTab({ leads, campaign }: MetricsTabProps) {
  // Leads com contato inválido são excluídos do funil ativo
  const invalidContacts = leads.filter(l => l.situation === 'invalid_contact').length
  const funnelLeads     = leads.filter(l => l.situation !== 'invalid_contact')
  const qualityPct      = leads.length > 0
    ? Math.round(((leads.length - invalidContacts) / leads.length) * 100)
    : 100

  const total      = funnelLeads.length
  const contacted  = funnelLeads.filter(l => l.firstContactAt).length
  const engaged    = funnelLeads.filter(l => ['attended','scheduled'].includes(l.funnelStage)).length
  const migrated   = funnelLeads.filter(l => l.transferredAt).length
  const responseRate  = contacted > 0 ? Math.round((engaged   / contacted) * 100) : 0
  const migratedRate  = contacted > 0 ? Math.round((migrated  / contacted) * 100) : 0

  const dailyData = useMemo(() => {
    return Array.from({ length: 21 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (20 - i))
      const dateStr = d.toISOString().split('T')[0]
      return {
        date:      `${d.getDate()}/${d.getMonth() + 1}`,
        acionados: funnelLeads.filter(l => l.firstContactAt?.startsWith(dateStr)).length,
      }
    })
  }, [funnelLeads])

  const situationData = SITUATION_CONFIG.map(s => ({
    ...s,
    count: leads.filter(l => l.situation === s.value).length,
  }))

  return (
    <div className="flex flex-col gap-6">

      {/* KPIs topo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total na campanha',   value: leads.length.toLocaleString('pt-BR'),                                                              color: 'text-t1'         },
          { label: 'Leads acionados',     value: `${contacted.toLocaleString('pt-BR')} (${contacted > 0 ? Math.round(contacted/total*100) : 0}%)`, color: 'text-blue-400'   },
          { label: 'Taxa de engajamento', value: `${responseRate}%`,                                                                               color: 'text-cyan-400'   },
          { label: 'Migrados p/ funil',   value: `${migrated} (${migratedRate}%)`,                                                                 color: 'text-violet-400' },
        ].map(kpi => (
          <Card key={kpi.label} className="!py-4">
            <p className="text-xs text-t4 mb-1">{kpi.label}</p>
            <p className={`text-2xl font-bold tabular-nums ${kpi.color}`}>{kpi.value}</p>
          </Card>
        ))}
      </div>

      {/* Qualidade da lista */}
      {invalidContacts > 0 && (
        <Card className="flex items-center gap-4 !py-3">
          <div className="flex-1">
            <p className="text-xs text-t4 mb-0.5">Qualidade da lista</p>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-s3/50 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${qualityPct >= 95 ? 'bg-green-500' : qualityPct >= 85 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${qualityPct}%` }}
                />
              </div>
              <span className={`text-sm font-bold tabular-nums ${qualityPct >= 95 ? 'text-green-400' : qualityPct >= 85 ? 'text-amber-400' : 'text-red-400'}`}>
                {qualityPct}%
              </span>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[11px] text-slate-400 font-semibold">{invalidContacts} contato{invalidContacts !== 1 ? 's' : ''} inválido{invalidContacts !== 1 ? 's' : ''}</p>
            <p className="text-[10px] text-t5">de {leads.length.toLocaleString('pt-BR')} leads</p>
          </div>
        </Card>
      )}

      {/* Layout 2 colunas: funil (esq) + métricas laterais (dir) */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* ── Funil ── (ocupa 3/5 do espaço) */}
        <Card className="lg:col-span-3">
          <div className="flex items-start justify-between mb-4">
            <h2 className="text-sm font-semibold text-t2">Funil de campanha</h2>
            <span className="text-[10px] text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded-full">
              até agendamento → funil principal
            </span>
          </div>
          {total === 0 ? (
            <div className="flex items-center justify-center h-52">
              <p className="text-sm text-t4">Nenhum lead importado ainda</p>
            </div>
          ) : (
            <div className="px-2">
              <SalesFunnel leads={funnelLeads} />
            </div>
          )}
        </Card>

        {/* ── Lateral: situação + volume ── (ocupa 2/5) */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <Card className="flex-1">
            <h2 className="text-sm font-semibold text-t2 mb-4">Situação dos leads</h2>
            <div className="flex flex-col gap-2">
              {situationData.map(s => (
                <div key={s.value} className="flex items-center gap-2 py-2 px-3 rounded-xl bg-s2/50 border border-line">
                  <span className={`flex-1 text-xs ${s.color}`}>{s.label}</span>
                  <span className="text-sm font-bold tabular-nums text-t1">{s.count}</span>
                  <span className="text-[10px] text-t4 w-8 text-right">
                    {total > 0 ? `${Math.round(s.count / total * 100)}%` : '—'}
                  </span>
                </div>
              ))}
              <div className="flex items-center gap-2 py-2 px-3 rounded-xl bg-s2/50 border border-line">
                <span className="flex-1 text-xs text-t3">Sem situação</span>
                <span className="text-sm font-bold tabular-nums text-t1">
                  {leads.filter(l => !l.situation).length}
                </span>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold text-t2 mb-4">Pipeline de campanha</h2>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between py-2 border-b border-line">
                <span className="text-xs text-t3">Agendados</span>
                <p className="text-sm font-bold text-violet-400 tabular-nums">
                  {funnelLeads.filter(l => l.funnelStage === 'scheduled').length}
                </p>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-line">
                <span className="text-xs text-t3">Migrados p/ funil principal</span>
                <div className="text-right">
                  <p className="text-sm font-bold text-violet-400 tabular-nums">{migrated}</p>
                  {total > 0 && <p className="text-[10px] text-t3">{migratedRate}% do total</p>}
                </div>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-xs text-t3">Agendamentos (máx etapa campanha)</span>
                <p className="text-sm font-bold text-violet-400 tabular-nums">{funnelLeads.filter(l => l.funnelStage === 'scheduled').length}</p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Leads acionados por dia */}
      <Card>
        <h2 className="text-sm font-semibold text-t2 mb-5">Leads acionados por dia — últimos 21 dias</h2>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={dailyData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="camGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}    />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="date" tick={axisStyle} axisLine={false} tickLine={false} interval={2} />
            <YAxis tick={axisStyle} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: '#0D1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }}
              labelStyle={{ color: '#94a3b8', fontSize: 11 }}
              itemStyle={{ color: '#93c5fd' }}
              formatter={(v: number) => [v, 'Acionados']}
            />
            <Area type="monotone" dataKey="acionados" stroke="#3b82f6" strokeWidth={2}
              fill="url(#camGrad)" dot={{ fill: '#3b82f6', r: 3 }} activeDot={{ r: 5 }} name="Acionados" />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* Conversão por modelo de mensagem */}
      <ConversionByMessage leads={funnelLeads} campaign={campaign} />

      {/* Performance por corretor */}
      <BrokerBreakdown leads={leads} />
    </div>
  )
}
