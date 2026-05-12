import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Users, Building2, Megaphone, CheckSquare, X } from 'lucide-react'
import { useContactsStore } from '../../store/useContactsStore'
import { usePropertiesStore } from '../../store/usePropertiesStore'
import { useCampaignLeadsStore } from '../../store/useCampaignLeadsStore'
import { useTasksStore } from '../../store/useTasksStore'
import { useCampaignsStore } from '../../store/useCampaignsStore'

interface GlobalSearchProps {
  isOpen: boolean
  onClose: () => void
}

const MAX_PER_SECTION = 5

export function GlobalSearch({ isOpen, onClose }: GlobalSearchProps) {
  const [query, setQuery] = useState('')
  const inputRef   = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const navigate   = useNavigate()

  const contacts   = useContactsStore(s => s.contacts)
  const properties = usePropertiesStore(s => s.properties)
  const leads      = useCampaignLeadsStore(s => s.leads)
  const tasks      = useTasksStore(s => s.tasks)
  const campaigns  = useCampaignsStore(s => s.campaigns)

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      const t = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  const handleOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) onClose()
  }, [onClose])

  const q = query.trim().toLowerCase()

  const filteredContacts   = q ? contacts.filter(c =>
    c.name.toLowerCase().includes(q) || c.phone.includes(q) || (c.company ?? '').toLowerCase().includes(q)
  ).slice(0, MAX_PER_SECTION) : []

  const filteredProperties = q ? properties.filter(p =>
    p.name.toLowerCase().includes(q) || p.neighborhood.toLowerCase().includes(q) || (p.developmentName ?? '').toLowerCase().includes(q)
  ).slice(0, MAX_PER_SECTION) : []

  const filteredLeads      = q ? leads.filter(l =>
    l.name.toLowerCase().includes(q) || l.phone.includes(q) || (l.email ?? '').toLowerCase().includes(q)
  ).slice(0, MAX_PER_SECTION) : []

  const filteredTasks      = q ? tasks.filter(t =>
    t.title.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q)
  ).slice(0, MAX_PER_SECTION) : []

  const hasResults = filteredContacts.length > 0 || filteredProperties.length > 0 ||
    filteredLeads.length > 0 || filteredTasks.length > 0

  function go(path: string) { navigate(path); onClose() }
  function goWithModal(basePath: string, id: string) { navigate(`${basePath}?open=${id}`); onClose() }
  function getCampaignName(id: string) { return campaigns.find(c => c.id === id)?.name ?? 'Campanha' }
  function fmtDate(date?: string) {
    if (!date) return ''
    const [y, m, d] = date.split('-')
    return `${d}/${m}/${y}`
  }

  if (!isOpen) return null

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-black/55 backdrop-blur-sm"
    >
      <div
        className="w-full max-w-xl rounded-2xl overflow-hidden animate-in"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          boxShadow: 'var(--shadow-modal)',
        }}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: '1px solid var(--line)' }}>
          <Search size={16} className="text-t3 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar contatos, imóveis, leads, tarefas…"
            className="flex-1 bg-transparent text-sm text-t1 placeholder-t4 outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-t4 hover:text-t2 transition-colors flex-shrink-0">
              <X size={14} />
            </button>
          )}
          <kbd
            className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] text-t4 font-mono flex-shrink-0"
            style={{ background: 'var(--s2)', border: '1px solid var(--line)' }}
          >
            esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {!q && (
            <div className="px-4 py-10 text-center text-xs text-t4">
              Digite para buscar em todo o CRM
            </div>
          )}
          {q && !hasResults && (
            <div className="px-4 py-10 text-center text-xs text-t3">
              Nenhum resultado para &ldquo;{query}&rdquo;
            </div>
          )}

          {filteredContacts.length > 0 && (
            <Section icon={<Users size={12} className="text-brand" />} label="Contatos">
              {filteredContacts.map(c => (
                <ResultRow key={c.id} icon={<Users size={13} className="text-brand" />}
                  title={c.name} subtitle={c.phone} tag="Ver contato"
                  onClick={() => goWithModal('/contatos', c.id)} />
              ))}
            </Section>
          )}

          {filteredProperties.length > 0 && (
            <Section icon={<Building2 size={12} className="text-cyan-400" />} label="Imóveis">
              {filteredProperties.map(p => (
                <ResultRow key={p.id} icon={<Building2 size={13} className="text-cyan-400" />}
                  title={p.name} subtitle={p.neighborhood} tag="Ver imóvel"
                  onClick={() => goWithModal('/imoveis', p.id)} />
              ))}
            </Section>
          )}

          {filteredLeads.length > 0 && (
            <Section icon={<Megaphone size={12} className="text-violet-400" />} label="Leads">
              {filteredLeads.map(l => (
                <ResultRow key={l.id} icon={<Megaphone size={13} className="text-violet-400" />}
                  title={l.name} subtitle={`${l.phone} · ${getCampaignName(l.campaignId)}`} tag="Ver campanha"
                  onClick={() => go(`/campanhas?id=${l.campaignId}`)} />
              ))}
            </Section>
          )}

          {filteredTasks.length > 0 && (
            <Section icon={<CheckSquare size={12} className="text-warning" />} label="Tarefas">
              {filteredTasks.map(t => (
                <ResultRow key={t.id} icon={<CheckSquare size={13} className="text-warning" />}
                  title={t.title} subtitle={t.dueDate ? `Vence em ${fmtDate(t.dueDate)}` : 'Sem prazo'} tag="Ver tarefas"
                  onClick={() => go('/tarefas')} />
              ))}
            </Section>
          )}

          {hasResults && <div className="h-2" />}
        </div>

        {/* Footer */}
        <div
          className="px-4 py-2 flex items-center gap-3 text-[10px] text-t4"
          style={{ borderTop: '1px solid var(--line)' }}
        >
          <span><kbd className="font-mono">↵</kbd> selecionar</span>
          <span><kbd className="font-mono">esc</kbd> fechar</span>
        </div>
      </div>
    </div>
  )
}

function Section({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 px-4 pt-3 pb-1.5">
        {icon}
        <span className="text-[10px] font-semibold text-t3 uppercase tracking-wider">{label}</span>
      </div>
      <div>{children}</div>
    </div>
  )
}

function ResultRow({ icon, title, subtitle, tag, onClick }: {
  icon: React.ReactNode; title: string; subtitle: string; tag?: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-left group transition-colors"
      style={{ background: 'transparent' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--s2)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
        style={{ background: 'var(--s2)' }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-t1 truncate leading-tight">{title}</p>
        <p className="text-[11px] text-t3 truncate leading-tight mt-0.5">{subtitle}</p>
      </div>
      {tag && (
        <span
          className="flex-shrink-0 text-[10px] px-2 py-0.5 rounded font-medium transition-colors"
          style={{ color: 'var(--brand)', background: 'var(--brand-tint)', border: '1px solid var(--brand)/20' }}
        >
          {tag}
        </span>
      )}
    </button>
  )
}
