import { useEffect, useState, useMemo } from 'react'
import { Search, RefreshCw } from 'lucide-react'
import { PageLayout } from '../components/layout/PageLayout'
import { Card } from '../components/ui/Card'
import { ListContainer } from '../components/ui/ListContainer'
import { Avatar } from '../components/ui/Avatar'
import { useAuthStore } from '../store/useAuthStore'
import { supabase } from '../lib/supabase'
import { pageLabel } from '../store/usePresenceStore'
import { localDateStr } from '../lib/formatters'

interface ActivityLog {
  id:         string
  broker_id:  string
  action:     string
  details:    Record<string, unknown> | null
  page:       string | null
  created_at: string
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  page_visit:   { label: 'Página visitada', color: 'text-t3'           },
  lead_created: { label: 'Lead criado',      color: 'text-blue-400'    },
  lead_moved:   { label: 'Lead movido',      color: 'text-violet-400'  },
  sale_created: { label: 'Venda registrada', color: 'text-green-400'   },
  sale_deleted: { label: 'Venda removida',   color: 'text-red-400'     },
  campaign_msg: { label: 'Mensagem enviada', color: 'text-amber-400'   },
  login:        { label: 'Login',            color: 'text-brand'       },
  logout:       { label: 'Logout',           color: 'text-slate-400'   },
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export function ActivityLogsPage() {
  const { fetchAllProfiles, allProfiles } = useAuthStore()
  const [logs,       setLogs]       = useState<ActivityLog[]>([])
  const [loading,    setLoading]    = useState(true)
  const [brokerId,   setBrokerId]   = useState<string>('all')
  const [actionFilter, setActionFilter] = useState<string>('all')
  const [search,     setSearch]     = useState('')
  const [dateFrom,   setDateFrom]   = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); return localDateStr(d)
  })
  const [dateTo, setDateTo] = useState(() => localDateStr())

  const brokers = useMemo(() => allProfiles.filter(p => p.role === 'broker'), [allProfiles])

  async function loadLogs() {
    setLoading(true)
    let q = supabase
      .from('activity_logs')
      .select('*')
      .gte('created_at', dateFrom + 'T00:00:00')
      .lte('created_at', dateTo   + 'T23:59:59')
      .order('created_at', { ascending: false })
      .limit(500)

    if (brokerId !== 'all') q = q.eq('broker_id', brokerId)
    if (actionFilter !== 'all') q = q.eq('action', actionFilter)

    const { data } = await q
    setLogs((data ?? []) as ActivityLog[])
    setLoading(false)
  }

  useEffect(() => {
    if (allProfiles.length === 0) fetchAllProfiles()
  }, [])

  useEffect(() => { loadLogs() }, [brokerId, actionFilter, dateFrom, dateTo])

  const filtered = useMemo(() => {
    if (!search.trim()) return logs
    const q = search.toLowerCase()
    return logs.filter(l =>
      l.action.toLowerCase().includes(q) ||
      (l.page ?? '').toLowerCase().includes(q) ||
      JSON.stringify(l.details ?? '').toLowerCase().includes(q)
    )
  }, [logs, search])

  function brokerName(id: string): string {
    return allProfiles.find(p => p.id === id)?.name ?? id.slice(0, 8) + '…'
  }

  const actionTypes = [...new Set(logs.map(l => l.action))]

  return (
    <PageLayout
      title="Logs de Atividade"
      subtitle={`${filtered.length} registro${filtered.length !== 1 ? 's' : ''}`}
    >
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4">
        {/* Corretor */}
        <select
          value={brokerId}
          onChange={e => setBrokerId(e.target.value)}
          className="bg-s2 border border-line rounded-xl px-3 py-2 text-sm text-t1 focus:outline-none focus:ring-2 focus:ring-brand/40"
        >
          <option value="all">Todos os corretores</option>
          {brokers.map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>

        {/* Ação */}
        <select
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          className="bg-s2 border border-line rounded-xl px-3 py-2 text-sm text-t1 focus:outline-none focus:ring-2 focus:ring-brand/40"
        >
          <option value="all">Todas as ações</option>
          {actionTypes.map(a => (
            <option key={a} value={a}>{ACTION_LABELS[a]?.label ?? a}</option>
          ))}
        </select>

        {/* Data */}
        <input
          type="date"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          className="bg-s2 border border-line rounded-xl px-3 py-2 text-sm text-t1 focus:outline-none focus:ring-2 focus:ring-brand/40"
        />
        <input
          type="date"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          className="bg-s2 border border-line rounded-xl px-3 py-2 text-sm text-t1 focus:outline-none focus:ring-2 focus:ring-brand/40"
        />

        {/* Busca */}
        <div className="flex items-center gap-2 flex-1 min-w-48 bg-s2 border border-line rounded-xl px-3 py-2">
          <Search size={13} className="text-t4 flex-shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar nos logs…"
            className="flex-1 bg-transparent text-sm text-t1 placeholder:text-t4 focus:outline-none"
          />
        </div>

        <button
          onClick={loadLogs}
          className="flex items-center gap-2 px-3 py-2 bg-s2 border border-line rounded-xl text-sm text-t2 hover:text-t1 hover:bg-s3 transition-colors cursor-pointer"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <p className="text-sm text-t3 text-center py-8">Nenhum log encontrado para os filtros selecionados.</p>
        </Card>
      ) : (
        <ListContainer>
          <div className="divide-y divide-line">
            {filtered.map(log => {
              const cfg = ACTION_LABELS[log.action]
              const isPageVisit = log.action === 'page_visit'
              return (
                <div key={log.id} className={`flex items-center gap-3 px-4 py-3 hover:bg-s3/50 transition-colors row-accent ${isPageVisit ? 'opacity-60' : ''}`}>
                  <Avatar name={brokerName(log.broker_id)} size="xs" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-t2">{brokerName(log.broker_id)}</span>
                      <span className={`text-xs font-medium ${cfg?.color ?? 'text-t3'}`}>
                        {cfg?.label ?? log.action}
                      </span>
                      {log.page && (
                        <span className="text-[11px] text-t4 bg-s3/50 px-1.5 py-0.5 rounded">
                          {pageLabel(log.page)}
                        </span>
                      )}
                    </div>
                    {log.details && Object.keys(log.details).length > 0 && !isPageVisit && (
                      <p className="text-[11px] text-t4 mt-0.5 truncate">
                        {JSON.stringify(log.details)}
                      </p>
                    )}
                  </div>
                  <span className="text-[11px] text-t4 flex-shrink-0 whitespace-nowrap">
                    {formatTime(log.created_at)}
                  </span>
                </div>
              )
            })}
          </div>
        </ListContainer>
      )}
    </PageLayout>
  )
}
