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

  // Fecha ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Sincroniza inputs quando o preset muda externamente
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
      {/* ── Trigger ──────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer border min-h-[38px]
          ${open
            ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
            : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/8 hover:border-white/20'
          }`}
      >
        <Calendar size={13} className={open ? 'text-indigo-400' : 'text-slate-500'} />
        <span className="max-w-[140px] truncate">{label}</span>
        <ChevronDown
          size={12}
          className={`text-slate-500 transition-transform duration-200 flex-shrink-0 ${open ? 'rotate-180 text-indigo-400' : ''}`}
        />
      </button>

      {/* ── Dropdown ─────────────────────────────────────────────── */}
      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-60 bg-[#1A1D27] border border-white/10 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">

          {/* Presets */}
          <div className="p-1.5">
            {PRESETS.map(({ value, label: optLabel, sub }) => (
              <button
                key={value}
                onClick={() => handlePreset(value)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-100 cursor-pointer group
                  ${preset === value
                    ? 'bg-indigo-500/15 text-indigo-300'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  }`}
              >
                <div className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 transition-all
                  ${preset === value ? 'border-indigo-400 bg-indigo-500/20' : 'border-white/20 group-hover:border-white/40'}`}>
                  {preset === value && <Check size={9} className="text-indigo-400" strokeWidth={3} />}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium">{optLabel}</span>
                  {sub && <p className="text-[10px] text-slate-600 leading-none mt-0.5">{sub}</p>}
                </div>
              </button>
            ))}
          </div>

          {/* Custom range inputs */}
          {preset === 'custom' && (
            <div className="border-t border-white/8 p-3 flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-1 px-0.5">De</p>
                  <input
                    type="date"
                    value={customStart}
                    max={customEnd || undefined}
                    onChange={e => setCustomStart(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 cursor-pointer"
                  />
                </div>
                <div>
                  <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-1 px-0.5">Até</p>
                  <input
                    type="date"
                    value={customEnd}
                    min={customStart || undefined}
                    onChange={e => setCustomEnd(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 cursor-pointer"
                  />
                </div>
              </div>
              <button
                onClick={applyCustom}
                disabled={!customStart || !customEnd || customStart > customEnd}
                className="w-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-sm font-medium rounded-xl py-2 hover:bg-indigo-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
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
