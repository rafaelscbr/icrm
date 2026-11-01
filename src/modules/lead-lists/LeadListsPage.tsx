import { useEffect, useState } from 'react'
import {
  Database, Archive, Pencil, Trash2, ArrowRight, Sparkles, AlertTriangle,
  Trophy, Plus, ChevronRight,
} from 'lucide-react'
import { PageLayout }    from '../../components/layout/PageLayout'
import { FaixaNumeros, Segmentado } from '../../components/shared/visual'
import { ListContainer } from '../../components/ui/ListContainer'
import { Modal }         from '../../components/ui/Modal'
import { Button }        from '../../components/ui/Button'
import { EstadoTela }    from '../../components/shared/EstadoTela'
import { Abas } from '../../components/shared/Abas'
import { EsqueletoLinhas } from '../../components/shared/Esqueleto'
import { mensagemDeErro } from '../../lib/erros'
import { useLeadListsStore } from '../../store/useLeadListsStore'
import { useAuthStore } from '../../store/useAuthStore'
import { LeadList, PROPERTY_TYPE_LABEL } from '../../types'
import { LeadListForm }  from './LeadListForm'
import { LeadListDetail } from './LeadListDetail'
import { DeleteListModal } from './DeleteListModal'
import { supabase }      from '../../lib/supabase'
import { batchListScores, ListScoreResult } from '../../lib/listScore'
import toast             from 'react-hot-toast'

export function LeadListsPage() {
  const { lists, loading, erro, load, remove, archive } = useLeadListsStore()
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
  const [erroScore,     setErroScore]     = useState<string | null>(null)
  // Lista sem score não é lista "calculando": quando o lote termina e uma
  // lista fica de fora, ela recebe "sem score" em vez de um spinner eterno.
  const [scoresProntos, setScoresProntos] = useState(false)

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (lists.length === 0) return
    const ids = lists.filter(l => l.status === 'active').map(l => l.id)
    setErroScore(null)
    setScoresProntos(false)
    // O `.catch(() => {})` daqui era silencioso: quando o cálculo falhava, o
    // quadro do score girava para sempre e a tela afirmava "carregando" sobre
    // algo que nunca ia chegar.
    batchListScores(ids).then(m => { setListScores(m); setScoresProntos(true) }).catch(err => {
      console.error('[leadLists] batchListScores:', err)
      setErroScore(mensagemDeErro(err))
    })
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

  async function handleArchive(list: LeadList) {
    try {
      await archive(list.id)
      toast.success('Lista arquivada')
    } catch {
      // upsert já mostrou o erro; a lista continua em Ativas.
    }
  }

  async function openCleanup() {
    setCleanupOpen(true)
    setCleanupCount(null)
    setCleanupLoading(true)
    try {
      // Conta órfãos: is_base_lead=true, sem lista ativa, sem funil ativo
      const { count, error } = await supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('is_base_lead', true)
        .filter('id', 'not.in', `(select contact_id from lead_list_members)`)
        .filter('id', 'not.in', `(select contact_id from leads where discard_reason is null and contact_id is not null)`)
      if (error) throw error
      setCleanupCount(count ?? 0)
    } catch (err) {
      // Antes virava 0 e a tela dizia "Base limpa!" sem ter conseguido contar.
      toast.error(`Não foi possível contar os órfãos: ${mensagemDeErro(err)}`)
      setCleanupOpen(false)
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
        const { data, error: erroBusca } = await supabase
          .from('contacts')
          .select('id')
          .eq('is_base_lead', true)
          .filter('id', 'not.in', `(select contact_id from lead_list_members)`)
          .filter('id', 'not.in', `(select contact_id from leads where discard_reason is null and contact_id is not null)`)
          .limit(CHUNK)
        if (erroBusca) throw erroBusca
        if (!data || data.length === 0) break
        const ids = (data as { id: string }[]).map(r => r.id)
        const { error: erroApagar } = await supabase.from('contacts').delete().in('id', ids)
        if (erroApagar) throw erroApagar
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
      subtitle={erro
        ? 'não foi possível ler as listas'
        : 'Gerencie suas listas de leads frios e conecte-as a campanhas'}
      ctaLabel="Nova Lista"
      onCta={() => setCreateOpen(true)}
      band={
        <Abas
          abas={[
            { value: 'active'   as const, label: 'Ativas',     icon: Database, badge: lists.filter(l => l.status === 'active').length || undefined },
            { value: 'archived' as const, label: 'Arquivadas', icon: Archive },
          ]}
          valor={tab}
          onChange={setTab}
          rotulo="Situação das listas"
          variante="sublinhado"
        />
      }
      actions={
        <Button variant="ghost" size="sm" onClick={openCleanup} className="gap-1.5"
                title="Limpar contatos órfãos de listas excluídas">
          <Sparkles size={14} strokeWidth={1.8} aria-hidden /> <span className="hidden md:inline">Limpar órfãos</span>
        </Button>
      }
    >
      {lists.length > 0 && (
        <FaixaNumeros className="mb-5" itens={[
          { rotulo: 'Listas ativas', valor: totalLists.toLocaleString('pt-BR') },
          { rotulo: 'Leads na base', valor: totalLeads.toLocaleString('pt-BR') },
          { rotulo: 'Maior lista',   valor: biggestList ? biggestList.totalCount.toLocaleString('pt-BR') : '—',
            nota: biggestList?.name },
        ]} />
      )}

      {tab === 'active' && visible.length > 1 && (
        <div className="flex items-center justify-end mb-3">
          <Segmentado
            rotulo="Ordem das listas"
            valor={sortByScore ? 'score' : 'recentes'}
            onChange={v => setSortByScore(v === 'score')}
            opcoes={[{ value: 'recentes', label: 'Recentes' }, { value: 'score', label: 'Melhor score' }]}
          />
        </div>
      )}

      <EstadoTela
        esqueleto={<EsqueletoLinhas linhas={6} />}
        carregando={loading && lists.length === 0}
        erro={erro}
        vazio={visible.length === 0}
        onTentarDeNovo={() => { void load() }}
        icone={Database}
        titulo={tab === 'active' ? 'Nenhuma lista criada' : 'Nenhuma lista arquivada'}
        descricao={tab === 'active'
          ? 'Importe planilhas de leads frios para criar uma lista e conectar a campanhas.'
          : 'Listas arquivadas aparecem aqui.'}
        acao={tab === 'active' && (
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus size={14} /> Nova lista
          </Button>
        )}
      >
        <ListContainer>
          {visible.map(list => {
            const profile    = list.productProfile
            const listScore  = listScores.get(list.id)
            const vendas     = listScore?.clients ?? 0
            const perfil = [
              profile?.type ? (PROPERTY_TYPE_LABEL as Record<string, string>)[profile.type] ?? profile.type : null,
              profile?.region,
              profile?.bedrooms ? `${profile.bedrooms}q` : null,
              profile?.valueMin ? `a partir de R$ ${(profile.valueMin / 1000).toFixed(0)}k` : null,
            ].filter(Boolean).join(' · ')
            const dono = isAdmin && list.brokerId
              ? allProfiles.find(p => p.id === list.brokerId)?.name ?? 'Corretor'
              : null

            return (
              <div key={list.id}
                className="lista-linha group flex items-center gap-4 px-5 py-3.5 border-b border-line last:border-0 transition-colors">
                <button onClick={() => setDetailId(list.id)}
                  className="flex-1 min-w-0 text-left cursor-pointer focus:outline-none focus-visible:underline">
                  <p className="flex items-center gap-2 min-w-0">
                    <span className="text-[14.5px] font-semibold text-t1 truncate">{list.name}</span>
                    {vendas > 0 && (
                      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-success shrink-0">
                        <Trophy size={12} strokeWidth={1.8} aria-hidden /> {vendas} venda{vendas > 1 ? 's' : ''}
                      </span>
                    )}
                  </p>
                  <p className="text-[12.5px] text-t4 truncate mt-0.5">
                    {perfil || 'Sem perfil definido'}
                    {dono && <> · {dono}</>}
                  </p>
                </button>

                <div className="hidden md:block text-right min-w-[84px] shrink-0">
                  <p className="text-[14px] font-semibold text-t1 tabular-nums leading-tight">
                    {listScore ? listScore.score : erroScore ? '—' : scoresProntos ? '—' : '…'}
                  </p>
                  <p className={`text-[11.5px] leading-tight mt-0.5 ${listScore ? listScore.color : erroScore ? 'text-error' : 'text-t4'}`}
                     title={erroScore ?? undefined}>
                    {listScore ? listScore.label : erroScore ? 'score indisponível' : scoresProntos ? 'sem score' : 'calculando'}
                  </p>
                </div>

                <div className="text-right min-w-[72px] shrink-0">
                  <p className="text-[14px] font-semibold text-t1 tabular-nums leading-tight">
                    {list.totalCount.toLocaleString('pt-BR')}
                  </p>
                  <p className="text-[11.5px] text-t4 leading-tight mt-0.5">leads</p>
                </div>

                <div className="hidden sm:flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                  {list.status === 'active' && (
                    <button onClick={() => handleArchive(list)} aria-label="Arquivar lista"
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-s3/70 text-t4 hover:text-t2 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand/30">
                      <Archive size={14} strokeWidth={1.8} />
                    </button>
                  )}
                  <button onClick={() => setEditList(list)} aria-label="Editar lista"
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-s3/70 text-t4 hover:text-t2 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand/30">
                    <Pencil size={14} strokeWidth={1.8} />
                  </button>
                  <button onClick={() => setDeleteList(list)} aria-label="Excluir lista"
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-error-bg text-t4 hover:text-error transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-error/30">
                    <Trash2 size={14} strokeWidth={1.8} />
                  </button>
                </div>

                <Button variant="secondary" size="sm" onClick={() => setDetailId(list.id)} className="gap-1.5 shrink-0 !hidden sm:!inline-flex">
                  Abrir <ArrowRight size={13} strokeWidth={1.8} aria-hidden />
                </Button>
                <ChevronRight size={16} strokeWidth={1.8} className="sm:hidden text-t4 shrink-0" aria-hidden />
              </div>
            )
          })}
        </ListContainer>
      </EstadoTela>

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
          <div className="flex items-start gap-3 p-3 bg-warning-bg border border-warning-line rounded-xl">
            <AlertTriangle size={16} className="text-warning flex-shrink-0 mt-0.5" />
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
              <span className={`text-sm font-bold tabular-nums ${(cleanupCount ?? 0) > 0 ? 'text-error' : 'text-t4'}`}>
                {(cleanupCount ?? 0).toLocaleString('pt-BR')}
              </span>
            </div>
          )}

          {cleanupCount === 0 && !cleanupLoading && (
            <p className="text-[13px] text-success text-center">Nenhum contato órfão encontrado.</p>
          )}

          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setCleanupOpen(false)} disabled={cleaning}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={runCleanup}
              disabled={cleanupLoading || (cleanupCount ?? 0) === 0}
              carregando={cleaning}
            >
              {cleaning ? 'Limpando…' : `Excluir ${(cleanupCount ?? 0).toLocaleString('pt-BR')} contatos`}
            </Button>
          </div>
        </div>
      </Modal>
    </PageLayout>
  )
}
