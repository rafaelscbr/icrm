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
  const inputRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  // Stores
  const contacts = useContactsStore(s => s.contacts)
  const properties = usePropertiesStore(s => s.properties)
  const leads = useCampaignLeadsStore(s => s.leads)
  const tasks = useTasksStore(s => s.tasks)
  const campaigns = useCampaignsStore(s => s.campaigns)

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      // Small delay to let the animation start before focusing
      const t = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Close on overlay click
  const handleOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) onClose()
  }, [onClose])

  // ── Filtered results ────────────────────────────────────────────────────────
  const q = query.trim().toLowerCase()

  const filteredContacts = q
    ? contacts
        .filter(c =>
          c.name.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          (c.company ?? '').toLowerCase().includes(q)
        )
        .slice(0, MAX_PER_SECTION)
    : []

  const filteredProperties = q
    ? properties
        .filter(p =>
          p.name.toLowerCase().includes(q) ||
          p.neighborhood.toLowerCase().includes(q) ||
          (p.developmentName ?? '').toLowerCase().includes(q)
        )
        .slice(0, MAX_PER_SECTION)
    : []

  const filteredLeads = q
    ? leads
        .filter(l =>
          l.name.toLowerCase().includes(q) ||
          l.phone.includes(q) ||
          (l.email ?? '').toLowerCase().includes(q)
        )
        .slice(0, MAX_PER_SECTION)
    : []

  const filteredTasks = q
    ? tasks
        .filter(t =>
          t.title.toLowerCase().includes(q) ||
          (t.description ?? '').toLowerCase().includes(q)
        )
        .slice(0, MAX_PER_SECTION)
    : []

  const hasResults =
    filteredContacts.length > 0 ||
    filteredProperties.length > 0 ||
    filteredLeads.length > 0 ||
    filteredTasks.length > 0

  // ── Navigation helpers ──────────────────────────────────────────────────────
  function go(path: string) {
    navigate(path)
    onClose()
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function getCampaignName(campaignId: string) {
    return campaigns.find(c => c.id === campaignId)?.name ?? 'Campanha'
  }

  function formatDueDate(date?: string) {
    if (!date) return ''
    // date is YYYY-MM-DD
    const [y, m, d] = date.split('-')
    return `${d}/${m}/${y}`
  }

  if (!isOpen) return null

  return (
    // Full-screen overlay
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-black/60 backdrop-blur-sm"
    >
      {/* Command palette card */}
      <div className="w-full max-w-xl bg-[#1A1D27] border border-white/10 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden animate-in">

        {/* Search input row */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/8">
          <Search size={16} className="text-slate-500 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar contatos, imóveis, leads, tarefas…"
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-600 outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-slate-600 hover:text-slate-400 transition-colors flex-shrink-0"
            >
              <X size={14} />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-white/10 text-[10px] text-slate-600 font-mono flex-shrink-0">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {!q && (
            <div className="px-4 py-8 text-center text-xs text-slate-600">
              Digite para buscar em todo o CRM
            </div>
          )}

          {q && !hasResults && (
            <div className="px-4 py-8 text-center text-xs text-slate-600">
              Nenhum resultado para &ldquo;{query}&rdquo;
            </div>
          )}

          {/* Contatos */}
          {filteredContacts.length > 0 && (
            <Section
              icon={<Users size={12} className="text-blue-400" />}
              label="Contatos"
            >
              {filteredContacts.map(c => (
                <ResultRow
                  key={c.id}
                  icon={<Users size={13} className="text-blue-400/70" />}
                  title={c.name}
                  subtitle={c.phone}
                  onClick={() => go('/contatos')}
                />
              ))}
            </Section>
          )}

          {/* Imóveis */}
          {filteredProperties.length > 0 && (
            <Section
              icon={<Building2 size={12} className="text-cyan-400" />}
              label="Imóveis"
            >
              {filteredProperties.map(p => (
                <ResultRow
                  key={p.id}
                  icon={<Building2 size={13} className="text-cyan-400/70" />}
                  title={p.name}
                  subtitle={p.neighborhood}
                  onClick={() => go('/imoveis')}
                />
              ))}
            </Section>
          )}

          {/* Leads */}
          {filteredLeads.length > 0 && (
            <Section
              icon={<Megaphone size={12} className="text-pink-400" />}
              label="Leads"
            >
              {filteredLeads.map(l => (
                <ResultRow
                  key={l.id}
                  icon={<Megaphone size={13} className="text-pink-400/70" />}
                  title={l.name}
                  subtitle={`${l.phone} · ${getCampaignName(l.campaignId)}`}
                  onClick={() => go('/campanhas')}
                />
              ))}
            </Section>
          )}

          {/* Tarefas */}
          {filteredTasks.length > 0 && (
            <Section
              icon={<CheckSquare size={12} className="text-orange-400" />}
              label="Tarefas"
            >
              {filteredTasks.map(t => (
                <ResultRow
                  key={t.id}
                  icon={<CheckSquare size={13} className="text-orange-400/70" />}
                  title={t.title}
                  subtitle={t.dueDate ? `Vence em ${formatDueDate(t.dueDate)}` : 'Sem prazo'}
                  onClick={() => go('/tarefas')}
                />
              ))}
            </Section>
          )}

          {/* Bottom padding */}
          {hasResults && <div className="h-2" />}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-white/8 flex items-center gap-3 text-[10px] text-slate-700">
          <span><kbd className="font-mono">↵</kbd> selecionar</span>
          <span><kbd className="font-mono">esc</kbd> fechar</span>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Section({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-1">
        {icon}
        <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div>{children}</div>
    </div>
  )
}

function ResultRow({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors text-left group"
    >
      <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 group-hover:bg-white/8 transition-colors">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-200 truncate leading-tight">{title}</p>
        <p className="text-[11px] text-slate-600 truncate leading-tight mt-0.5">{subtitle}</p>
      </div>
    </button>
  )
}
