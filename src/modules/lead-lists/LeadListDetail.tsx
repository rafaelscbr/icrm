import { useState, useEffect, useMemo } from 'react'
import {
  ArrowLeft, Database, Users, Upload, Search, Phone,
  ChevronLeft, ChevronRight, Pencil, Calendar,
  MapPin, Banknote, BedDouble, Trash2,
} from 'lucide-react'
import { PageLayout }    from '../../components/layout/PageLayout'
import { Card }          from '../../components/ui/Card'
import { Button }        from '../../components/ui/Button'
import { useLeadListsStore } from '../../store/useLeadListsStore'
import { LeadList, Contact } from '../../types'
import { formatPhone, whatsappUrl, formatCurrency } from '../../lib/formatters'
import { supabase } from '../../lib/supabase'
import { ImportLeadsModal }        from './ImportLeadsModal'
import { LeadListForm }            from './LeadListForm'
import { DeleteLeadFromListModal } from './DeleteLeadFromListModal'
import { batchLeadScores, LeadScoreResult } from '../../lib/leadScore'
import { ScoreBadge } from '../../components/ui/ScoreBadge'

const PAGE_SIZE = 50

interface Props {
  list:   LeadList
  onBack: () => void
}

interface MemberWithContact {
  contactId:   string
  importedAt:  string
  importBatch?: string
  contact:     Contact | null
}

export function LeadListDetail({ list, onBack }: Props) {
  const { loadMembers, lists } = useLeadListsStore()
  const currentList = lists.find(l => l.id === list.id) ?? list

  const [members,       setMembers]       = useState<MemberWithContact[]>([])
  const [scores,        setScores]        = useState<Map<string, LeadScoreResult>>(new Map())
  const [loading,       setLoading]       = useState(true)
  const [search,        setSearch]        = useState('')
  const [page,          setPage]          = useState(1)
  const [importOpen,    setImportOpen]    = useState(false)
  const [editOpen,      setEditOpen]      = useState(false)
  const [deleteLead,    setDeleteLead]    = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    loadData()
  }, [list.id])

  async function loadData() {
    setLoading(true)
    try {
      const membersList = await loadMembers(list.id)

      // Buscar contatos em chunks
      const CHUNK = 500
      const contactMap = new Map<string, Contact>()
      const contactIds = membersList.map(m => m.contactId)

      for (let i = 0; i < contactIds.length; i += CHUNK) {
        const chunk = contactIds.slice(i, i + CHUNK)
        const { data } = await supabase
          .from('contacts')
          .select('id, name, phone, company')
          .in('id', chunk)
        if (data) {
          (data as { id: string; name: string; phone: string; company: string | null }[])
            .forEach(c => contactMap.set(c.id, {
              id: c.id, name: c.name, phone: c.phone,
              company: c.company ?? undefined,
              tags: [], hasChildren: false, isMarried: false, permutaItems: [],
              createdAt: '', updatedAt: '',
            }))
        }
      }

      const builtMembers = membersList.map(m => ({
        contactId:   m.contactId,
        importedAt:  m.importedAt,
        importBatch: m.importBatch,
        contact:     contactMap.get(m.contactId) ?? null,
      }))
      setMembers(builtMembers)

      // Calcular scores em batch após carregar contatos
      const batchInput = builtMembers
        .filter(m => m.contact)
        .map(m => ({ contactId: m.contactId, phone: m.contact!.phone }))
      batchLeadScores(batchInput).then(setScores).catch(() => {})
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return members
    const q = search.toLowerCase()
    return members.filter(m =>
      m.contact?.name?.toLowerCase().includes(q) ||
      m.contact?.phone?.includes(q)
    )
  }, [members, search])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const profile = currentList.productProfile

  return (
    <PageLayout
      title={currentList.name}
      subtitle={`${currentList.totalCount.toLocaleString()} leads · Base de Leads`}
    >
      {/* Breadcrumb */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-t4 hover:text-t1 transition-colors mb-6 cursor-pointer"
      >
        <ArrowLeft size={14} />
        Voltar às listas
      </button>

      {/* Cabeçalho da lista */}
      <div className="flex flex-col lg:flex-row lg:items-start gap-4 mb-8">
        <Card className="flex-1 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
                <Database size={18} className="text-blue-400" />
              </div>
              <div>
                <h2 className="text-base font-bold text-t1">{currentList.name}</h2>
                {currentList.description && (
                  <p className="text-xs text-t4 mt-0.5">{currentList.description}</p>
                )}
              </div>
            </div>
            <button
              onClick={() => setEditOpen(true)}
              className="p-1.5 rounded-lg hover:bg-s3/70 text-t4 hover:text-t1 transition-colors cursor-pointer flex-shrink-0"
            >
              <Pencil size={14} />
            </button>
          </div>

          {/* Perfil do produto */}
          {profile && Object.keys(profile).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {profile.type && (
                <span className="flex items-center gap-1 text-[11px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded-lg px-2 py-1">
                  <Database size={10} /> {profile.type}
                </span>
              )}
              {profile.region && (
                <span className="flex items-center gap-1 text-[11px] bg-s3/50 text-t3 border border-line rounded-lg px-2 py-1">
                  <MapPin size={10} /> {profile.region}
                </span>
              )}
              {(profile.valueMin || profile.valueMax) && (
                <span className="flex items-center gap-1 text-[11px] bg-s3/50 text-t3 border border-line rounded-lg px-2 py-1">
                  <Banknote size={10} />
                  {profile.valueMin ? formatCurrency(profile.valueMin) : ''}
                  {profile.valueMin && profile.valueMax ? ' – ' : ''}
                  {profile.valueMax ? formatCurrency(profile.valueMax) : ''}
                </span>
              )}
              {profile.bedrooms && (
                <span className="flex items-center gap-1 text-[11px] bg-s3/50 text-t3 border border-line rounded-lg px-2 py-1">
                  <BedDouble size={10} /> {profile.bedrooms} quartos
                </span>
              )}
              {profile.source && (
                <span className="flex items-center gap-1 text-[11px] bg-s3/50 text-t3 border border-line rounded-lg px-2 py-1">
                  {profile.source}
                </span>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 text-xs text-t4">
            <Calendar size={12} />
            Criada em {new Date(currentList.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
          </div>
        </Card>

        {/* Stat + ação importar */}
        <div className="flex flex-col gap-3 lg:w-56">
          <Card className="!py-4 text-center">
            <Users size={18} className="mx-auto text-blue-400 mb-1.5" />
            <p className="text-2xl font-bold tabular-nums text-blue-400">{currentList.totalCount.toLocaleString()}</p>
            <p className="text-xs text-t4">Total de leads</p>
          </Card>
          <Button className="w-full gap-2" onClick={() => setImportOpen(true)}>
            <Upload size={14} /> Importar XLSX
          </Button>
        </div>
      </div>

      {/* Busca + tabela */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-t4" />
            <input
              className="w-full bg-s2 border border-line rounded-xl pl-9 pr-4 py-2 text-sm text-t1 placeholder:text-t4 focus:outline-none focus:border-brand transition-colors"
              placeholder="Buscar por nome ou telefone…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
          <span className="text-xs text-t4 flex-shrink-0">
            {filtered.length.toLocaleString()} resultados
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="border border-line rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-s2/70 border-b border-line">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-t4">Nome</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-t4">Telefone</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-t4 hidden lg:table-cell">Lote</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-t4 hidden lg:table-cell">Importado em</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-t4 hidden md:table-cell">Score</th>
                  <th className="px-4 py-3 text-xs font-semibold text-t4 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {paged.map((m, i) => (
                  <tr
                    key={m.contactId}
                    className={`border-t border-line/50 hover:bg-s2/30 transition-colors ${i % 2 === 0 ? '' : 'bg-s2/10'}`}
                  >
                    <td className="px-4 py-3">
                      <span className="text-t1 font-medium">{m.contact?.name ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-t3 font-mono text-xs">
                        {m.contact?.phone ? formatPhone(m.contact.phone) : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs text-t4 truncate max-w-[120px] block">{m.importBatch ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs text-t4">
                        {new Date(m.importedAt).toLocaleDateString('pt-BR')}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-center">
                      {scores.get(m.contactId)
                        ? <ScoreBadge size="sm" {...scores.get(m.contactId)!} />
                        : <span className="text-[10px] text-t4">—</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {m.contact?.phone && (
                          <a
                            href={whatsappUrl(m.contact.phone)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg hover:bg-green-500/10 text-t4 hover:text-green-400 transition-colors inline-flex"
                            title="Abrir no WhatsApp"
                          >
                            <Phone size={13} />
                          </a>
                        )}
                        <button
                          onClick={() => setDeleteLead({ id: m.contactId, name: m.contact?.name ?? 'Lead' })}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-t4 hover:text-red-400 transition-colors inline-flex"
                          title="Remover lead"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {paged.length === 0 && (
              <div className="text-center py-12 text-t4 text-sm">
                {search ? 'Nenhum lead encontrado para essa busca.' : 'Nenhum lead nesta lista ainda.'}
              </div>
            )}

            {/* Paginação */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-line bg-s2/30">
                <span className="text-xs text-t4">
                  Página {page} de {totalPages} · {filtered.length.toLocaleString()} leads
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1.5 rounded-lg hover:bg-s3/70 text-t4 hover:text-t1 transition-colors disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-1.5 rounded-lg hover:bg-s3/70 text-t4 hover:text-t1 transition-colors disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <ImportLeadsModal
        listId={list.id}
        listName={currentList.name}
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onSuccess={() => { setImportOpen(false); loadData() }}
      />

      <LeadListForm
        isOpen={editOpen}
        onClose={() => { setEditOpen(false) }}
        list={currentList}
      />

      <DeleteLeadFromListModal
        contactId={deleteLead?.id ?? ''}
        contactName={deleteLead?.name ?? ''}
        listId={list.id}
        listName={currentList.name}
        isOpen={Boolean(deleteLead)}
        onClose={() => setDeleteLead(null)}
        onDone={() => { setDeleteLead(null); loadData() }}
      />
    </PageLayout>
  )
}
