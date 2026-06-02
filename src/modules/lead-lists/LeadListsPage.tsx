import { useEffect, useState } from 'react'
import {
  Database, Users, Archive, Pencil, Trash2, FolderOpen,
  TrendingUp, Calendar, ChevronRight, BarChart3, Sparkles, AlertTriangle,
} from 'lucide-react'
import { PageLayout }    from '../../components/layout/PageLayout'
import { Card }          from '../../components/ui/Card'
import { Modal }         from '../../components/ui/Modal'
import { Button }        from '../../components/ui/Button'
import { EmptyState }    from '../../components/ui/EmptyState'
import { useLeadListsStore } from '../../store/useLeadListsStore'
import { useAuthStore } from '../../store/useAuthStore'
import { LeadList }      from '../../types'
import { LeadListForm }  from './LeadListForm'
import { LeadListDetail } from './LeadListDetail'
import { DeleteListModal } from './DeleteListModal'
import { supabase }      from '../../lib/supabase'
import { batchListScores, ListScoreResult } from '../../lib/listScore'
import toast             from 'react-hot-toast'

export function LeadListsPage() {
  const { lists, loading, load, remove, archive } = useLeadListsStore()
  const { isAdmin, allProfiles } = useAuthStore()
  const [tab,           setTab]           = useState<'active' | 'archived'>('active')
  const [createOpen,    setCreateOpen]    = useState(false)
  const [editList,      setEditList]      = useState<LeadList | undefined>()
  const [deleteList,    setDeleteList]    = useState<LeadList | undefined>()
  const [detailId,      setDetailId]      = useState<string>('')
  const [cleanupOpen,   setCleanupOpen]   = useState(false)
  const [cleanupCount,  setCleanupCount]  = useState<number | null>(null)
  const [cleanupLoading,setCleanupLoading]= useState(false)
  const [cleaning,      setCleaning]      = useState(false)
  const [listScores,    setListScores]    = useState<Map<string, ListScoreResult>>(new Map())
  const [sortByScore,   setSortByScore]   = useState(false)

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (lists.length === 0) return
    const ids = lists.filter(l => l.status === 'active').map(l => l.id)
    batchListScores(ids).then(setListScores).catch(() => {})
  }, [lists])

  if (detailId) {
    const list = lists.find(l => l.id === detailId)
    if (list) return <LeadListDetail list={list} onBack={() => setDetailId('')} />
  }

  const visible = lists
    .filter(l => l.status === tab)
    .sort((a, b) => {
      if (!sortByScore || tab !== 'active') return 0
      const sa = listScores.get(a.id)?.score ?? -1
      const sb = listScores.get(b.id)?.score ?? -1
      return sb - sa
    })

  const totalLeads   = lists.filter(l => l.status === 'active').reduce((a, l) => a + l.totalCount, 0)
  const totalLists   = lists.filter(l => l.status === 'active').length
  const biggestList  = lists.reduce((a, l) => l.totalCount > (a?.totalCount ?? 0) ? l : a, lists[0])

  async function handleDelete(listId: string, contactIdsToDelete: string[]) {
    await remove(listId, contactIdsToDelete)
  }

  async function openCleanup() {
    setCleanupOpen(true)
    setCleanupCount(null)
    setCleanupLoading(true)
    try {
      // Conta órfãos: is_base_lead=true, sem lista ativa, sem funil ativo
      const { count } = await supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('is_base_lead', true)
        .filter('id', 'not.in', `(select contact_id from lead_list_members)`)
        .filter('id', 'not.in', `(select contact_id from leads where discard_reason is null and contact_id is not null)`)
      setCleanupCount(count ?? 0)
    } catch {
      setCleanupCount(0)
    } finally {
      setCleanupLoading(false)
    }
  }

  async function runCleanup() {
    setCleaning(true)
    try {
      // Busca os IDs para deletar em lotes e apaga
      const CHUNK = 500
      let deleted = 0
      while (true) {
        const { data } = await supabase
          .from('contacts')
          .select('id')
          .eq('is_base_lead', true)
          .filter('id', 'not.in', `(select contact_id from lead_list_members)`)
          .filter('id', 'not.in', `(select contact_id from leads where discard_reason is null and contact_id is not null)`)
          .limit(CHUNK)
        if (!data || data.length === 0) break
        const ids = (data as { id: string }[]).map(r => r.id)
        await supabase.from('contacts').delete().in('id', ids)
        deleted += ids.length
        if (ids.length < CHUNK) break
      }
      toast.success(`${deleted.toLocaleString('pt-BR')} contatos órfãos removidos`)
      setCleanupOpen(false)
      setCleanupCount(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Erro na limpeza: ${msg}`)
    } finally {
      setCleaning(false)
    }
  }

  return (
    <PageLayout
      title="Base de Leads"
      subtitle="Gerencie suas listas de leads frios e conecte-as a campanhas"
      ctaLabel="Nova Lista"
      onCta={() => setCreateOpen(true)}
      actions={
        <div className="flex items-center gap-2">
          {tab === 'active' && (
            <button
              onClick={() => setSortByScore(s => !s)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-xl transition-all ${
                sortByScore
                  ? 'bg-violet-500/15 border-violet-500/30 text-violet-400'
                  : 'bg-s2/50 border-line text-t3 hover:text-violet-400 hover:border-violet-500/25 hover:bg-violet-500/8'
              }`}
              title="Ordenar por score de qualidade"
            >
              ⚡ {sortByScore ? 'Score ativo' : 'Por score'}
            </button>
          )}
          <button
            onClick={openCleanup}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-t3 hover:text-amber-400 bg-s2/50 hover:bg-amber-500/8 border border-line hover:border-amber-500/25 rounded-xl transition-all"
            title="Limpar contatos órfãos de listas excluídas"
          >
            <Sparkles size={12} /> Limpar órfãos
          </button>
        </div>
      }
    >
      {/* Stats */}
      {lists.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Listas ativas',     value: totalLists,                  color: 'text-brand'      },
            { label: 'Leads na base',     value: totalLeads.toLocaleString(), color: 'text-blue-400'   },
            { label: 'Maior lista',       value: biggestList ? `${biggestList.totalCount.toLocaleString()} leads` : '—', color: 'text-cyan-400' },
          ].map(s => (
            <Card key={s.label} className="!py-4">
              <p className="text-xs text-t3 mb-1">{s.label}</p>
              <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 bg-s2/50 border border-line rounded-xl p-1 w-fit">
        {([
          { value: 'active',   label: 'Ativas',    icon: <Database  size={13} /> },
          { value: 'archived', label: 'Arquivadas', icon: <Archive   size={13} /> },
        ] as { value: 'active' | 'archived'; label: string; icon: React.ReactNode }[]).map(t => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all
              ${tab === t.value ? 'bg-indigo-600 text-white shadow-sm' : 'text-t3 hover:text-t2'}`}
          >
            {t.icon} {t.label}
            {t.value === 'active' && lists.filter(l => l.status === 'active').length > 0 && (
              <span className="ml-1 bg-[#0B0F1C]/25 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none">
                {lists.filter(l => l.status === 'active').length}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Database size={24} />}
          title={tab === 'active' ? 'Nenhuma lista criada' : 'Nenhuma lista arquivada'}
          description={tab === 'active'
            ? 'Importe planilhas de leads frios para criar uma lista e conectar a campanhas.'
            : 'Listas arquivadas aparecem aqui.'}
          ctaLabel={tab === 'active' ? 'Nova Lista' : undefined}
          onCta={tab === 'active' ? () => setCreateOpen(true) : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {visible.map(list => {
            const profile    = list.productProfile
            const listScore  = listScores.get(list.id)
            const hasClients = (listScore?.clients ?? 0) > 0
            return (
              <Card
                key={list.id}
                className={`group flex flex-col gap-4 transition-all duration-200 border
                  ${hasClients
                    ? 'border-brand/40 hover:border-brand/70 ring-1 ring-brand/15'
                    : 'border-line hover:border-brand/25'
                  }`}
              >
                {/* Barra de destaque — listas com vendas */}
                {hasClients && (
                  <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl bg-gradient-to-r from-brand/60 via-brand to-brand/60" />
                )}
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${hasClients ? 'bg-brand/15' : 'bg-s3/60'}`}>
                      <Database size={15} className={hasClients ? 'text-brand' : 'text-t3'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-t1 truncate">{list.name}</p>
                        {hasClients && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-brand bg-brand/10 border border-brand/25 px-1.5 py-0.5 rounded-full flex-shrink-0">
                            🏆 {listScore!.clients} venda{listScore!.clients > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      {profile?.region || profile?.type ? (
                        <p className="text-[10px] text-t3 truncate mt-0.5">
                          {[profile.type, profile.region, profile.bedrooms ? `${profile.bedrooms}q` : null]
                            .filter(Boolean).join(' · ')}
                        </p>
                      ) : (
                        <p className="text-[10px] text-t4 mt-0.5">Sem perfil definido</p>
                      )}
                      {isAdmin && list.brokerId && (
                        <p className="text-[9px] text-violet-400/70 mt-0.5">
                          {allProfiles.find(p => p.id === list.brokerId)?.name ?? 'Corretor'}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    {list.status === 'active' && (
                      <button onClick={() => archive(list.id)} title="Arquivar"
                        className="p-1.5 rounded-lg hover:bg-s3/70 text-t4 hover:text-t2 transition-colors cursor-pointer">
                        <Archive size={13} />
                      </button>
                    )}
                    <button onClick={() => setEditList(list)}
                      className="p-1.5 rounded-lg hover:bg-s3/70 text-t4 hover:text-t2 transition-colors cursor-pointer">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => setDeleteList(list)}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-t4 hover:text-red-400 transition-colors cursor-pointer">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Contagem + score */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col items-center py-2.5 bg-s2/50 rounded-xl border border-line">
                    <Users size={11} className="text-t4 mb-1" />
                    <span className="text-sm font-bold tabular-nums text-t1">{list.totalCount.toLocaleString()}</span>
                    <span className="text-[10px] text-t4">Leads</span>
                  </div>
                  <div className="flex flex-col items-center py-2.5 bg-s2/50 rounded-xl border border-line">
                    <TrendingUp size={11} className="text-t4 mb-1" />
                    <span className="text-sm font-bold tabular-nums text-t3">
                      {profile?.valueMin ? `R$ ${(profile.valueMin / 1000).toFixed(0)}k` : '—'}
                    </span>
                    <span className="text-[10px] text-t4">Ticket mín</span>
                  </div>
                  {listScore ? (
                    <div className={`flex flex-col items-center py-2 rounded-xl border ${listScore.bg} ${listScore.border}`}>
                      <span className="text-base leading-none mb-0.5">{listScore.emoji}</span>
                      <span className={`text-sm font-bold tabular-nums ${listScore.color}`}>{listScore.score}</span>
                      <span className={`text-[10px] ${listScore.color} opacity-70`}>{listScore.label}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-2.5 bg-s2/50 rounded-xl border border-line">
                      <div className="w-3 h-3 border border-slate-600 border-t-transparent rounded-full animate-spin mb-1" />
                      <span className="text-[10px] text-t5">score</span>
                    </div>
                  )}
                </div>

                {list.description && (
                  <p className="text-xs text-t3 line-clamp-2">{list.description}</p>
                )}

                {/* CTA */}
                <div className="flex gap-2 pt-1 border-t border-line">
                  <button
                    onClick={() => setDetailId(list.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium text-brand hover:text-brand-text hover:bg-indigo-500/8 transition-all cursor-pointer"
                  >
                    <FolderOpen size={12} /> Ver Leads <ChevronRight size={11} />
                  </button>
                  <button
                    onClick={() => setEditList(list)}
                    className="flex items-center gap-1.5 py-2 px-3 rounded-xl text-xs font-medium text-t3 hover:text-t2 hover:bg-s3/50 transition-all cursor-pointer"
                    title="Editar lista"
                  >
                    <BarChart3 size={12} />
                  </button>
                </div>

                {/* Data */}
                <div className="flex items-center gap-1.5 -mt-2">
                  <Calendar size={10} className="text-t5" />
                  <span className="text-[10px] text-t5">
                    Criada em {new Date(list.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <LeadListForm isOpen={createOpen}           onClose={() => setCreateOpen(false)}   />
      <LeadListForm isOpen={Boolean(editList)}     onClose={() => setEditList(undefined)} list={editList} />

      <DeleteListModal
        list={deleteList}
        isOpen={Boolean(deleteList)}
        onClose={() => setDeleteList(undefined)}
        onConfirm={handleDelete}
      />

      {/* Modal limpeza de órfãos */}
      <Modal isOpen={cleanupOpen} onClose={() => setCleanupOpen(false)} title="Limpar contatos órfãos" size="sm">
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 p-3 bg-amber-500/8 border border-amber-500/20 rounded-xl">
            <AlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-t3">
              Remove contatos que foram importados em listas que <span className="font-semibold text-t1">já não existem mais</span> no sistema e não estão no funil principal.
            </p>
          </div>

          {cleanupLoading ? (
            <div className="flex items-center justify-center gap-2 py-3">
              <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-t4">Contando órfãos…</span>
            </div>
          ) : (
            <div className="flex items-center justify-between px-3 py-3 bg-s2/50 border border-line rounded-xl">
              <span className="text-xs text-t3">Contatos que serão excluídos</span>
              <span className={`text-sm font-bold tabular-nums ${(cleanupCount ?? 0) > 0 ? 'text-red-400' : 'text-t4'}`}>
                {(cleanupCount ?? 0).toLocaleString('pt-BR')}
              </span>
            </div>
          )}

          {cleanupCount === 0 && !cleanupLoading && (
            <p className="text-xs text-green-400 text-center">Nenhum contato órfão encontrado. Base limpa!</p>
          )}

          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setCleanupOpen(false)} disabled={cleaning}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={runCleanup}
              disabled={cleanupLoading || cleaning || (cleanupCount ?? 0) === 0}
            >
              {cleaning ? (
                <span className="flex items-center gap-1.5">
                  <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Limpando…
                </span>
              ) : `Excluir ${(cleanupCount ?? 0).toLocaleString('pt-BR')} contatos`}
            </Button>
          </div>
        </div>
      </Modal>
    </PageLayout>
  )
}
