import { useEffect, useState, useMemo } from 'react'
import {
  MessageCircle, ArrowRight, GitMerge, UserCheck, ClipboardList,
  Loader2, Activity, RefreshCw, Calendar, User, Filter,
} from 'lucide-react'
import { useCampaignActivityStore } from '../../store/useCampaignActivityStore'
import { useAuthStore } from '../../store/useAuthStore'
import { CampaignActivity } from '../../types'
import { localDateStr } from '../../lib/formatters'

// ─── Configuração visual por tipo de ação ────────────────────────────────────

const ACTION_CONFIG: Record<CampaignActivity['actionType'], {
  icon: React.ReactNode; label: string; color: string; bg: string; border: string
}> = {
  dispatch:     { icon: <MessageCircle size={13} />, label: 'Disparo',        color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20'  },
  stage_change: { icon: <ArrowRight    size={13} />, label: 'Mudança de etapa',color: 'text-blue-400',   bg: 'bg-s3/60',   border: 'border-blue-500/20'   },
  transfer:     { icon: <GitMerge      size={13} />, label: 'Migração ao funil',color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
  assignment:   { icon: <UserCheck     size={13} />, label: 'Delegação',      color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20'  },
  parecer:      { icon: <ClipboardList size={13} />, label: 'Parecer',        color: 'text-cyan-400',   bg: 'bg-cyan-500/10',   border: 'border-cyan-500/20'   },
}

// ─── Períodos de filtro ───────────────────────────────────────────────────────

type PeriodFilter = 'today' | 'yesterday' | '2days' | '7days' | '30days' | 'custom' | 'all'

const PERIOD_OPTIONS: { value: PeriodFilter; label: string }[] = [
  { value: 'today',     label: 'Hoje'           },
  { value: 'yesterday', label: 'Ontem'          },
  { value: '2days',     label: 'Últimos 2 dias' },
  { value: '7days',     label: 'Últimos 7 dias' },
  { value: '30days',    label: 'Últimos 30 dias'},
  { value: 'all',       label: 'Tudo'           },
  { value: 'custom',    label: 'Data específica'},
]

function periodToSince(period: PeriodFilter, customDate?: string): string | undefined {
  const now = new Date()
  switch (period) {
    case 'today': {
      const d = new Date(now); d.setHours(0, 0, 0, 0); return d.toISOString()
    }
    case 'yesterday': {
      const d = new Date(now); d.setDate(d.getDate() - 1); d.setHours(0, 0, 0, 0); return d.toISOString()
    }
    case '2days': {
      const d = new Date(now); d.setDate(d.getDate() - 2); d.setHours(0, 0, 0, 0); return d.toISOString()
    }
    case '7days': {
      const d = new Date(now); d.setDate(d.getDate() - 7); d.setHours(0, 0, 0, 0); return d.toISOString()
    }
    case '30days': {
      const d = new Date(now); d.setDate(d.getDate() - 30); d.setHours(0, 0, 0, 0); return d.toISOString()
    }
    case 'custom':
      return customDate ? `${customDate}T00:00:00` : undefined
    default:
      return undefined
  }
}

// Calcula "até" para filtro "ontem" (filtra só aquele dia)
function periodToUntil(period: PeriodFilter, customDate?: string): string | undefined {
  if (period === 'yesterday') {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString()
  }
  if (period === 'custom' && customDate) {
    const d = new Date(`${customDate}T23:59:59`); return d.toISOString()
  }
  return undefined
}

// ─── Formatação de data/hora ──────────────────────────────────────────────────

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  const diffH   = Math.floor(diffMs / 3_600_000)

  if (diffMin < 1)  return 'agora'
  if (diffMin < 60) return `${diffMin}min atrás`
  if (diffH   < 24) return `${diffH}h atrás`

  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })
    + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── Agrupamento por data ─────────────────────────────────────────────────────

function groupByDay(activities: CampaignActivity[]): { date: string; label: string; items: CampaignActivity[] }[] {
  const map = new Map<string, CampaignActivity[]>()
  for (const a of activities) {
    const day = a.createdAt.slice(0, 10)
    if (!map.has(day)) map.set(day, [])
    map.get(day)!.push(a)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => {
      const d = new Date(date + 'T12:00:00')
      const today = localDateStr()
      const prevDay = new Date(); prevDay.setDate(prevDay.getDate() - 1)
      const yesterday = localDateStr(prevDay)
      const label = date === today
        ? 'Hoje'
        : date === yesterday
          ? 'Ontem'
          : d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
      return { date, label, items }
    })
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface ActivityTabProps {
  campaignId: string
}

export function ActivityTab({ campaignId }: ActivityTabProps) {
  const { loading, loadForCampaign, getForCampaign } = useCampaignActivityStore()
  const { isAdmin, allProfiles } = useAuthStore()

  const [period,      setPeriod]      = useState<PeriodFilter>('today')
  const [customDate,  setCustomDate]  = useState('')
  const [filterType,  setFilterType]  = useState<CampaignActivity['actionType'] | 'all'>('all')
  const [filterBroker,setFilterBroker]= useState<string>('all')
  const [syncing,     setSyncing]     = useState(false)

  const brokers = allProfiles.filter(p => p.role === 'broker')

  // Carrega ao abrir e quando o filtro de período muda
  useEffect(() => {
    const since = periodToSince(period, customDate || undefined)
    loadForCampaign(campaignId, since)
  }, [campaignId, period, customDate])

  // Polling 15s para manter atualizado — pausa quando a aba está oculta
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.hidden) return
      const since = periodToSince(period, customDate || undefined)
      loadForCampaign(campaignId, since)
    }, 15_000)
    return () => clearInterval(interval)
  }, [campaignId, period, customDate])

  async function handleRefresh() {
    setSyncing(true)
    const since = periodToSince(period, customDate || undefined)
    await loadForCampaign(campaignId, since)
    setSyncing(false)
  }

  // Aplica filtros locais (tipo de ação, corretor)
  const raw = getForCampaign(campaignId)
  const until = periodToUntil(period, customDate)

  const filtered = useMemo(() => {
    let list = raw
    // Filtro "até" para ontem e custom
    if (until) list = list.filter(a => a.createdAt < until)
    // Filtro tipo
    if (filterType !== 'all') list = list.filter(a => a.actionType === filterType)
    // Filtro corretor (só para admin)
    if (isAdmin && filterBroker !== 'all') list = list.filter(a => a.brokerId === filterBroker)
    return list
  }, [raw, until, filterType, filterBroker, isAdmin])

  const grouped = useMemo(() => groupByDay(filtered), [filtered])

  // Contadores por tipo
  const counts = useMemo(() => ({
    dispatch:     filtered.filter(a => a.actionType === 'dispatch').length,
    stage_change: filtered.filter(a => a.actionType === 'stage_change').length,
    transfer:     filtered.filter(a => a.actionType === 'transfer').length,
    parecer:      filtered.filter(a => a.actionType === 'parecer').length,
  }), [filtered])

  return (
    <div className="flex flex-col gap-4">

      {/* ── Filtros ── */}
      <div className="flex flex-col gap-3 bg-s2/40 border border-line rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter size={13} className="text-t4" />
            <span className="text-xs font-semibold text-t3 uppercase tracking-wider">Filtros</span>
          </div>
          <button
            onClick={handleRefresh}
            disabled={syncing}
            className="flex items-center gap-1.5 text-xs text-t4 hover:text-brand transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>

        {/* Período */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold text-t4 uppercase tracking-wider flex items-center gap-1">
            <Calendar size={10} /> Período
          </label>
          <div className="flex flex-wrap gap-1.5">
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => { setPeriod(opt.value); if (opt.value !== 'custom') setCustomDate('') }}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer
                  ${period === opt.value
                    ? 'bg-brand text-[#0F1730] border-brand'
                    : 'bg-s3/40 border-line text-t3 hover:text-t1 hover:border-brand/30'
                  }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {period === 'custom' && (
            <input
              type="date"
              value={customDate}
              onChange={e => setCustomDate(e.target.value)}
              className="mt-1 w-48 bg-s3/50 border border-line rounded-lg px-3 py-1.5 text-xs text-t1 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand/50 transition-all"
            />
          )}
        </div>

        {/* Tipo de ação + corretor (admin only) */}
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-t4 uppercase tracking-wider">Tipo</label>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value as typeof filterType)}
              className="bg-s3/50 border border-line rounded-lg px-2.5 py-1.5 text-xs text-t1 focus:outline-none focus:ring-2 focus:ring-brand/30 transition-all"
            >
              <option value="all">Todos</option>
              <option value="dispatch">Disparos</option>
              <option value="stage_change">Mudanças de etapa</option>
              <option value="transfer">Migrações ao funil</option>
              <option value="assignment">Delegações</option>
            </select>
          </div>

          {isAdmin && brokers.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-t4 uppercase tracking-wider flex items-center gap-1">
                <User size={10} /> Corretor
              </label>
              <select
                value={filterBroker}
                onChange={e => setFilterBroker(e.target.value)}
                className="bg-s3/50 border border-line rounded-lg px-2.5 py-1.5 text-xs text-t1 focus:outline-none focus:ring-2 focus:ring-brand/30 transition-all"
              >
                <option value="all">Todos os corretores</option>
                {brokers.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ── Contadores resumo ── */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Disparos',     count: counts.dispatch,     color: 'text-green-400',  bg: 'bg-green-500/8'  },
            { label: 'Mudanças',     count: counts.stage_change, color: 'text-blue-400',   bg: 'bg-s3/50'   },
            { label: 'Migrações',    count: counts.transfer,     color: 'text-violet-400', bg: 'bg-violet-500/8' },
            { label: 'Pareceres',    count: counts.parecer,      color: 'text-cyan-400',   bg: 'bg-cyan-500/8'   },
          ].map(s => (
            <div key={s.label} className={`rounded-xl ${s.bg} border border-line px-3 py-2.5 text-center`}>
              <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.count}</p>
              <p className="text-[11px] text-t4 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && filtered.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="animate-spin text-t5" />
        </div>
      )}

      {/* ── Vazio ── */}
      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-s3/40 flex items-center justify-center">
            <Activity size={20} className="text-t5" />
          </div>
          <p className="text-sm text-t3">Nenhuma atividade neste período</p>
          <p className="text-xs text-t5">Tente ampliar o intervalo de datas</p>
        </div>
      )}

      {/* ── Feed agrupado por dia ── */}
      {grouped.map(group => (
        <div key={group.date}>
          {/* Cabeçalho do dia */}
          <div className="flex items-center gap-3 mb-2 px-1">
            <div className="h-px flex-1 bg-line" />
            <span className="text-xs font-semibold text-t4 bg-page px-2 capitalize">
              {group.label}
            </span>
            <div className="h-px flex-1 bg-line" />
          </div>

          {/* Itens do dia */}
          <div className="flex flex-col gap-1">
            {group.items.map(activity => {
              const cfg = ACTION_CONFIG[activity.actionType]
              const meta = activity.metadata ?? {}

              return (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 px-3 py-3 rounded-xl hover:bg-s2/50 transition-colors group border border-transparent hover:border-line"
                >
                  {/* Ícone */}
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                    {cfg.icon}
                  </div>

                  {/* Corpo */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold text-t1">
                        {activity.brokerName ?? 'Sistema'}
                      </span>
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded-md ${cfg.bg} ${cfg.color}`}>
                        {cfg.label}
                      </span>
                      {activity.leadName && (
                        <span className="text-xs text-t3 truncate max-w-[160px]">
                          → {activity.leadName}
                        </span>
                      )}
                    </div>

                    {/* Detalhe por tipo */}
                    {activity.actionType === 'dispatch' && (
                      <p className="text-xs text-t4 mt-0.5">
                        {meta.messageIndex !== undefined
                          ? `Mensagem ${(meta.messageIndex as number) + 1}`
                          : 'Mensagem enviada'}
                        {meta.message
                          ? ` · "${String(meta.message).slice(0, 80)}${String(meta.message).length > 80 ? '…' : ''}"`
                          : ''}
                      </p>
                    )}
                    {activity.actionType === 'stage_change' && (
                      <p className="text-xs text-t4 mt-0.5">
                        <span className="text-t3">{String(meta.from ?? '—')}</span>
                        {' → '}
                        <span className="text-blue-400 font-medium">{String(meta.to ?? '—')}</span>
                      </p>
                    )}
                    {activity.actionType === 'transfer' && (
                      <p className="text-xs text-t4 mt-0.5">Migrado para o funil principal</p>
                    )}
                    {activity.actionType === 'assignment' && (
                      <p className="text-xs text-t4 mt-0.5">
                        Atribuído a {String(meta.assignedTo ?? '—')}
                      </p>
                    )}
                  </div>

                  {/* Timestamp */}
                  <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                    <span className="text-xs text-t4" title={formatFullDate(activity.createdAt)}>
                      {formatDateTime(activity.createdAt)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
