import { useEffect, useState } from 'react'
import { Search, MessageCircle, Pencil, Trash2, Users, ClipboardList, ListFilter } from 'lucide-react'
import { PageLayout } from '../../components/layout/PageLayout'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Avatar } from '../../components/ui/Avatar'
import { EmptyState } from '../../components/ui/EmptyState'
import { Modal } from '../../components/ui/Modal'
import { ContactForm } from './ContactForm'
import { ContactModal } from './ContactModal'
import { TasksLinkedModal } from '../../components/shared/TasksLinkedModal'
import { useContactsStore } from '../../store/useContactsStore'
import { useTasksStore } from '../../store/useTasksStore'
import { Contact, ContactTag } from '../../types'
import { formatPhone, whatsappUrl, isBirthdayThisMonth } from '../../lib/formatters'
import toast from 'react-hot-toast'

const TAG_LABELS: Record<ContactTag, string> = {
  owner: 'Proprietário',
  investor: 'Investidor',
  buyer: 'Já comprou',
}

const TAG_VARIANTS: Record<ContactTag, 'indigo' | 'purple' | 'green'> = {
  owner: 'indigo',
  investor: 'purple',
  buyer: 'green',
}

const FILTER_OPTIONS: { value: ContactTag | null; label: string }[] = [
  { value: null, label: 'Todos' },
  { value: 'owner', label: 'Proprietários' },
  { value: 'investor', label: 'Investidores' },
  { value: 'buyer', label: 'Compradores' },
]

const PAGE_SIZE = 20

export function ContactsPage() {
  const { contacts, load, remove, search, filterByTag } = useContactsStore()
  const { tasks } = useTasksStore()
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
      title="Contatos"
      subtitle={`${contacts.length} contatos cadastrados`}
      ctaLabel="Novo Contato"
      onCta={() => { setEditing(undefined); setFormOpen(true) }}
    >
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setPage(1) }}
            placeholder="Buscar contato..."
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all min-h-[44px]"
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
                  ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                  : 'bg-white/5 border-white/10 text-slate-500 hover:text-slate-300'
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
                ? 'bg-orange-500/20 border-orange-500/40 text-orange-300'
                : 'bg-white/5 border-white/10 text-slate-500 hover:text-slate-300'
              }
            `}
          >
            <ListFilter size={12} /> Com tarefas
          </button>
        </div>
      </div>

      {/* List */}
      {paginated.length === 0 ? (
        <EmptyState
          icon={<Users size={24} />}
          title="Nenhum contato encontrado"
          description="Adicione seu primeiro contato para começar a gerenciar sua rede."
          ctaLabel="Novo Contato"
          onCta={() => { setEditing(undefined); setFormOpen(true) }}
        />
      ) : (
        <Card className="!p-0 overflow-hidden">
          {paginated.map((c, i) => (
            <div
              key={c.id}
              onClick={() => setViewContact(c)}
              className={`
                flex items-center gap-4 px-6 py-4 transition-colors hover:bg-white/5 row-accent cursor-pointer
                ${i < paginated.length - 1 ? 'border-b border-white/5' : ''}
              `}
            >
              <Avatar name={c.name} photoUrl={c.photoUrl} size="md" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-medium text-slate-100">{c.name}</p>
                  {c.birthdate && isBirthdayThisMonth(c.birthdate) && (
                    <span className="text-sm">🎂</span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {[c.company, formatPhone(c.phone)].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex gap-1.5">
                {c.tags.map(tag => (
                  <Badge key={tag} variant={TAG_VARIANTS[tag]}>{TAG_LABELS[tag]}</Badge>
                ))}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                {/* Badge de tarefas vinculadas */}
                {(() => {
                  const count = tasks.filter(t => t.contactId === c.id).length
                  return (
                    <button
                      onClick={() => setTasksContact(c)}
                      className="relative p-2 rounded-lg hover:bg-indigo-500/10 text-slate-500 hover:text-indigo-400 transition-colors cursor-pointer"
                      title="Ver tarefas vinculadas"
                    >
                      <ClipboardList size={15} />
                      {count > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-indigo-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center">
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
                  className="p-2 rounded-lg hover:bg-green-500/10 text-slate-500 hover:text-green-400 transition-colors"
                  title="Abrir WhatsApp"
                >
                  <MessageCircle size={15} />
                </a>
                <button
                  onClick={() => { setEditing(c); setFormOpen(true) }}
                  className="p-2 rounded-lg hover:bg-white/8 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                  title="Editar"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => setDeleteTarget(c)}
                  className="p-2 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
                  title="Excluir"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-xs text-slate-500">
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
        <p className="text-sm text-slate-400 mb-6">
          Tem certeza que deseja excluir <span className="text-slate-200 font-medium">{deleteTarget?.name}</span>? Esta ação não pode ser desfeita.
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
