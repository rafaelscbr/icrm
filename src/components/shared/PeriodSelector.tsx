import { useState, useRef, useEffect } from 'react'
import { Calendar, ChevronDown, Check } from 'lucide-react'
import { usePeriodStore, PeriodPreset, rangeFromPreset } from '../../store/usePeriodStore'

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
  const [open, setOpen]           = useState(false)
  const [customStart, setCustomStart] = useState(startDate)
  const [customEnd,   setCustomEnd]   = useState(endDate)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (preset !== 'custom') {
      const range = rangeFromPreset(preset)
      setCustomStart(range.startDate)
      setCustomEnd(range.endDate)
    }
  }, [preset])

  function handlePreset(p: PeriodPreset) {
    setPreset(p)
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
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer min-h-[36px]"
        style={{
          background: open ? 'var(--brand-tint)' : 'var(--surface)',
          border: `1px solid ${open ? 'var(--brand)' : 'var(--line-input)'}`,
          color: open ? 'var(--brand-text)' : 'var(--t2)',
        }}
      >
        <Calendar size={13} style={{ color: open ? 'var(--brand)' : 'var(--t3)' }} />
        <span className="max-w-[140px] truncate">{label}</span>
        <ChevronDown
          size={12}
          style={{ color: open ? 'var(--brand)' : 'var(--t4)' }}
          className={`transition-transform duration-200 flex-shrink-0 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 z-50 w-60 rounded-xl overflow-hidden animate-in"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            boxShadow: 'var(--shadow-dropdown)',
          }}
        >
          <div className="p-1.5">
            {PRESETS.map(({ value, label: optLabel, sub }) => (
              <button
                key={value}
                onClick={() => handlePreset(value)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-100 cursor-pointer"
                style={{
                  background: preset === value ? 'var(--brand-tint)' : 'transparent',
                  color: preset === value ? 'var(--brand-text)' : 'var(--t2)',
                }}
                onMouseEnter={e => { if (preset !== value) e.currentTarget.style.background = 'var(--s2)' }}
                onMouseLeave={e => { if (preset !== value) e.currentTarget.style.background = 'transparent' }}
              >
                <div
                  className="w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0"
                  style={{
                    borderColor: preset === value ? 'var(--brand)' : 'var(--line-strong)',
                    background: preset === value ? 'var(--brand-tint)' : 'transparent',
                  }}
                >
                  {preset === value && <Check size={9} style={{ color: 'var(--brand)' }} strokeWidth={3} />}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium">{optLabel}</span>
                  {sub && <p className="text-[10px] text-t4 leading-none mt-0.5">{sub}</p>}
                </div>
              </button>
            ))}
          </div>

          {preset === 'custom' && (
            <div className="p-3 flex flex-col gap-2" style={{ borderTop: '1px solid var(--line)' }}>
              <div className="grid grid-cols-2 gap-2">
                {(['De', 'Até'] as const).map((lbl, i) => (
                  <div key={lbl}>
                    <p className="text-[10px] text-t4 uppercase tracking-wider mb-1 px-0.5">{lbl}</p>
                    <input
                      type="date"
                      value={i === 0 ? customStart : customEnd}
                      max={i === 0 ? (customEnd || undefined) : undefined}
                      min={i === 1 ? (customStart || undefined) : undefined}
                      onChange={e => i === 0 ? setCustomStart(e.target.value) : setCustomEnd(e.target.value)}
                      className="w-full rounded-lg px-2 py-1.5 text-xs text-t1 focus:outline-none"
                      style={{ background: 'var(--s2)', border: '1px solid var(--line-input)', colorScheme: 'auto' }}
                    />
                  </div>
                ))}
              </div>
              <button
                onClick={applyCustom}
                disabled={!customStart || !customEnd || customStart > customEnd}
                className="w-full text-sm font-semibold rounded-lg py-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-white"
                style={{ background: 'var(--brand)' }}
              >
                Aplicar período
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
