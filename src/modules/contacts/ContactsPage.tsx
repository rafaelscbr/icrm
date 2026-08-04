import { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, MessageCircle, Pencil, Trash2, Users, ClipboardList, ListFilter, Cake, Plus} from 'lucide-react'
import { PageLayout } from '../../components/layout/PageLayout'
import { ListContainer } from '../../components/ui/ListContainer'
import { Button } from '../../components/ui/Button'
import { Avatar } from '../../components/ui/Avatar'
import { EstadoTela } from '../../components/shared/EstadoTela'
import { aoTeclarAbrir } from '../../components/shared/lista'
import { CabecalhoLista, AcoesLinha, celula } from '../../components/shared/lista'
import type { Coluna } from '../../components/shared/lista'
import { Modal } from '../../components/ui/Modal'
import { ContactForm } from './ContactForm'
import { ContactModal } from './ContactModal'
import { TasksLinkedModal } from '../../components/shared/TasksLinkedModal'
import { useContactsStore } from '../../store/useContactsStore'
import { useTasksStore } from '../../store/useTasksStore'
import { useLeadsStore } from '../../store/useLeadsStore'
import { Contact, ContactTag } from '../../types'
import { formatPhone, whatsappUrl, isBirthdayThisMonth } from '../../lib/formatters'
import toast from 'react-hot-toast'

const TAG_LABELS: Record<ContactTag, string> = {
  owner: 'Proprietário',
  investor: 'Investidor',
  buyer: 'Já comprou',
}


const FILTER_OPTIONS: { value: ContactTag | null; label: string }[] = [
  { value: null, label: 'Todos' },
  { value: 'owner', label: 'Proprietários' },
  { value: 'investor', label: 'Investidores' },
  { value: 'buyer', label: 'Compradores' },
]

const PAGE_SIZE = 20

/**
 * Só uma coluna de conteúdo, de propósito.
 *
 * A primeira versão desta lista deu coluna fixa para "Situação" e "Etiquetas".
 * Medido no banco: **59 dos 12.578 contatos têm etiqueta — 0,47%**. Seriam duas
 * colunas com travessão em 99,5% das linhas, ou seja, ruído com rótulo.
 *
 * Coluna fixa só se paga quando o dado costuma existir. Quando é exceção, quem
 * se marca é a exceção: situação e etiqueta aparecem ao lado do nome apenas nas
 * linhas em que existem.
 */
const COLUNAS_CONTATO: Coluna[] = [
  { chave: 'nome', rotulo: 'Contato', largura: 'flex-1' },
]

export function ContactsPage() {
  const { contacts, load, remove, search, filterByTag, loading, erro } = useContactsStore()
  const { tasks } = useTasksStore()
  const { leads } = useLeadsStore()
  // Um Set em vez de varrer o array de leads a cada linha: a lista pagina 12.578
  // contatos e o `some` rodava por linha renderizada.
  const contatosEmFunil = useMemo(
    () => new Set(leads.filter(l => !l.discardReason && l.contactId).map(l => l.contactId!)),
    [leads]
  )
  const emFunil = (id: string) => contatosEmFunil.has(id)
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState<ContactTag | null>(null)
  const [onlyWithTasks, setOnlyWithTasks] = useState(false)
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Contact | undefined>()
  const [deleteTarget, setDeleteTarget] = useState<Contact | undefined>()
  const [tasksContact, setTasksContact] = useState<Contact | undefined>()
  const [viewContact, setViewContact] = useState<Contact | undefined>()

  useEffect(() => { load() }, [load])

  // Abre modal automaticamente se vier ?open=<id> na URL
  useEffect(() => {
    const openId = searchParams.get('open')
    if (openId && contacts.length > 0) {
      const found = contacts.find(c => c.id === openId)
      if (found) {
        setViewContact(found)
        setSearchParams({}, { replace: true })
      }
    }
  }, [searchParams, contacts, setSearchParams])

  const filtered = (() => {
    let result = query.trim() ? search(query) : filterByTag(activeTag)
    if (onlyWithTasks) {
      result = result.filter(c => tasks.some(t => t.contactId === c.id && t.status !== 'done'))
    }
    return result
  })()

  const total = filtered.length
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const totalPages = Math.ceil(total / PAGE_SIZE)

  function handleDelete() {
    if (!deleteTarget) return
    remove(deleteTarget.id)
    toast.success('Contato excluído')
    setDeleteTarget(undefined)
  }

  return (
    <PageLayout
      icon={Users}
      iconTom="info"
      title="Contatos"
      // Com a leitura falhando, `contacts.length` é 0 por falta de dado, não
      // por não existir contato. O subtítulo não pode afirmar um total que não
      // foi lido.
      subtitle={erro
        ? 'não foi possível ler a base'
        : `${contacts.length.toLocaleString('pt-BR')} contatos cadastrados`}
      ctaLabel="Novo Contato"
      onCta={() => { setEditing(undefined); setFormOpen(true) }}
    >
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-t3" />
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setPage(1) }}
            placeholder="Buscar contato..."
            className="w-full bg-s3/50 border border-line rounded-xl pl-9 pr-4 py-3 text-sm text-slate-100 placeholder:text-t4 focus:outline-none focus:ring-2 focus:ring-brand/25 focus:border-indigo-500/50 transition-all min-h-[44px]"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-0.5 sm:pb-0">
          {FILTER_OPTIONS.map(opt => (
            <button
              key={String(opt.value)}
              onClick={() => { setActiveTag(opt.value); setQuery(''); setPage(1) }}
              className={`
                flex-shrink-0 px-4 py-2.5 rounded-xl text-xs font-medium border transition-all duration-150 cursor-pointer min-h-[44px]
                ${activeTag === opt.value && !query
                  ? 'bg-brand-tint border-brand/40 text-brand-text'
                  : 'bg-s3/50 border-line text-t3 hover:text-t2'
                }
              `}
            >
              {opt.label}
            </button>
          ))}
          <button
            onClick={() => { setOnlyWithTasks(v => !v); setPage(1) }}
            className={`
              flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium border transition-all duration-150 cursor-pointer min-h-[44px]
              ${onlyWithTasks
                ? 'bg-warning-bg border-warning-line text-warning'
                : 'bg-s3/50 border-line text-t3 hover:text-t2'
              }
            `}
          >
            <ListFilter size={12} /> Com tarefas
          </button>
        </div>
      </div>

      {/* Lista — carregando, falhou e vazio passam pela mesma tríade. Falha
          NUNCA pode virar "nenhum contato": ver EstadoTela. */}
      <EstadoTela
        carregando={loading && contacts.length === 0}
        erro={erro}
        vazio={paginated.length === 0}
        onTentarDeNovo={() => { void load() }}
        icone={Users}
        titulo={query || activeTag || onlyWithTasks
          ? 'Nenhum contato com esses filtros'
          : 'Nenhum contato cadastrado'}
        descricao={query || activeTag || onlyWithTasks
          ? 'Ajuste a busca ou os filtros para ver outros contatos.'
          : 'Adicione seu primeiro contato para começar a gerenciar sua rede.'}
        acao={!query && !activeTag && !onlyWithTasks && (
          <Button onClick={() => { setEditing(undefined); setFormOpen(true) }} className="gap-2">
            <Plus size={14} /> Novo contato
          </Button>
        )}
      >
        <ListContainer>
          <CabecalhoLista colunas={COLUNAS_CONTATO} antes="w-10" depois="w-[132px]" className="hidden sm:flex" />
          {paginated.map((c, i) => (
            <div
              key={c.id}
              onClick={() => setViewContact(c)}
              role="button"
              tabIndex={0}
              onKeyDown={aoTeclarAbrir(() => setViewContact(c))}
              aria-label={`Abrir ${c.name}`}
              className={`
                group flex items-center gap-4 px-6 py-3.5 transition-colors hover:bg-s3/50 row-accent cursor-pointer
                ${i < paginated.length - 1 ? 'border-b border-line' : ''}
              `}
            >
              <Avatar name={c.name} photoUrl={c.photoUrl} size="md" />
              <div className={celula(COLUNAS_CONTATO[0])}>
                <div className="flex items-center gap-2 mb-0.5 min-w-0">
                  <p className="font-heading text-[14px] font-bold text-t1 truncate">{c.name}</p>
                  {c.birthdate && isBirthdayThisMonth(c.birthdate) && (
                    <Cake size={13} className="text-brand flex-shrink-0" aria-label="Aniversário neste mês" />
                  )}
                  {/* Estar em negociação é um ESTADO que muda e pede ação —
                      fica com forma. Etiqueta é classificação estável, e desce
                      para a linha de contexto como texto. */}
                  {emFunil(c.id) && (
                    <span className="flex-shrink-0 inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-[8px]
                                     bg-brand-tint text-brand-text border border-brand/30">
                      em funil
                    </span>
                  )}
                </div>
                <p className="text-[13px] text-t3 truncate">
                  <span className="tabular-nums">{formatPhone(c.phone)}</span>
                  {c.company && <> · {c.company}</>}
                  {c.tags.length > 0 && (
                    <span className="text-t4"> · {c.tags.map(t => TAG_LABELS[t]).join(', ')}</span>
                  )}
                </p>
              </div>

              {/* WhatsApp e tarefas ficam SEMPRE visíveis: são o motivo de a
                  lista existir, e escondê-los no hover custaria um gesto a
                  cada linha. Editar e excluir, que são raros e um deles é
                  destrutivo, aparecem no hover e no foco. */}
              {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- invólucro que só contém a propagação do clique — quem age são os botões dentro */}
              <div className="w-[132px] flex-shrink-0 flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                {/* Badge de tarefas vinculadas */}
                {(() => {
                  const count = tasks.filter(t => t.contactId === c.id).length
                  return (
                    <button
                      onClick={() => setTasksContact(c)}
                      aria-label={count > 0
                        ? `Ver ${count} tarefa${count !== 1 ? 's' : ''} de ${c.name}`
                        : `Ver tarefas de ${c.name}`}
                      title="Tarefas vinculadas"
                      className="relative w-9 h-9 flex items-center justify-center rounded-lg
                                 text-t4 hover:text-brand-text hover:bg-brand-tint transition-colors
                                 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                    >
                      <ClipboardList size={15} strokeWidth={1.7} aria-hidden />
                      {count > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-brand
                                         rounded-full text-[11px] font-bold text-[var(--brand-btn-text)]
                                         flex items-center justify-center tabular-nums">
                          {count > 9 ? '9+' : count}
                        </span>
                      )}
                    </button>
                  )
                })()}
                <a
                  href={whatsappUrl(c.phone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Abrir WhatsApp de ${c.name}`}
                  title="Abrir WhatsApp"
                  className="w-9 h-9 flex items-center justify-center rounded-lg border border-success-line
                             bg-success-bg text-success hover:brightness-115 transition-all
                             focus:outline-none focus-visible:ring-2 focus-visible:ring-success/40"
                >
                  <MessageCircle size={15} strokeWidth={1.7} aria-hidden />
                </a>
                <AcoesLinha largura="w-[76px]">
                  <button
                    onClick={() => { setEditing(c); setFormOpen(true) }}
                    aria-label={`Editar ${c.name}`}
                    title="Editar"
                    className="w-9 h-9 flex items-center justify-center rounded-lg text-t4 hover:text-t2
                               hover:bg-s3/70 transition-colors cursor-pointer
                               focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                  >
                    <Pencil size={15} strokeWidth={1.7} aria-hidden />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(c)}
                    aria-label={`Excluir ${c.name}`}
                    title="Excluir"
                    className="w-9 h-9 flex items-center justify-center rounded-lg text-t4 hover:text-error
                               hover:bg-error-bg transition-colors cursor-pointer
                               focus:outline-none focus-visible:ring-2 focus-visible:ring-error/30"
                  >
                    <Trash2 size={15} strokeWidth={1.7} aria-hidden />
                  </button>
                </AcoesLinha>
              </div>
            </div>
          ))}
        </ListContainer>
      </EstadoTela>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-xs text-t3">
            Exibindo {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} de {total}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              ← Anterior
            </Button>
            <Button variant="secondary" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
              Próximo →
            </Button>
          </div>
        </div>
      )}

      {/* Modal de detalhes do contato */}
      <ContactModal
        isOpen={Boolean(viewContact)}
        onClose={() => setViewContact(undefined)}
        contact={viewContact}
      />

      {/* Form modal */}
      <ContactForm
        key={editing?.id ?? 'new'}
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        contact={editing}
      />

      {/* Modal de tarefas vinculadas */}
      <TasksLinkedModal
        isOpen={Boolean(tasksContact)}
        onClose={() => setTasksContact(undefined)}
        title={tasksContact?.name ?? ''}
        subtitle={[tasksContact?.company, tasksContact?.phone].filter(Boolean).join(' · ')}
        contactId={tasksContact?.id}
      />

      {/* Delete confirm */}
      <Modal isOpen={Boolean(deleteTarget)} onClose={() => setDeleteTarget(undefined)} title="Excluir contato" size="sm">
        <p className="text-sm text-t3 mb-6">
          Tem certeza que deseja excluir <span className="text-t1 font-medium">{deleteTarget?.name}</span>? Esta ação não pode ser desfeita.
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setDeleteTarget(undefined)}>
            Cancelar
          </Button>
          <Button variant="danger" className="flex-1" onClick={handleDelete}>
            Excluir
          </Button>
        </div>
      </Modal>
    </PageLayout>
  )
}
