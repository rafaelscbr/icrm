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
import { LeadList }      from '../../types'
import { LeadListForm }  from './LeadListForm'
import { LeadListDetail } from './LeadListDetail'
import { DeleteListModal } from './DeleteListModal'
import { supabase }      from '../../lib/supabase'
import toast             from 'react-hot-toast'

export function LeadListsPage() {
  const { lists, loading, load, remove, archive } = useLeadListsStore()
  const [tab,           setTab]           = useState<'active' | 'archived'>('active')
  const [createOpen,    setCreateOpen]    = useState(false)
  const [editList,      setEditList]      = useState<LeadList | undefined>()
  const [deleteList,    setDeleteList]    = useState<LeadList | undefined>()
  const [detailId,      setDetailId]      = useState<string>('')
  const [cleanupOpen,   setCleanupOpen]   = useState(false)
  const [cleanupCount,  setCleanupCount]  = useState<number | null>(null)
  const [cleanupLoading,setCleanupLoading]= useState(false)
  const [cleaning,      setCleaning]      = useState(false)

  useEffect(() => { load() }, [load])

  if (detailId) {
    const list = lists.find(l => l.id === detailId)
    if (list) return <LeadListDetail list={list} onBack={() => setDetailId('')} />
  }

  const visible = lists.filter(l => l.status === tab)

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
              <p className="text-xs text-slate-500 mb-1">{s.label}</p>
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
              ${tab === t.value ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
          >
            {t.icon} {t.label}
            {t.value === 'active' && lists.filter(l => l.status === 'active').length > 0 && (
              <span className="ml-1 bg-white/20 rounded-full px-1.5 text-[10px] font-bold">
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
            const profile = list.productProfile
            return (
              <Card key={list.id} className="group flex flex-col gap-4 hover:border-brand/25 transition-all duration-200 border border-line">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 bg-blue-500/10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Database size={15} className="text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-200 truncate">{list.name}</p>
                      {profile?.region || profile?.type ? (
                        <p className="text-[10px] text-slate-500 truncate mt-0.5">
                          {[profile.type, profile.region, profile.bedrooms ? `${profile.bedrooms}q` : null]
                            .filter(Boolean).join(' · ')}
                        </p>
                      ) : (
                        <p className="text-[10px] text-slate-600 mt-0.5">Sem perfil definido</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    {list.status === 'active' && (
                      <button onClick={() => archive(list.id)} title="Arquivar"
                        className="p-1.5 rounded-lg hover:bg-s3/70 text-slate-600 hover:text-slate-300 transition-colors cursor-pointer">
                        <Archive size={13} />
                      </button>
                    )}
                    <button onClick={() => setEditList(list)}
                      className="p-1.5 rounded-lg hover:bg-s3/70 text-slate-600 hover:text-slate-300 transition-colors cursor-pointer">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => setDeleteList(list)}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-colors cursor-pointer">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Contagem + descrição */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col items-center py-2.5 bg-s2/50 rounded-xl border border-line">
                    <Users size={11} className="text-slate-600 mb-1" />
                    <span className="text-sm font-bold tabular-nums text-blue-400">{list.totalCount.toLocaleString()}</span>
                    <span className="text-[10px] text-slate-600">Leads</span>
                  </div>
                  <div className="flex flex-col items-center py-2.5 bg-s2/50 rounded-xl border border-line">
                    <TrendingUp size={11} className="text-slate-600 mb-1" />
                    <span className="text-sm font-bold tabular-nums text-slate-400">
                      {profile?.valueMin ? `R$ ${(profile.valueMin / 1000).toFixed(0)}k` : '—'}
                    </span>
                    <span className="text-[10px] text-slate-600">Ticket mín</span>
                  </div>
                </div>

                {list.description && (
                  <p className="text-xs text-slate-500 line-clamp-2">{list.description}</p>
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
                    className="flex items-center gap-1.5 py-2 px-3 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-300 hover:bg-s3/50 transition-all cursor-pointer"
                    title="Editar lista"
                  >
                    <BarChart3 size={12} />
                  </button>
                </div>

                {/* Data */}
                <div className="flex items-center gap-1.5 -mt-2">
                  <Calendar size={10} className="text-slate-700" />
                  <span className="text-[10px] text-slate-700">
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
    </PageLayout>
  )
}
