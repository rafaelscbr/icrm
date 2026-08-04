import { useState, useEffect } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Calendar, ChevronDown, Check } from 'lucide-react'
import { usePeriodStore, PeriodPreset, rangeFromPreset } from '../../store/usePeriodStore'

/**
 * Seletor de período.
 *
 * Era o overlay mais fraco do sistema: sem `role`, sem `aria-expanded`, sem
 * Escape, sem navegação por teclado — só um `div` com clique fora. Quem navega
 * por teclado abria o menu e ficava preso; quem usa leitor de tela não sabia
 * que havia um menu.
 *
 * Duas trocas resolvem sem mudar um pixel:
 *
 * 1. **Radix Popover** no lugar do `div` + `useEffect` de clique fora. Traz
 *    Escape, clique fora, retorno de foco ao gatilho e `aria-expanded` /
 *    `aria-controls` corretos. É headless: a aparência continua nossa.
 * 2. **Radio nativo** no lugar dos sete `<button>`. Escolher um período é
 *    escolher um de N, e é isso que um `radiogroup` diz. As setas do teclado
 *    passam a funcionar porque são as setas do navegador, não uma reimplementação
 *    nossa — o input existe de verdade, só está visualmente oculto.
 *
 * O painel de datas personalizadas fica dentro do Popover (e não de um
 * DropdownMenu) justamente porque contém campos de formulário: menu com input
 * dentro rouba o foco e o typeahead.
 */

interface PeriodSelectorProps {
  className?: string
}

const PRESETS: { value: PeriodPreset; label: string; sub?: string }[] = [
  { value: 'this_month', label: 'Este mês' },
  { value: 'last_month', label: 'Mês anterior' },
  { value: 'this_year',  label: 'Este ano' },
  { value: 'last_3',     label: 'Últimos 3 meses' },
  { value: 'last_6',     label: 'Últimos 6 meses' },
  { value: 'all',        label: 'Acumulado', sub: 'todos os registros' },
  { value: 'custom',     label: 'Personalizado' },
]

export function PeriodSelector({ className = '' }: PeriodSelectorProps) {
  const { preset, startDate, endDate, setPreset, setCustomRange, getLabel } = usePeriodStore()
  const [open, setOpen] = useState(false)
  const [customStart, setCustomStart] = useState(startDate)
  const [customEnd,   setCustomEnd]   = useState(endDate)

  useEffect(() => {
    if (preset !== 'custom') {
      const range = rangeFromPreset(preset)
      setCustomStart(range.startDate)
      setCustomEnd(range.endDate)
    }
  }, [preset])

  /**
   * Trocar a seleção NÃO fecha o painel.
   *
   * Com radio nativo, a seta do teclado muda a seleção — se a mudança
   * fechasse, quem navega por teclado só conseguiria andar uma casa antes do
   * painel sumir. Como a página refiltra na hora, arrastar pelas setas vira
   * pré-visualização do período.
   *
   * O fechamento é sempre um gesto explícito: clique no rótulo, Enter/Espaço,
   * ou Escape/clique fora (esses dois o Radix já resolve).
   */
  function handlePreset(p: PeriodPreset) {
    setPreset(p)
  }

  /** confirma e fecha — exceto em "Personalizado", que ainda pede as datas */
  function confirmar(p: PeriodPreset) {
    if (p !== 'custom') setOpen(false)
  }

  function applyCustom() {
    if (customStart && customEnd && customStart <= customEnd) {
      setCustomRange(customStart, customEnd)
      setOpen(false)
    }
  }

  const label = getLabel()

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div className={className}>
        <Popover.Trigger asChild>
          <button
            aria-label={`Período: ${label}. Alterar`}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150
                       cursor-pointer min-h-[36px] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            style={{
              background: open ? 'var(--brand-tint)' : 'var(--surface)',
              border: `1px solid ${open ? 'var(--brand)' : 'var(--line-input)'}`,
              color: open ? 'var(--brand-text)' : 'var(--t2)',
            }}
          >
            <Calendar size={13} style={{ color: open ? 'var(--brand)' : 'var(--t3)' }} aria-hidden />
            <span className="max-w-[140px] truncate">{label}</span>
            <ChevronDown
              size={12}
              style={{ color: open ? 'var(--brand)' : 'var(--t4)' }}
              className={`transition-transform duration-200 flex-shrink-0 ${open ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>
        </Popover.Trigger>
      </div>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 w-60 rounded-xl overflow-hidden animate-in"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            boxShadow: 'var(--shadow-dropdown)',
          }}
        >
          <fieldset className="p-1.5 border-0 m-0">
            <legend className="sr-only">Período dos dados</legend>
            {PRESETS.map(({ value, label: optLabel, sub }) => {
              const ativo = preset === value
              return (
                // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- o rótulo embrulha um radio nativo — o teclado entra pelas setas e pelo Enter
                <label
                  key={value}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left cursor-pointer
                             transition-all duration-100 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40"
                  style={{
                    background: ativo ? 'var(--brand-tint)' : 'transparent',
                    color: ativo ? 'var(--brand-text)' : 'var(--t2)',
                  }}
                  onMouseEnter={e => { if (!ativo) e.currentTarget.style.background = 'var(--s2)' }}
                  onMouseLeave={e => { if (!ativo) e.currentTarget.style.background = 'transparent' }}
                  // O clique de ponteiro chega aqui, no rótulo. Seta do teclado
                  // dispara `change` e não `click`, então navegar não fecha —
                  // que é justamente o que queremos.
                  //
                  // A seleção é aplicada AQUI e não só no `change` do radio: o
                  // navegador dispara `change` como ação padrão do clique, ou
                  // seja, depois dos listeners. Como este handler fecha o
                  // painel e o React 19 aplica eventos discretos de forma
                  // síncrona, o input já estaria desmontado — o `change` cairia
                  // num nó solto e o período nunca mudaria.
                  onClick={() => { handlePreset(value); confirmar(value) }}
                >
                  <input
                    type="radio"
                    name="periodo"
                    value={value}
                    checked={ativo}
                    onChange={() => handlePreset(value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmar(value) } }}
                    className="sr-only"
                  />
                  <div
                    className="w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0"
                    style={{
                      borderColor: ativo ? 'var(--brand)' : 'var(--line-strong)',
                      background: ativo ? 'var(--brand-tint)' : 'transparent',
                    }}
                    aria-hidden
                  >
                    {ativo && <Check size={9} style={{ color: 'var(--brand)' }} strokeWidth={3} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium">{optLabel}</span>
                    {sub && <p className="text-[11px] text-t4 leading-none mt-0.5">{sub}</p>}
                  </div>
                </label>
              )
            })}
          </fieldset>

          {preset === 'custom' && (
            <div className="p-3 flex flex-col gap-2" style={{ borderTop: '1px solid var(--line)' }}>
              <div className="grid grid-cols-2 gap-2">
                {(['De', 'Até'] as const).map((lbl, i) => (
                  <div key={lbl}>
                    <label
                      htmlFor={`periodo-${i === 0 ? 'inicio' : 'fim'}`}
                      className="block font-label text-[11px] font-bold uppercase tracking-[0.14em] text-t4 mb-1 px-0.5"
                    >
                      {lbl}
                    </label>
                    <input
                      id={`periodo-${i === 0 ? 'inicio' : 'fim'}`}
                      type="date"
                      value={i === 0 ? customStart : customEnd}
                      max={i === 0 ? (customEnd || undefined) : undefined}
                      min={i === 1 ? (customStart || undefined) : undefined}
                      onChange={e => i === 0 ? setCustomStart(e.target.value) : setCustomEnd(e.target.value)}
                      className="w-full rounded-lg px-2 py-1.5 text-xs text-t1 focus:outline-none
                                 focus-visible:ring-2 focus-visible:ring-brand/40"
                      style={{ background: 'var(--s2)', border: '1px solid var(--line-input)', colorScheme: 'auto' }}
                    />
                  </div>
                ))}
              </div>
              {/* grad-brand carrega o par fundo+texto por tema. `text-white`
                  sobre --brand dava ~2,2:1 no escuro. */}
              <button
                onClick={applyCustom}
                disabled={!customStart || !customEnd || customStart > customEnd}
                className="grad-brand w-full text-sm font-semibold rounded-lg py-2 transition-all
                           disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer
                           hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                Aplicar período
              </button>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
