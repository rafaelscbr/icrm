/**
 * CampaignsBaseTab — saúde da base de leads fria + performance de campanhas.
 * Enquanto não há campanhas ativas, foca na análise das 19 listas.
 */
import { useEffect, useMemo } from 'react'
import { Database, Users, Zap, BarChart2, TrendingUp, Star } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { useLeadListsStore } from '../../store/useLeadListsStore'
import { useCampaignsStore } from '../../store/useCampaignsStore'
import { useCampaignLeadsStore } from '../../store/useCampaignLeadsStore'
import { useDisparosStore } from '../../store/useDisparosStore'

// ─── Componente principal ─────────────────────────────────────────────────────
export function CampaignsBaseTab() {
  const { lists, load: loadLists }                = useLeadListsStore()
  const { campaigns, load: loadCampaigns }        = useCampaignsStore()
  const { leads: campLeads, load: loadCampLeads } = useCampaignLeadsStore()
  const { countMonth: disparosMes, countWeek: disparosSemana, countDay: disparosHoje, history, load: loadDisparos } = useDisparosStore()

  useEffect(() => {
    loadLists(); loadCampaigns(); loadCampLeads(); loadDisparos()
  }, [])

  const activeLists  = useMemo(() => lists.filter(l => l.status === 'active'), [lists])
  const totalLeads   = useMemo(() => activeLists.reduce((a, l) => a + l.totalCount, 0), [activeLists])

  // Distribuição por tipo de produto
  const byType = useMemo(() => {
    const map: Record<string, number> = {}
    activeLists.forEach(l => {
      const type = l.productProfile?.type ?? 'Sem tipo'
      map[type] = (map[type] ?? 0) + l.totalCount
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [activeLists])

  // Distribuição por região
  const byRegion = useMemo(() => {
    const map: Record<string, number> = {}
    activeLists.forEach(l => {
      const region = l.productProfile?.region ?? 'Sem região'
      map[region] = (map[region] ?? 0) + l.totalCount
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [activeLists])

  const activeCampaigns = useMemo(() => campaigns.filter(c => c.status === 'active'), [campaigns])
  const totalCampLeads  = campLeads.length
  const engajados       = campLeads.filter(l => ['attended', 'scheduled'].includes(l.funnelStage)).length
  const migrados        = campLeads.filter(l => l.transferredAt).length

  // Histórico de disparos — últimos 14 dias
  const hist14 = useMemo(() => history.slice(-14), [history])
  const maxHist = Math.max(1, ...hist14.map(d => d.count))

  // Top listas por tamanho
  const topLists = useMemo(() =>
    [...activeLists].sort((a, b) => b.totalCount - a.totalCount).slice(0, 8),
    [activeLists]
  )

  const maxListSize = topLists[0]?.totalCount ?? 1

  return (
    <div className="flex flex-col gap-6">

      {/* KPIs da base */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Listas ativas',    value: activeLists.length,           color: 'text-brand',      icon: <Database size={16}/>,  sub: 'base de leads fria'      },
          { label: 'Total de leads',   value: totalLeads.toLocaleString('pt-BR'), color: 'text-sky-400', icon: <Users size={16}/>,    sub: 'contatos disponíveis'    },
          { label: 'Disparos — mês',   value: disparosMes,                  color: 'text-violet-400', icon: <Zap size={16}/>,       sub: `${disparosSemana} esta semana · ${disparosHoje} hoje` },
          { label: 'Campanhas ativas', value: activeCampaigns.length,       color: 'text-green-400',  icon: <TrendingUp size={16}/>, sub: `${totalCampLeads} leads na fila` },
        ].map(k => (
          <div key={k.label} className="relative bg-surface border border-line rounded-xl overflow-hidden p-5">
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-brand/40 to-transparent" />
            <div className="flex items-start justify-between mb-3">
              <p className="text-[11px] font-semibold text-t3 uppercase tracking-widest leading-tight">{k.label}</p>
              <div className="w-8 h-8 bg-brand/10 rounded-lg flex items-center justify-center text-brand flex-shrink-0">{k.icon}</div>
            </div>
            <p className={`text-3xl font-bold tabular-nums leading-none mb-1 ${k.color}`}>{k.value}</p>
            <p className="text-xs text-t4">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Ritmo de disparos — 14 dias */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <BarChart2 size={14} className="text-violet-400" />
          <h2 className="text-sm font-semibold text-t1">Ritmo de disparos — últimos 14 dias</h2>
          <span className="ml-auto text-[11px] text-t4">
            Total: <span className="text-t2 font-semibold">{hist14.reduce((a, d) => a + d.count, 0)}</span>
          </span>
        </div>
        <div className="flex items-end gap-1.5 h-24">
          {hist14.map((d, i) => {
            const pct = (d.count / maxHist) * 100
            const isToday = i === 13
            return (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                {d.count > 0 && (
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 hidden group-hover:flex bg-surface border border-line text-t1 text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap z-10">
                    {d.label}: {d.count}
                  </div>
                )}
                <div className="w-full flex items-end" style={{ height: 60 }}>
                  <div
                    className={`w-full rounded-t transition-all ${isToday ? 'bg-violet-500' : d.count > 0 ? 'bg-violet-500/45' : 'bg-s3/40'}`}
                    style={{ height: `${Math.max(pct, d.count > 0 ? 6 : 1)}%` }}
                  />
                </div>
                <span className={`text-[8px] truncate w-full text-center ${isToday ? 'text-violet-400 font-semibold' : 'text-t5'}`}>{d.label}</span>
              </div>
            )
          })}
        </div>
        {disparosMes === 0 && (
          <p className="text-center text-xs text-t4 mt-4">Nenhum disparo registrado ainda. Os disparos aparecerão aqui conforme forem realizados.</p>
        )}
      </Card>

      {/* Campanhas ativas + métricas */}
      {activeCampaigns.length > 0 ? (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={14} className="text-green-400" />
            <h2 className="text-sm font-semibold text-t1">Campanhas ativas</h2>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-4 text-center">
            {[
              { label: 'Total de leads', value: totalCampLeads, color: 'text-t1' },
              { label: 'Engajados',      value: engajados,      color: 'text-cyan-400' },
              { label: 'Migrados p/ funil', value: migrados,   color: 'text-violet-400' },
            ].map(k => (
              <div key={k.label} className="p-3 rounded-xl bg-s2/50 border border-line">
                <p className={`text-2xl font-black tabular-nums ${k.color}`}>{k.value}</p>
                <p className="text-[10px] text-t4 mt-1">{k.label}</p>
              </div>
            ))}
          </div>
          {activeCampaigns.map(c => {
            const cLeads = campLeads.filter(l => l.campaignId === c.id)
            const eng    = cLeads.filter(l => ['attended','scheduled'].includes(l.funnelStage)).length
            const rate   = cLeads.length > 0 ? Math.round(eng / cLeads.length * 100) : 0
            return (
              <div key={c.id} className="flex items-center gap-3 py-2.5 border-t border-line">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-t1 truncate">{c.name}</p>
                  <p className="text-[11px] text-t4">{cLeads.length} leads · {eng} engajados</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="w-20 h-1.5 bg-s3/60 rounded-full overflow-hidden">
                    <div className="h-full bg-cyan-500/70 rounded-full" style={{ width: `${rate}%` }} />
                  </div>
                  <span className="text-xs font-bold text-cyan-400 w-8 text-right">{rate}%</span>
                </div>
              </div>
            )
          })}
        </Card>
      ) : (
        <div className="flex items-center gap-3 px-4 py-4 rounded-xl border border-dashed border-line bg-s2/20">
          <TrendingUp size={16} className="text-t4 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-t2">Nenhuma campanha ativa</p>
            <p className="text-xs text-t4 mt-0.5">Crie uma campanha e vincule listas para ver a performance aqui.</p>
          </div>
        </div>
      )}

      {/* Análise das listas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Top listas por tamanho */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Star size={14} className="text-brand" />
            <h2 className="text-sm font-semibold text-t1">Top listas por volume</h2>
          </div>
          <div className="flex flex-col gap-2">
            {topLists.map((list, i) => {
              const pct = (list.totalCount / maxListSize) * 100
              return (
                <div key={list.id}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold text-t4 w-4">{i + 1}</span>
                    <span className="text-xs text-t2 flex-1 truncate">{list.name}</span>
                    <span className="text-xs font-semibold text-t1 tabular-nums">{list.totalCount.toLocaleString('pt-BR')}</span>
                  </div>
                  <div className="ml-6 h-1.5 bg-s3/50 rounded-full overflow-hidden">
                    <div className="h-full bg-brand/50 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Distribuição por tipo de produto */}
        <div className="flex flex-col gap-4">
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Database size={13} className="text-sky-400" />
              <h2 className="text-sm font-semibold text-t1">Por tipo de produto</h2>
            </div>
            <div className="flex flex-col gap-2">
              {byType.slice(0, 5).map(([type, count]) => {
                const pct = (count / totalLeads) * 100
                return (
                  <div key={type} className="flex items-center gap-2">
                    <span className="text-[11px] text-t3 w-28 truncate flex-shrink-0">{type}</span>
                    <div className="flex-1 h-1.5 bg-s3/50 rounded-full overflow-hidden">
                      <div className="h-full bg-sky-500/60 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[11px] font-semibold text-t2 w-16 text-right tabular-nums">{count.toLocaleString('pt-BR')}</span>
                    <span className="text-[10px] text-t4 w-8 text-right">{pct.toFixed(0)}%</span>
                  </div>
                )
              })}
            </div>
          </Card>

          {byRegion.some(([r]) => r !== 'Sem região') && (
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <Database size={13} className="text-teal-400" />
                <h2 className="text-sm font-semibold text-t1">Por região</h2>
              </div>
              <div className="flex flex-col gap-2">
                {byRegion.map(([region, count]) => {
                  const pct = (count / totalLeads) * 100
                  return (
                    <div key={region} className="flex items-center gap-2">
                      <span className="text-[11px] text-t3 w-28 truncate flex-shrink-0">{region}</span>
                      <div className="flex-1 h-1.5 bg-s3/50 rounded-full overflow-hidden">
                        <div className="h-full bg-teal-500/60 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[11px] font-semibold text-t2 w-16 text-right tabular-nums">{count.toLocaleString('pt-BR')}</span>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}
        </div>
      </div>

    </div>
  )
}
