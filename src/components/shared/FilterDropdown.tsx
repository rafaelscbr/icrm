import { useState, useRef, useEffect, useMemo, type ComponentType } from 'react'
import { ChevronDown, Check, Search, X } from 'lucide-react'

type IconType = ComponentType<{ size?: number; strokeWidth?: number; className?: string; style?: React.CSSProperties }>

export interface FilterOption {
  value: string
  label: string
  count?: number
  icon?: IconType
  /** classe Tailwind para um ponto colorido (ex.: cor da etapa) */
  dot?: string
}

interface FilterDropdownProps {
  /** rótulo neutro quando nada está selecionado (ex.: "Corretor") */
  label: string
  icon?: IconType
  options: FilterOption[]
  value: string | null
  onChange: (v: string | null) => void
  /** rótulo da opção que limpa o filtro (ex.: "Todos" / "Todas") */
  allLabel?: string
  /** mostra um campo de busca interno (auto quando há muitas opções) */
  searchable?: boolean
  align?: 'left' | 'right'
}

export function FilterDropdown({
  label,
  icon: Icon,
  options,
  value,
  onChange,
  allLabel = 'Todos',
  searchable,
  align = 'left',
}: FilterDropdownProps) {
  const [open, setOpen]     = useState(false)
  const [query, setQuery]   = useState('')
  const ref       = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected   = value != null ? options.find(o => o.value === value) ?? null : null
  const isActive   = selected != null
  const showSearch = searchable ?? options.length > 7

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  useEffect(() => {
    if (open && showSearch) searchRef.current?.focus()
    if (!open) setQuery('')
  }, [open, showSearch])

  const visible = useMemo(() => {
    if (!query.trim()) return options
    const q = query.toLowerCase()
    return options.filter(o => o.label.toLowerCase().includes(q))
  }, [options, query])

  function choose(v: string | null) {
    onChange(v)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1.5 h-9 pl-2.5 pr-2 rounded-[12px] text-xs font-semibold transition-all duration-150 cursor-pointer"
        style={{
          background: isActive ? 'var(--brand-tint)' : open ? 'var(--s2)' : 'var(--surface)',
          border: `1px solid ${isActive ? 'rgba(228,178,60,0.4)' : open ? 'var(--line-strong)' : 'var(--line-input)'}`,
          color: isActive ? 'var(--brand-text)' : 'var(--t2)',
        }}
      >
        {Icon && <Icon size={13} strokeWidth={1.6} style={{ color: isActive ? 'var(--brand)' : 'var(--t3)' }} />}
        <span className="font-label uppercase tracking-[0.06em] text-[11px] opacity-70">{label}</span>
        {selected && (
          <span className="max-w-[120px] truncate font-heading">{selected.label}</span>
        )}
        {isActive ? (
          <span
            role="button"
            tabIndex={0}
            aria-label={`Remover filtro ${label}`}
            onClick={e => { e.stopPropagation(); choose(null) }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); choose(null) } }}
            className="ml-0.5 w-4 h-4 flex items-center justify-center rounded-full hover:bg-brand/20 transition-colors"
          >
            <X size={11} strokeWidth={2} style={{ color: 'var(--brand)' }} />
          </span>
        ) : (
          <ChevronDown
            size={12}
            style={{ color: 'var(--t4)' }}
            className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className={`absolute top-full mt-1.5 z-50 w-60 rounded-[14px] overflow-hidden animate-in ${align === 'right' ? 'right-0' : 'left-0'}`}
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            boxShadow: 'var(--shadow-dropdown)',
          }}
          role="listbox"
        >
          {showSearch && (
            <div className="p-2" style={{ borderBottom: '1px solid var(--line)' }}>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--t4)' }} />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={`Buscar ${label.toLowerCase()}...`}
                  className="w-full rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none"
                  style={{ background: 'var(--s2)', border: '1px solid var(--line-input)', color: 'var(--t1)' }}
                />
              </div>
            </div>
          )}

          <div className="p-1.5 max-h-[280px] overflow-y-auto">
            {/* Opção "Todos" */}
            <OptionRow
              active={value == null}
              onClick={() => choose(null)}
              label={allLabel}
            />

            {visible.length === 0 && (
              <p className="px-3 py-4 text-center text-xs" style={{ color: 'var(--t4)' }}>
                Nada encontrado
              </p>
            )}

            {visible.map(opt => (
              <OptionRow
                key={opt.value}
                active={value === opt.value}
                onClick={() => choose(opt.value)}
                label={opt.label}
                count={opt.count}
                icon={opt.icon}
                dot={opt.dot}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function OptionRow({
  active, onClick, label, count, icon: Icon, dot,
}: {
  active: boolean
  onClick: () => void
  label: string
  count?: number
  icon?: IconType
  dot?: string
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all duration-100 cursor-pointer"
      style={{
        background: active ? 'var(--brand-tint)' : 'transparent',
        color: active ? 'var(--brand-text)' : 'var(--t2)',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--s2)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      {dot && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />}
      {Icon && <Icon size={13} strokeWidth={1.6} style={{ color: active ? 'var(--brand)' : 'var(--t3)' }} className="flex-shrink-0" />}
      <span className="flex-1 min-w-0 truncate text-sm font-medium">{label}</span>
      {count != null && (
        <span className="text-[11px] font-semibold tabular-nums flex-shrink-0" style={{ color: active ? 'var(--brand)' : 'var(--t4)' }}>
          {count}
        </span>
      )}
      {active && <Check size={13} strokeWidth={2.4} style={{ color: 'var(--brand)' }} className="flex-shrink-0" />}
    </button>
  )
}
