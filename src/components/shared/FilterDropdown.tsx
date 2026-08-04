import { useState, useRef, useEffect, useMemo, type ComponentType } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { ChevronDown, Check, Search, X } from 'lucide-react'

/**
 * Filtro de uma escolha (ou nenhuma).
 *
 * Três problemas foram corrigidos aqui, todos estruturais:
 *
 * 1. **Semântica que prometia o que não entregava.** O painel declarava
 *    `role="listbox"` com filhos `role="option"`, mas não tinha foco no
 *    container nem navegação por seta. Um leitor de tela anunciava "caixa de
 *    listagem" e o teclado não fazia nada — pior que não ter papel nenhum.
 *    Agora é um `radiogroup` de radios nativos: as setas funcionam porque são
 *    as do navegador.
 * 2. **Botão dentro de botão.** O "x" de limpar era um `<span role="button"
 *    tabIndex={0}>` aninhado no `<button>` do gatilho. HTML inválido, e cada
 *    leitor de tela resolve de um jeito. Agora são dois botões irmãos dentro de
 *    um invólucro que carrega a moldura — visualmente idêntico.
 * 3. **Escape e clique fora à mão.** Passaram para o Radix Popover, junto com
 *    o retorno de foco ao gatilho, que não existia.
 *
 * Popover e não DropdownMenu porque o painel tem campo de busca: menu com
 * input dentro rouba foco e typeahead.
 */

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

let seq = 0

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
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  // nome do grupo de radio: precisa ser único por instância, senão dois
  // filtros na mesma tela compartilhariam a seleção
  const grupo = useRef(`filtro-${label}-${++seq}`).current

  const selected   = value != null ? options.find(o => o.value === value) ?? null : null
  const isActive   = selected != null
  const showSearch = searchable ?? options.length > 7

  useEffect(() => {
    if (open && showSearch) searchRef.current?.focus()
    if (!open) setQuery('')
  }, [open, showSearch])

  const visible = useMemo(() => {
    if (!query.trim()) return options
    const q = query.toLowerCase()
    return options.filter(o => o.label.toLowerCase().includes(q))
  }, [options, query])

  /** troca a seleção sem fechar — é o que a seta do teclado faz */
  function selecionar(v: string | null) {
    onChange(v)
  }

  /** gesto explícito de confirmação: clique no rótulo ou Enter */
  function confirmar() {
    setOpen(false)
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      {/* O invólucro carrega só a moldura, para que o "x" seja irmão do gatilho
          e não um botão dentro de outro.

          A geometria (altura e recuos) fica no BOTÃO, não aqui. Quando ela
          estava no invólucro, o botão encolhia para o tamanho do texto: a
          pílula media 95×36 e a área clicável só 75×16 — 65% do controle era
          zona morta, e clicar na borda não fazia nada. */}
      <div
        className="inline-flex items-center rounded-[12px] transition-all duration-150"
        style={{
          background: isActive ? 'var(--brand-tint)' : open ? 'var(--s2)' : 'var(--surface)',
          border: `1px solid ${isActive ? 'rgba(228,178,60,0.4)' : open ? 'var(--line-strong)' : 'var(--line-input)'}`,
          color: isActive ? 'var(--brand-text)' : 'var(--t2)',
        }}
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            className={`flex items-center gap-1.5 h-11 sm:h-9 pl-2.5 text-xs font-semibold cursor-pointer
                        bg-transparent rounded-[11px]
                        focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40
                        ${isActive ? 'pr-1' : 'pr-2.5'}`}
            style={{ color: 'inherit' }}
          >
            {Icon && <Icon size={13} strokeWidth={1.6} style={{ color: isActive ? 'var(--brand)' : 'var(--t3)' }} />}
            <span className="font-label uppercase tracking-[0.06em] text-[11px] opacity-70">{label}</span>
            {selected && <span className="max-w-[120px] truncate font-heading">{selected.label}</span>}
            {!isActive && (
              <ChevronDown
                size={12}
                style={{ color: 'var(--t4)' }}
                className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                aria-hidden
              />
            )}
          </button>
        </Popover.Trigger>

        {isActive && (
          <button
            type="button"
            aria-label={`Remover filtro ${label}`}
            onClick={() => onChange(null)}
            className="w-9 h-11 sm:h-9 flex items-center justify-center rounded-[11px] hover:bg-brand/20
                       transition-colors cursor-pointer bg-transparent border-0
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <X size={11} strokeWidth={2} style={{ color: 'var(--brand)' }} aria-hidden />
          </button>
        )}
      </div>

      <Popover.Portal>
        <Popover.Content
          align={align === 'right' ? 'end' : 'start'}
          sideOffset={6}
          className="z-50 w-60 rounded-[14px] overflow-hidden animate-in"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            boxShadow: 'var(--shadow-dropdown)',
          }}
        >
          {showSearch && (
            <div className="p-2" style={{ borderBottom: '1px solid var(--line)' }}>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--t4)' }} aria-hidden />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  aria-label={`Buscar ${label.toLowerCase()}`}
                  placeholder={`Buscar ${label.toLowerCase()}...`}
                  className="w-full rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none
                             focus-visible:ring-2 focus-visible:ring-brand/40"
                  style={{ background: 'var(--s2)', border: '1px solid var(--line-input)', color: 'var(--t1)' }}
                />
              </div>
            </div>
          )}

          <fieldset className="p-1.5 max-h-[280px] overflow-y-auto border-0 m-0">
            <legend className="sr-only">{label}</legend>

            <OptionRow
              grupo={grupo}
              active={value == null}
              onSelect={() => selecionar(null)}
              onConfirm={confirmar}
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
                grupo={grupo}
                active={value === opt.value}
                onSelect={() => selecionar(opt.value)}
                onConfirm={confirmar}
                label={opt.label}
                count={opt.count}
                icon={opt.icon}
                dot={opt.dot}
              />
            ))}
          </fieldset>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

/**
 * Por que a seleção é aplicada AQUI, no clique, e não só no `change` do radio.
 *
 * O navegador marca o radio e dispara `change` como *ação padrão* do clique —
 * ou seja, depois que os listeners do clique já rodaram. Como este `onClick`
 * fecha o popover, e o React 19 aplica atualizações de eventos discretos de
 * forma síncrona, o input já foi desmontado quando a ação padrão chega: o
 * `change` acontece num nó solto e o React nunca o enxerga.
 *
 * O sintoma era exatamente este: o painel fechava e o filtro não era aplicado.
 * Chamar a seleção explicitamente antes de fechar resolve. Se o `change`
 * também chegar (quando nada desmonta), ele repete o mesmo valor — inofensivo.
 */
function OptionRow({
  grupo, active, onSelect, onConfirm, label, count, icon: Icon, dot,
}: {
  grupo: string
  active: boolean
  onSelect: () => void
  onConfirm: () => void
  label: string
  count?: number
  icon?: IconType
  dot?: string
}) {
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- o rótulo embrulha um radio nativo — o teclado entra pelas setas e pelo Enter
    <label
      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left cursor-pointer
                 transition-all duration-100 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40"
      style={{
        background: active ? 'var(--brand-tint)' : 'transparent',
        color: active ? 'var(--brand-text)' : 'var(--t2)',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--s2)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
      // clique de ponteiro chega no rótulo; seta do teclado dispara só `change`
      onClick={() => { onSelect(); onConfirm() }}
    >
      <input
        type="radio"
        name={grupo}
        checked={active}
        onChange={onSelect}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onConfirm() } }}
        className="sr-only"
      />
      {/* Aceita classe utilitária ('bg-brand') ou valor CSS ('var(--brand)').
          Os tokens de cor do sistema são var() puro, e nem todo estado tem
          classe Tailwind equivalente. */}
      {dot && (
        dot.startsWith('var(') || dot.startsWith('#') || dot.startsWith('rgb')
          ? <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dot }} aria-hidden />
          : <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} aria-hidden />
      )}
      {Icon && <Icon size={13} strokeWidth={1.6} style={{ color: active ? 'var(--brand)' : 'var(--t3)' }} className="flex-shrink-0" />}
      <span className="flex-1 min-w-0 truncate text-sm font-medium">{label}</span>
      {count != null && (
        <span className="text-[11px] font-semibold tabular-nums flex-shrink-0" style={{ color: active ? 'var(--brand)' : 'var(--t4)' }}>
          {count}
        </span>
      )}
      {active && <Check size={13} strokeWidth={2.4} style={{ color: 'var(--brand)' }} className="flex-shrink-0" aria-hidden />}
    </label>
  )
}
